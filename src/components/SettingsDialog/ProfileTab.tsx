'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Avatar from '@/components/Avatar';
import { HugeIcon } from '@/components/HugeIcon';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/use-toast';
import type { UserDTO } from '@/app/api/user/types';
import { isAnimatedImage } from '@/lib/profile/animatedImage';
import type { CropRect } from '@/lib/profile/avatarStorage';
import { channelsIdentity, NICKNAME_MAX_LENGTH } from '@/lib/profile/identity';
import { publicR2Url } from '@/lib/r2/publicUrl';
import ProfileAvatarCropper from './ProfileAvatarCropper';

/**
 * A MÁSCARA DE PERFIL do /channels: apelido e foto que cobrem o que vem do
 * Discord, sem substituir (ver lib/profile/identity.ts).
 *
 * O que esta aba salva vale em /channels inteiro e em mais nada — o /lol e o
 * /admin continuam mostrando o Discord de propósito, e é isso que o rodapé da
 * aba diz em uma linha.
 *
 * Os campos são INDEPENDENTES: só apelido, só foto, ou os dois. Campo vazio cai
 * no Discord sozinho, o que é o motivo de não existir um "remover apelido" —
 * apagar o texto e salvar já é isso.
 */

const ACCEPTED = 'image/png,image/jpeg,image/gif,image/webp,image/avif';

/** Espelha MAX_AVATAR_BYTES do servidor só pra recusar antes de subir 10MB à toa. */
const MAX_BYTES = 10 * 1024 * 1024;

const ERROR_MESSAGES: Record<string, string> = {
  UNSUPPORTED_CONTENT_TYPE: 'Formato não aceito. Use PNG, JPG, GIF, WebP ou AVIF.',
  INVALID_IMAGE_BYTES: 'Esse arquivo não é uma imagem válida.',
  IMAGE_TOO_LARGE: 'A imagem passa de 10 MB.',
  ANIMATION_TOO_HEAVY: 'Esse GIF fica pesado demais depois de enquadrado. Tente um com menos quadros.',
  INVALID_NICKNAME: `O apelido precisa ter de 2 a ${NICKNAME_MAX_LENGTH} caracteres.`,
  RATE_LIMITED: 'Calma aí — espere um pouco antes de tentar de novo.',
};

interface ProfileMaskState {
  displayName: string | null;
  displayAvatar: string | null;
  useDiscordProfile: boolean;
}

/**
 * O que as quatro rotas devolvem: a máscara salva, ou um código de erro. O
 * `retryAfterMs` só vem no 429, e é o que transforma "espere um pouco" no
 * número de segundos que a rota já sabe (ver os freios em api/user/profile).
 */
type ProfileResponse = ProfileMaskState & { error?: string; retryAfterMs?: number };

export default function ProfileTab({ user }: { user: UserDTO | null }) {
  const router = useRouter();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [mask, setMask] = useState<ProfileMaskState>({
    displayName: user?.displayName ?? null,
    displayAvatar: user?.displayAvatar ?? null,
    useDiscordProfile: user?.useDiscordProfile ?? true,
  });
  const [nickname, setNickname] = useState(user?.displayName ?? '');
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [savingAvatar, setSavingAvatar] = useState(false);
  const [savingName, setSavingName] = useState(false);

  if (!user) return null;

  // Cópia em `const` porque o TypeScript não mantém o estreitamento de um
  // PARÂMETRO dentro de closure (só de `const`), e o `user.username` das
  // mensagens de confirmação mora dentro dos handlers — o guard de `null` logo
  // acima não alcança lá dentro.
  const discordUsername = user.username;

  // Como esta pessoa aparece pros outros, com o estado local por cima — mesma
  // função que decide o nome na sidebar e no chat. Serve ao NOME desta aba (e
  // às iniciais do círculo); a FOTO do círculo não sai daqui, ver logo abaixo.
  const identity = channelsIdentity({ username: user.username, avatar: user.avatar, ...mask });
  // O switch governa apelido E foto (ver channelsIdentity), então ele aparece
  // quando existe QUALQUER uma das duas. Amarrá-lo só ao apelido — como era
  // enquanto ele mexia só no nome — deixava quem tem só foto sem interruptor
  // nenhum: a única saída pro Discord seria "Remover", que apaga a foto do R2
  // em vez de guardá-la. Continua valendo o contrário também: sem máscara
  // alguma ele some, porque aí não há o que alternar.
  const podeVoltarProDiscord = Boolean(mask.displayName || mask.displayAvatar);
  const nicknameDirty = nickname.trim() !== (mask.displayName ?? '');

  function fail(response: Pick<ProfileResponse, 'error' | 'retryAfterMs'> | null) {
    const code = response?.error ?? '';
    // A espera dita em segundos, e não "um pouco": o switch volta sozinho pra
    // posição anterior quando o freio pega, e sem o número a tela parece ter
    // engolido o clique.
    const seconds = Math.ceil((response?.retryAfterMs ?? 0) / 1000);
    const description =
      code === 'RATE_LIMITED' && seconds > 0
        ? `Calma aí — tente de novo em ${seconds}s.`
        : ERROR_MESSAGES[code] ?? 'Tente de novo em instantes.';

    toast({ title: 'Não deu pra salvar', description, variant: 'destructive' });
  }

  /**
   * O ponto por onde as QUATRO ações passam quando dão certo — apelido, switch,
   * foto nova e foto removida. Por isso a confirmação mora aqui, e não repetida
   * em cada uma.
   *
   * `router.refresh()` porque o UserDTO é prop de Server Component (ver
   * flows/channel/index.tsx): quem mostra o próprio nome no rodapé da sidebar e
   * no card de voz está lendo aquela prop, não este estado. Os OUTROS usuários
   * já foram avisados pelo servidor (ver propagateProfileChange).
   *
   * Ele deixou de ser a ÚNICA notícia dessas superfícies, e continua aqui de
   * propósito: o `useSelfIdentity` chega antes por SSE e cobre avatar e nome,
   * mas o refresh é quem renova a prop de verdade — e com ela o resto da árvore
   * que lê o UserDTO cru (esta aba ao reabrir, o compositor do chat).
   *
   * O aviso descreve o EFEITO em vez de dizer "salvo": a máscara já está
   * valendo pra todo mundo neste instante, e é isso que a pessoa precisa saber
   * antes de fechar as Configurações.
   */
  async function applyMask(next: ProfileMaskState, aviso: { title: string; description?: string }) {
    setMask(next);
    setNickname(next.displayName ?? '');
    toast(aviso);
    router.refresh();
  }

  async function saveNickname() {
    setSavingName(true);
    try {
      const response = await fetch('/api/user/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: nickname.trim() || null }),
      });
      const data = (await response.json().catch(() => null)) as ProfileResponse | null;
      if (!response.ok || !data) return fail(data);
      await applyMask(
        data,
        data.displayName
          ? { title: 'Apelido salvo', description: `Todo mundo já está te vendo como ${data.displayName}.` }
          : { title: 'Apelido removido', description: `Você voltou a aparecer como ${discordUsername}.` },
      );
    } finally {
      setSavingName(false);
    }
  }

  async function toggleDiscordProfile(useDiscordProfile: boolean) {
    const previous = mask;
    // Otimista: o switch é a única coisa da aba que muda a tela inteira, e
    // esperar o round-trip pra ele reagir parece que não funcionou.
    setMask({ ...mask, useDiscordProfile });
    const response = await fetch('/api/user/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ useDiscordProfile }),
    });
    const data = (await response.json().catch(() => null)) as ProfileResponse | null;
    if (!response.ok || !data) {
      setMask(previous);
      return fail(data);
    }
    // A confirmação nomeia o que ESTA pessoa tem guardado: quem só subiu foto
    // não tem apelido pra "continuar guardado", e a frase genérica falaria de
    // um campo vazio.
    const guardado = [data.displayName && 'seu apelido', data.displayAvatar && 'sua foto']
      .filter(Boolean)
      .join(' e ');

    await applyMask(
      data,
      data.useDiscordProfile
        ? {
            title: 'Usando o perfil do Discord',
            description: `Você aparece como ${discordUsername}, com a foto de lá. Aqui ${guardado} continua guardado.`,
          }
        : {
            title: 'Máscara ativa',
            description: data.displayName
              ? `Você voltou a aparecer como ${data.displayName}.`
              : 'Sua foto voltou a valer.',
          },
    );
  }

  async function uploadAvatar(file: File, crop: CropRect | null) {
    setSavingAvatar(true);
    setPendingFile(null);
    try {
      const form = new FormData();
      form.append('file', file);
      if (crop) form.append('crop', JSON.stringify(crop));

      const response = await fetch('/api/user/profile', { method: 'POST', body: form });
      const data = (await response.json().catch(() => null)) as ProfileResponse | null;
      if (!response.ok || !data) return fail(data);
      await applyMask(data, { title: 'Foto atualizada', description: 'Já é ela que aparece pra todo mundo.' });
    } finally {
      setSavingAvatar(false);
    }
  }

  async function removeAvatar() {
    setSavingAvatar(true);
    try {
      const response = await fetch('/api/user/profile', { method: 'DELETE' });
      const data = (await response.json().catch(() => null)) as ProfileResponse | null;
      if (!response.ok || !data) return fail(data);
      await applyMask(data, { title: 'Foto removida', description: 'Voltou a valer a foto do seu Discord.' });
    } finally {
      setSavingAvatar(false);
    }
  }

  /**
   * O CROPPER só abre pra imagem estática. Em GIF/WebP/APNG animado o
   * enquadramento é central e quem faz é o servidor — abrir um cropper cujo
   * recorte vai ser ignorado seria prometer um enquadramento que não acontece.
   */
  async function handleFile(file: File) {
    if (file.size > MAX_BYTES) return fail({ error: 'IMAGE_TOO_LARGE' });

    const bytes = new Uint8Array(await file.slice(0, 64 * 1024).arrayBuffer());
    if (isAnimatedImage(bytes)) {
      toast({ title: 'Imagem animada', description: 'GIFs são enquadrados pelo centro, sem recorte.' });
      void uploadAvatar(file, null);
      return;
    }

    setPendingFile(file);
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Perfil</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Um apelido e uma foto só seus, por cima do que vem do Discord. Vale em todo o TDCall.
        </p>
      </div>

      {pendingFile ? (
        <ProfileAvatarCropper
          file={pendingFile}
          saving={savingAvatar}
          onCancel={() => setPendingFile(null)}
          onConfirm={(crop) => void uploadAvatar(pendingFile, crop)}
        />
      ) : (
        <>
          <div className="flex items-center gap-4">
            {/* Enquanto sobe, o avatar vira skeleton no MESMO tamanho e formato
                — a foto é o que está chegando, então é a forma dela que fica
                pulsando. Nada de spinner (regra do projeto). */}
            {/* O CÍRCULO MOSTRA A FOTO GUARDADA, E MAIS NADA.
                Ele é o assunto dos botões ao lado — "Trocar foto" troca ESTA, e
                "Remover" apaga ESTA. Resolver a identidade aqui (que é o que a
                sidebar e o chat fazem, e o certo lá) punha a foto do Discord no
                lugar assim que o switch subia: o círculo passava a mostrar uma
                imagem que o botão de remover não apaga, e quem ligou o switch
                ficava sem nenhum lugar pra ver o que continua guardado —
                exatamente o que o aviso do switch promete. O perfil do Discord
                tem preview próprio, na linha dele.

                Sem foto guardada o círculo é o ALVO do envio, não um retrato
                vazio: mesma ação de "Enviar foto" ao lado, na forma que a
                pessoa já ia clicar. */}
            {savingAvatar ? (
              <div className="h-20 w-20 shrink-0 animate-pulse rounded-full bg-muted/60" />
            ) : mask.displayAvatar ? (
              <Avatar
                image={publicR2Url(mask.displayAvatar)}
                fallback={identity.username.slice(0, 2)}
                size={20}
                className="shrink-0"
              />
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                aria-label="Enviar foto"
                className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full border-2 border-dashed border-border bg-muted/20 text-muted-foreground transition-colors hover:border-foreground/25 hover:text-foreground/70"
              >
                <HugeIcon name="image-upload" size={28} />
              </button>
            )}

            <div className="min-w-0 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="secondary" size="sm" onClick={() => fileInputRef.current?.click()} disabled={savingAvatar}>
                  <HugeIcon name="image-01" size={16} />
                  {mask.displayAvatar ? 'Trocar foto' : 'Enviar foto'}
                </Button>

                {mask.displayAvatar && (
                  <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={removeAvatar} disabled={savingAvatar}>
                    Remover
                  </Button>
                )}
              </div>

              <p className="text-xs text-muted-foreground">
                PNG, JPG, GIF, WebP ou AVIF, até 10 MB. GIF continua animado, enquadrado pelo centro.
              </p>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED}
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                // Zera o input pra escolher O MESMO arquivo de novo disparar
                // outro `change` — sem isso, cancelar o cropper e reabrir a
                // mesma foto não faz nada.
                event.target.value = '';
                if (file) void handleFile(file);
              }}
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="profile-nickname" className="text-xs font-medium text-muted-foreground">
              Apelido
            </label>
            <div className="flex items-center gap-2">
              <Input
                id="profile-nickname"
                value={nickname}
                maxLength={NICKNAME_MAX_LENGTH}
                placeholder={user.username}
                disabled={savingName}
                onChange={(event) => setNickname(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && nicknameDirty) void saveNickname();
                }}
              />
              <Button size="sm" onClick={saveNickname} disabled={!nicknameDirty || savingName}>
                Salvar
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Vazio usa seu nome do Discord ({user.username}).
            </p>
          </div>

          {/* Só com APELIDO guardado — ver `podeVoltarProDiscord` lá em cima. */}
          {podeVoltarProDiscord && (
            <>
              <Separator />

              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium">Usar meu perfil do Discord</p>

                  {/* A conta do Discord MOSTRADA, em vez de descrita. A frase
                      que estava aqui explicava o destino do switch com palavras
                      ("volta a aparecer com o nome e a foto do Discord") quando
                      o destino é uma pessoa com cara e nome — vendo os dois, não
                      resta o que interpretar. */}
                  <div className="mt-2 flex min-w-0 items-center gap-2">
                    <Avatar
                      image={user.avatar}
                      fallback={discordUsername.slice(0, 2)}
                      size={6}
                      className="shrink-0"
                    />
                    <span className="min-w-0 truncate text-xs text-muted-foreground">{discordUsername}</span>
                  </div>
                </div>
                <Switch
                  checked={mask.useDiscordProfile}
                  onCheckedChange={(checked) => void toggleDiscordProfile(checked)}
                  aria-label="Usar meu perfil do Discord"
                />
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
