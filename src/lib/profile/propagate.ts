import { publishToChannel } from '@/lib/chat/signal';
import { isRtcEnabled } from '@/lib/rtc/channelsConfig';
import { applyParticipantIdentity, loadAllPresence } from '@/lib/rtc/presence';
import { livekitApi } from '@/lib/rtc/server';
import { channelsIdentity, type ChannelsIdentity, type ProfileMaskSource } from './identity';
import { forgetChannelsIdentity } from './query';

/**
 * Salvou o perfil — agora TODO MUNDO precisa ver, sem recarregar nada.
 *
 * São três superfícies com três donos diferentes, e nenhuma delas descobre
 * sozinha que a máscara mudou:
 *
 * 1. QUEM ESTÁ NA MESMA SALA DE VOZ lê nome e avatar do próprio participante do
 *    LiveKit (`participant.name` e o `metadata`, ver lib/rtc/participant.ts) —
 *    carimbados no token, no join. `updateParticipant` reescreve os dois no
 *    servidor do LiveKit, que faz o broadcast; o `useParticipants` do
 *    @livekit/components-react re-renderiza sozinho nos eventos de nome e
 *    metadata. Sem isto, o card de voz mostraria o nome antigo até a pessoa
 *    sair e voltar do canal.
 *
 * 2. A SIDEBAR DE USUÁRIOS e AS MENSAGENS JÁ NA TELA vêm de DTOs do nosso
 *    servidor, que o cliente busca e guarda. O evento `profile` no barramento
 *    do chat é o empurrão pra eles buscarem de novo — a sidebar tem um poll de
 *    30s que já corrigiria, mas 30s olhando pro nome antigo é tempo demais pra
 *    parecer que salvou.
 *
 * 3. QUEM MUDOU vê tudo pelo UserDTO, que é prop de Server Component (ver
 *    flows/channel/index.tsx), e o servidor não alcança prop daqui — quem chama
 *    resolve com `router.refresh()` depois do save. Só que o refresh é um RSC
 *    inteiro atrás de um POST que ainda espera o LiveKit logo abaixo, e nesse
 *    intervalo a pessoa veria a lista de usuários já com a foto nova e o
 *    próprio cartão dela com a antiga. Por isso o evento `profile` do item 2
 *    também serve pra ela: `useSelfIdentity` o escuta e resolve a identidade do
 *    próprio usuário sem esperar a prop (o autor recebe o próprio broadcast).
 *
 * Nada aqui é crítico o bastante pra derrubar o save — a máscara já está no
 * banco quando isto roda. Falha em qualquer passo só atrasa a propagação até o
 * próximo poll/join.
 */
export async function propagateProfileChange(userId: string, source: ProfileMaskSource): Promise<void> {
  const identity = channelsIdentity(source);

  // Antes de qualquer publicação: o cache do caminho quente (o "está
  // digitando") responderia com a identidade velha por até um minuto, e o
  // rodapé do chat contradiria a mensagem logo acima dele.
  forgetChannelsIdentity(userId);

  publishToChannel({ type: 'profile', user: { id: userId, ...identity } });

  await syncVoiceParticipant(userId, identity).catch((error) => {
    console.error('[profile] falhou ao propagar pro LiveKit', error);
  });
}

/**
 * O identity do participante no LiveKit é o id do usuário (ver rtc/join), então
 * a busca é direta — mas só depois de achar EM QUE sala ele está: o LiveKit não
 * tem "me diga onde este participante está", e chamar `getParticipant` em cada
 * canal custaria uma ida por canal.
 *
 * O metadata é REESCRITO inteiro pelo `updateParticipant`, e ele carrega
 * `isAdmin` junto do avatar — daí o `getParticipant` antes, pra devolver o
 * campo que não é nosso. Perder o `isAdmin` aqui tiraria do channels_admin o
 * botão de desconectar exatamente enquanto a pessoa está na sala.
 */
async function syncVoiceParticipant(userId: string, identity: ChannelsIdentity): Promise<void> {
  if (!(await isRtcEnabled())) return;

  const snapshot = await loadAllPresence();
  const channelId = Object.entries(snapshot).find(([, participants]) =>
    participants.some((participant) => participant.identity === userId),
  )?.[0];
  if (!channelId) return;

  const current = await livekitApi().room.getParticipant(channelId, userId);
  const metadata = parseParticipantMetadata(current.metadata);

  await livekitApi().room.updateParticipant(channelId, userId, {
    name: identity.username,
    // `discordUsername` entra e SAI daqui: quem tira o apelido no meio da
    // chamada precisa que a linha em miúdo do popover suma junto, senão sobra
    // um username embaixo do próprio nome dele.
    metadata: JSON.stringify({ ...metadata, avatar: identity.avatar, discordUsername: identity.discordUsername ?? undefined }),
  });

  // O `updateParticipant` acima avisa quem está DENTRO da sala (o LiveKit faz o
  // broadcast, e o useParticipants re-renderiza sozinho). Quem está de FORA vê
  // a mesma sala pela lista da sidebar, que lê o store de presença — e esse
  // store só aprende por webhook, que não existe pra mudança de participante.
  // Sem esta linha, os dois públicos da mesma sala divergem por até 30s.
  applyParticipantIdentity(channelId, userId, {
    name: identity.username,
    avatar: identity.avatar,
    discordUsername: identity.discordUsername ?? undefined,
  });
}

function parseParticipantMetadata(metadata: string | undefined): Record<string, unknown> {
  if (!metadata) return {};
  try {
    const parsed = JSON.parse(metadata) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
