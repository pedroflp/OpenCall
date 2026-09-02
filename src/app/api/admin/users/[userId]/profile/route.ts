import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/services/prisma';
import { auth, isCurrentUserChannelsAdmin } from '@/app/api/auth/[...nextauth]/auth';
import { UserRole } from '@prisma/client';
import { deleteAvatar } from '@/lib/profile/avatarStorage';
import { isValidNickname, normalizeNickname, PROFILE_MASK_SELECT, type ProfileMaskSource } from '@/lib/profile/identity';
import { propagateProfileChange } from '@/lib/profile/propagate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function err(status: number, code: string) {
  return NextResponse.json({ error: code }, { status });
}

/**
 * MODERAÇÃO da máscara de perfil: apelido ofensivo, foto imprópria.
 *
 * O admin EDITA o apelido de outro e REMOVE a foto — nunca sobe uma. Trocar a
 * foto de alguém seria o admin vestindo o perfil dos outros, que é outra coisa
 * (e ninguém pediu). Remover devolve o avatar do Discord, que é sempre um
 * destino seguro.
 *
 * ESCREVER UM APELIDO AQUI LIGA A MÁSCARA da pessoa (`useDiscordProfile` vai a
 * false), igual ao que a rota do próprio usuário faz. A primeira versão não
 * mexia no switch, com o argumento de que ligar a máscara de alguém à força não
 * é moderar — e o resultado foi que o admin editava, o painel dizia que salvou,
 * e nada mudava na tela de ninguém: quem nunca configurou perfil tem o switch
 * ligado, então o apelido ficava guardado e invisível. Ação que reporta sucesso
 * e não faz nada é pior do que ação recusada.
 *
 * LIMPAR o apelido (null) não mexe no switch: sem apelido não há nome pra
 * cobrir, e o nome cai no Discord sozinho. A FOTO não entra nessa conta — ela
 * vale independente do switch (ver channelsIdentity), e quem a tira é o
 * DELETE abaixo.
 *
 * A pessoa continua com a palavra final — o switch é dela, e voltar pro perfil
 * do Discord desfaz o que o admin escreveu. Isso é moderação de vitrine, não
 * punição: pra tirar alguém do ar existem o bloqueio no chat e o kick.
 */

/**
 * A máscara atual de alguém, pro editor abrir preenchido.
 *
 * Os menus de moderação (participante na sala, linha da sidebar de atividade)
 * têm em mãos só a identidade JÁ RESOLVIDA — o nome que está na tela pode ser o
 * apelido ou o do Discord, e olhando pra ele não dá pra saber qual dos dois é.
 * O editor precisa dos campos crus, e é o que esta rota entrega.
 *
 * `useDiscordProfile` vem junto porque muda o que o painel precisa dizer: com o
 * switch ligado, o APELIDO está guardado sem aparecer pra ninguém, e apagar um
 * apelido já invisível não resolveria a denúncia que trouxe o admin até aqui. A
 * foto não segue o switch — ela aparece de qualquer jeito.
 */

/**
 * Um channels_admin que não é ADMIN completo não mexe no perfil de um ADMIN —
 * mesma regra do /api/rtc/kick, e pelo mesmo motivo: quem administra canais
 * modera a sala, não a hierarquia acima dele.
 *
 * A regra mora AQUI, e não só no menu que a esconde. Ela já estava desenhada no
 * `canManageTarget` do card de voz, mas o mesmo alvo aparece na sidebar de
 * atividade, que não sabe quem é admin — sem esta checagem, o gate do card
 * seria decorativo e bastaria abrir o outro painel pra contorná-lo.
 */
async function blockedByAdminRule(targetUserId: string): Promise<boolean> {
  const session = await auth();
  if (session?.user?.isAdmin) return false;

  const target = await prisma.user.findUnique({ where: { id: targetUserId }, select: { roles: true } });
  return Boolean(target?.roles.includes(UserRole.ADMIN));
}

export async function GET(_req: NextRequest, { params }: { params: { userId: string } }) {
  if (!(await isCurrentUserChannelsAdmin())) return err(403, 'FORBIDDEN');

  const user = await prisma.user.findUnique({ where: { id: params.userId }, select: PROFILE_MASK_SELECT });
  if (!user) return err(404, 'USER_NOT_FOUND');

  return NextResponse.json({
    displayName: user.displayName,
    hasCustomAvatar: Boolean(user.displayAvatar),
    useDiscordProfile: user.useDiscordProfile,
    // A identidade do Discord: é o destino de tudo que o admin remove aqui, e
    // saber pra onde a pessoa volta é parte de decidir se vale remover.
    discordUsername: user.username,
    discordAvatar: user.avatar,
  });
}

export async function PATCH(req: NextRequest, { params }: { params: { userId: string } }) {
  if (!(await isCurrentUserChannelsAdmin())) return err(403, 'FORBIDDEN');
  if (await blockedByAdminRule(params.userId)) return err(403, 'CANNOT_MODERATE_ADMIN');

  const body = (await req.json().catch(() => null)) as { displayName?: unknown } | null;
  if (!body || !('displayName' in body)) return err(400, 'INVALID_BODY');

  let displayName: string | null;
  if (body.displayName === null) {
    displayName = null;
  } else if (typeof body.displayName === 'string') {
    const nickname = normalizeNickname(body.displayName);
    if (!nickname) displayName = null;
    else if (!isValidNickname(nickname)) return err(400, 'INVALID_NICKNAME');
    else displayName = nickname;
  } else {
    return err(400, 'INVALID_BODY');
  }

  const updated = await prisma.user
    .update({
      where: { id: params.userId },
      // `useDiscordProfile: false` só quando há apelido pra mostrar — ver o
      // cabeçalho. Limpar não liga nada, porque não sobra o que ligar.
      data: displayName ? { displayName, useDiscordProfile: false } : { displayName },
      select: PROFILE_MASK_SELECT,
    })
    .catch(() => null);
  if (!updated) return err(404, 'USER_NOT_FOUND');

  await propagateProfileChange(params.userId, updated as ProfileMaskSource);

  return NextResponse.json({ displayName: updated.displayName, displayAvatar: updated.displayAvatar });
}

export async function DELETE(_req: NextRequest, { params }: { params: { userId: string } }) {
  if (!(await isCurrentUserChannelsAdmin())) return err(403, 'FORBIDDEN');
  if (await blockedByAdminRule(params.userId)) return err(403, 'CANNOT_MODERATE_ADMIN');

  const previous = await prisma.user.findUnique({ where: { id: params.userId }, select: { displayAvatar: true } });
  if (!previous) return err(404, 'USER_NOT_FOUND');

  const updated = await prisma.user.update({
    where: { id: params.userId },
    data: { displayAvatar: null },
    select: PROFILE_MASK_SELECT,
  });

  if (previous.displayAvatar) void deleteAvatar(previous.displayAvatar).catch(() => {});

  await propagateProfileChange(params.userId, updated as ProfileMaskSource);

  return NextResponse.json({ displayName: updated.displayName, displayAvatar: updated.displayAvatar });
}
