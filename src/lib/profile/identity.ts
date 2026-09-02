import { publicR2Url } from '@/lib/r2/publicUrl';

/**
 * A MÁSCARA DE PERFIL.
 *
 * `User.username` e `User.avatar` são do Discord e voltam a ser do Discord a
 * cada login (authOptions.ts reescreve os dois no `update` do signIn). Por cima
 * deles o usuário pode pôr um apelido e uma foto próprios — que não substituem
 * nada no banco, só cobrem o que o /channels renderiza.
 *
 * ONDE A MÁSCARA VALE: os canais inteiros (sidebar de usuários, chat, cards de
 * voz, convite por DM).
 *
 * ONDE NÃO VALE: /admin — quem modera precisa saber quem é quem de verdade.
 *
 * ESTA FUNÇÃO É A REGRA INTEIRA, e roda nos dois lados: o servidor a aplica ao
 * montar os DTOs (presença, mensagem, token do LiveKit) e o cliente a aplica no
 * UserDTO, que carrega os campos crus. Duas cópias da regra é como um lugar do
 * app acabaria mostrando o apelido e o vizinho mostrando o Discord.
 */

/** O que qualquer origem precisa ter pra passar por `channelsIdentity`. */
export interface ProfileMaskSource {
  username: string;
  avatar: string;
  displayName: string | null;
  /** Key do objeto no R2, não URL — ver o comentário de `displayAvatar` no schema. */
  displayAvatar: string | null;
  useDiscordProfile: boolean;
}

export interface ChannelsIdentity {
  username: string;
  avatar: string;
  /**
   * O username do Discord, e SÓ quando ele está escondido atrás de um apelido —
   * é o que os popovers mostram em miúdo embaixo do nome, pra ninguém se perder
   * de quem é quem.
   *
   * `null` quando não há o que revelar: sem máscara, ou com máscara só de foto,
   * o nome grande JÁ É o do Discord, e repetir a mesma string duas vezes na
   * mesma linha não informa nada.
   *
   * Viaja junto da identidade em vez de sair de uma segunda função porque quem
   * mostra o nome é exatamente quem mostra isto — separá-los seria abrir espaço
   * pra um lugar do app resolver um e esquecer o outro.
   */
  discordUsername: string | null;
}

/**
 * `select` do Prisma pra quem vai chamar `channelsIdentity` — mantém junto os
 * cinco campos que a regra precisa, pra nenhuma query esquecer um e degradar
 * silenciosamente pro Discord.
 */
export const PROFILE_MASK_SELECT = {
  username: true,
  avatar: true,
  displayName: true,
  displayAvatar: true,
  useDiscordProfile: true,
} as const;

/**
 * Como esta pessoa aparece nos canais.
 *
 * O SWITCH GOVERNA OS DOIS CAMPOS. Ligado, a pessoa aparece com o nome E a foto
 * do Discord, mesmo havendo apelido e foto salvos; desligado, a máscara cobre
 * os dois. É o que o rótulo dele sempre disse — "usar meu perfil do Discord",
 * e perfil é nome com foto.
 *
 * Já foi o contrário: a foto valia com o switch ligado ou não, e voltar pra do
 * Discord era apagar a foto no botão "Remover". A justificativa era que amarrar
 * as duas ao mesmo interruptor obrigaria a REENVIAR a foto depois de uma ida e
 * volta no switch — e isso não era verdade. O switch é porta de renderização,
 * não delete: `displayAvatar` continua no banco enquanto ele está ligado,
 * exatamente como `displayName` continua. Desligar traz as duas de volta, sem
 * reenvio. O que sobrava era um interruptor que falava de "perfil" e mexia em
 * metade dele — quem ligava via o nome do Discord ao lado da própria foto.
 *
 * "Remover" continua existindo e continua sendo outra coisa: ele APAGA a foto
 * (some do R2, ver `deleteAvatar`), enquanto o switch só para de mostrá-la.
 *
 * Campo vazio cai no Discord sozinho, nos dois casos.
 */
export function channelsIdentity(source: ProfileMaskSource): ChannelsIdentity {
  if (source.useDiscordProfile) {
    return { username: source.username, avatar: source.avatar, discordUsername: null };
  }

  return {
    username: source.displayName || source.username,
    avatar: source.displayAvatar ? publicR2Url(source.displayAvatar) : source.avatar,
    // Só quando o APELIDO está em uso: máscara de foto sozinha não esconde o
    // nome, então não há nada pra revelar embaixo dele.
    discordUsername: source.displayName ? source.username : null,
  };
}

export const NICKNAME_MIN_LENGTH = 2;
export const NICKNAME_MAX_LENGTH = 32;

/**
 * Apelido NÃO é único de propósito: é máscara, não identidade. Menção e busca
 * do chat resolvem por id (ver `mentions` em lib/chat/dto.ts), então dois "Zé"
 * na sidebar não quebram nada — só ficam iguais.
 *
 * Aceita espaço e acento; corta espaço nas pontas e colapsa o do meio, pra
 * ninguém empurrar a linha da sidebar com uma corrida de espaços. Quebra de
 * linha e caractere de controle são rejeitados pelo mesmo motivo — o nome é uma
 * linha só, em toda superfície que o mostra.
 */
export function normalizeNickname(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}

const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

export function isValidNickname(nickname: string): boolean {
  if (nickname.length < NICKNAME_MIN_LENGTH || nickname.length > NICKNAME_MAX_LENGTH) return false;
  return !CONTROL_CHARS.test(nickname);
}
