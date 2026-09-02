import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/services/prisma';
import { getUser } from '@/app/api/auth/[...nextauth]/auth';
import { checkRateLimit } from '@/lib/rtc/rateLimit';
import {
  isValidNickname,
  normalizeNickname,
  PROFILE_MASK_SELECT,
  type ProfileMaskSource,
} from '@/lib/profile/identity';
import {
  AvatarTooHeavyError,
  deleteAvatar,
  isAllowedAvatarContentType,
  MAX_AVATAR_BYTES,
  parseCropRect,
  processAvatar,
  sniffAvatarContentType,
  uploadAvatar,
} from '@/lib/profile/avatarStorage';
import { propagateProfileChange } from '@/lib/profile/propagate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Sobe uma foto por vez, com folga pra errar e tentar de novo — não é ação que alguém repita em rajada de boa fé. */
const AVATAR_UPLOAD_RATE_LIMIT = { windowMs: 60_000, max: 10 };
const NICKNAME_RATE_LIMIT = { windowMs: 60_000, max: 20 };

/**
 * O SWITCH tem freio próprio, e bem mais curto que o do apelido: ele é o único
 * campo da aba que se troca com UM clique e volta com outro, e o custo de cada
 * troca não é o UPDATE — é o `propagateProfileChange` inteiro, que reescreve o
 * participante no LiveKit e faz broadcast pra todo mundo que está com a aba
 * aberta. Vinte por minuto (o teto do apelido) é vinte varreduras de presença
 * porque alguém ficou brincando com o interruptor.
 *
 * Três trocas seguidas param por 30s. É o número que separa "errei e desfiz"
 * (uma ida e volta = duas trocas, ainda passa) de gangorra — e a janela é
 * deslizante, então a espera real é o que falta pra primeira das três
 * completar 30s.
 */
const DISCORD_TOGGLE_RATE_LIMIT = { windowMs: 30_000, max: 3 };

function err(status: number, code: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: code, ...extra }, { status });
}

/**
 * A máscara de perfil do próprio usuário (ver lib/profile/identity.ts).
 *
 * PATCH cuida do que é texto (apelido e o switch de voltar pro Discord), POST
 * da foto e DELETE tira a foto. A foto tem verbo próprio porque é multipart e
 * porque falhar nela não pode desfazer um apelido salvo no mesmo envio.
 */

/**
 * `displayName: null` LIMPA o apelido (volta pro Discord no nome, mantendo a
 * foto). Não confundir com o switch: limpar apaga, o switch só cobre.
 */
export async function PATCH(req: NextRequest) {
  const user = await getUser();
  if (!user) return err(401, 'UNAUTHENTICATED');

  const { allowed, retryAfterMs } = checkRateLimit(`profile-patch:${user.id}`, NICKNAME_RATE_LIMIT);
  if (!allowed) return err(429, 'RATE_LIMITED', { retryAfterMs });

  const body = (await req.json().catch(() => null)) as {
    displayName?: unknown;
    useDiscordProfile?: unknown;
  } | null;
  if (!body) return err(400, 'INVALID_BODY');

  const data: { displayName?: string | null; useDiscordProfile?: boolean } = {};

  if ('displayName' in body) {
    if (body.displayName === null) {
      data.displayName = null;
    } else if (typeof body.displayName === 'string') {
      const nickname = normalizeNickname(body.displayName);
      // Campo esvaziado no formulário é a mesma intenção de `null` — quem
      // apaga o texto e salva está pedindo o nome do Discord de volta.
      if (!nickname) data.displayName = null;
      else if (!isValidNickname(nickname)) return err(400, 'INVALID_NICKNAME');
      else data.displayName = nickname;
    } else {
      return err(400, 'INVALID_BODY');
    }
  }

  if ('useDiscordProfile' in body) {
    if (typeof body.useDiscordProfile !== 'boolean') return err(400, 'INVALID_BODY');

    // Contado por `body`, e não por `data`: logo abaixo um apelido novo também
    // escreve `useDiscordProfile`, e aquilo é consequência de salvar o nome —
    // não uma troca do interruptor. Cobrar do apelido o freio da gangorra
    // travaria quem só está corrigindo o que digitou.
    const toggle = checkRateLimit(`profile-discord-toggle:${user.id}`, DISCORD_TOGGLE_RATE_LIMIT);
    if (!toggle.allowed) return err(429, 'RATE_LIMITED', { retryAfterMs: toggle.retryAfterMs });

    data.useDiscordProfile = body.useDiscordProfile;
  }

  // Salvar um apelido com o switch ligado não mudaria nada na tela, e a pessoa
  // acharia que não salvou. Escolher um valor pra máscara é escolher usá-la.
  //
  // `if` sem `else`: o corpo pode trazer os dois campos (a aba nunca manda,
  // mas a rota é pública), e aí o apelido ganha do switch de propósito —
  // mandar um nome novo é a intenção mais recente das duas.
  if (data.displayName) data.useDiscordProfile = false;

  if (Object.keys(data).length === 0) return err(400, 'INVALID_BODY');

  const updated = await prisma.user.update({ where: { id: user.id }, data, select: PROFILE_MASK_SELECT });

  await propagateProfileChange(user.id, updated as ProfileMaskSource);

  return NextResponse.json(profileResponse(updated));
}

export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return err(401, 'UNAUTHENTICATED');

  const { allowed, retryAfterMs } = checkRateLimit(`profile-avatar:${user.id}`, AVATAR_UPLOAD_RATE_LIMIT);
  if (!allowed) return err(429, 'RATE_LIMITED', { retryAfterMs });

  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) return err(400, 'INVALID_BODY');

  if (!isAllowedAvatarContentType(file.type)) return err(400, 'UNSUPPORTED_CONTENT_TYPE');
  if (file.size <= 0) return err(400, 'INVALID_SIZE');
  if (file.size > MAX_AVATAR_BYTES) return err(400, 'IMAGE_TOO_LARGE');

  const body = Buffer.from(await file.arrayBuffer());
  if (!sniffAvatarContentType(body)) return err(400, 'INVALID_IMAGE_BYTES');

  // O recorte é do cropper e só existe pra imagem estática — no animado ele nem
  // abre e o enquadramento é central (ver processAvatar).
  const crop = parseCropRect(form?.get('crop'));

  let processed;
  try {
    processed = await processAvatar(body, crop);
  } catch (error) {
    if (error instanceof AvatarTooHeavyError) return err(400, 'ANIMATION_TOO_HEAVY');
    console.error('[profile] falhou ao processar avatar', error);
    return err(400, 'INVALID_IMAGE_BYTES');
  }

  const key = await uploadAvatar({ userId: user.id, processed });

  // A foto ANTERIOR só sai depois que a nova está no banco: apagar antes
  // deixaria a pessoa sem avatar nenhum se o update falhasse no meio.
  const previous = await prisma.user.findUnique({ where: { id: user.id }, select: { displayAvatar: true } });

  const updated = await prisma.user.update({
    where: { id: user.id },
    // DESLIGA o switch, mesma regra do apelido no PATCH: agora ele governa a
    // foto também (ver channelsIdentity), então subir uma com ele ligado
    // salvaria sem aparecer — o retrato exato do bug que a regra do apelido já
    // existia pra evitar. Escolher um valor pra máscara é escolher usá-la.
    //
    // O PREÇO, que é real: quem tinha apelido guardado e o switch ligado
    // recupera o apelido junto ao subir uma foto. É a consequência de um
    // interruptor só pros dois campos — e some pelo mesmo caminho que
    // apareceu, num clique no switch. A alternativa era a foto não aparecer,
    // que é pior: silêncio em vez de efeito visível e reversível.
    data: { displayAvatar: key, useDiscordProfile: false },
    select: PROFILE_MASK_SELECT,
  });

  if (previous?.displayAvatar) void deleteAvatar(previous.displayAvatar).catch(() => {});

  await propagateProfileChange(user.id, updated as ProfileMaskSource);

  return NextResponse.json(profileResponse(updated));
}

export async function DELETE() {
  const user = await getUser();
  if (!user) return err(401, 'UNAUTHENTICATED');

  const previous = await prisma.user.findUnique({ where: { id: user.id }, select: { displayAvatar: true } });

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { displayAvatar: null },
    select: PROFILE_MASK_SELECT,
  });

  if (previous?.displayAvatar) void deleteAvatar(previous.displayAvatar).catch(() => {});

  await propagateProfileChange(user.id, updated as ProfileMaskSource);

  return NextResponse.json(profileResponse(updated));
}

/** O mesmo shape que o UserDTO carrega em `profileMask` — a aba Perfil aplica a resposta sem precisar recarregar a página. */
function profileResponse(mask: ProfileMaskSource) {
  return {
    displayName: mask.displayName,
    displayAvatar: mask.displayAvatar,
    useDiscordProfile: mask.useDiscordProfile,
  };
}
