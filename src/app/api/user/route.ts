import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/services/prisma";
import { getUser } from "../auth/[...nextauth]/auth";
import { findUserDTO } from "./queries";
import type { ChannelPreferences } from "./types";
import type { Prisma } from "@prisma/client";

const ALLOWED_PATCH_FIELDS = ['avatar', 'isMobileDownloaded'] as const;
type PatchableField = typeof ALLOWED_PATCH_FIELDS[number];

// Chaves aceitas em notação de ponto, para atualizar uma única entrada de
// preferência sem sobrescrever as demais (ex: volume de um único
// participante, sem apagar o volume dos outros já salvos).
const CHANNEL_PREFERENCE_KEY_PATTERN =
  /^channelPreferences\.(participantVolumes|mutedParticipants)\.([\w-]+)$|^channelPreferences\.(soundEffectsVolume)$/;

function isValidChannelPreferenceValue(key: string, value: unknown): boolean {
  if (value === null) return true; // null = remove a chave (volta ao default)
  // Até 1.5 (150%): acima de 1 é ganho via Web Audio, não só o volume nativo do elemento de áudio.
  if (key.startsWith('channelPreferences.participantVolumes.')) return typeof value === 'number' && value >= 0 && value <= 1.5;
  if (key.startsWith('channelPreferences.mutedParticipants.')) return typeof value === 'boolean';
  if (key === 'channelPreferences.soundEffectsVolume') return typeof value === 'number' && value >= 0 && value <= 1;
  return false;
}

function applyChannelPreferenceUpdate(current: ChannelPreferences, key: string, value: unknown): ChannelPreferences {
  const next: ChannelPreferences = {
    ...current,
    participantVolumes: { ...current.participantVolumes },
    mutedParticipants: { ...current.mutedParticipants },
  };

  if (key === 'channelPreferences.soundEffectsVolume') {
    if (value === null) delete next.soundEffectsVolume;
    else next.soundEffectsVolume = value as number;
    return next;
  }

  const participantMatch = key.match(/^channelPreferences\.participantVolumes\.(.+)$/);
  if (participantMatch) {
    const identity = participantMatch[1];
    if (value === null) delete next.participantVolumes![identity];
    else next.participantVolumes![identity] = value as number;
    return next;
  }

  const mutedMatch = key.match(/^channelPreferences\.mutedParticipants\.(.+)$/);
  if (mutedMatch) {
    const identity = mutedMatch[1];
    if (value === null) delete next.mutedParticipants![identity];
    else next.mutedParticipants![identity] = value as boolean;
    return next;
  }

  return next;
}

export async function PATCH(request: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json(null, { status: 401 });

  const body = await request.json();
  const directUpdates: Partial<Record<PatchableField, unknown>> = {};
  const preferenceUpdates: Array<{ key: string; value: unknown }> = [];

  for (const field of ALLOWED_PATCH_FIELDS) {
    if (!(field in body)) continue;
    directUpdates[field] = body[field];
  }

  for (const key of Object.keys(body)) {
    if (!CHANNEL_PREFERENCE_KEY_PATTERN.test(key)) continue;
    if (!isValidChannelPreferenceValue(key, body[key])) continue;
    preferenceUpdates.push({ key, value: body[key] });
  }

  if (Object.keys(directUpdates).length === 0 && preferenceUpdates.length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
  }

  try {
    await prisma.$transaction(async (tx) => {
      const data = { ...directUpdates } as Prisma.UserUpdateInput;

      if (preferenceUpdates.length > 0) {
        // SELECT ... dentro da transação pra serializar dois PATCHs
        // concorrentes de preferências (ex: dois sliders de volume ao mesmo
        // tempo) sem um pisar no merge do outro.
        const current = await tx.user.findUniqueOrThrow({ where: { id: user.id }, select: { channelPreferences: true } });
        let merged = (current.channelPreferences as ChannelPreferences | null) ?? {};
        for (const { key, value } of preferenceUpdates) {
          merged = applyChannelPreferenceUpdate(merged, key, value);
        }
        data.channelPreferences = merged as Prisma.InputJsonValue;
      }

      await tx.user.update({ where: { id: user.id }, data });
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(null, { status: 500 });
  }
}

export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json(null, { status: 401 });

  try {
    const dto = await findUserDTO(user.id);
    if (!dto) return NextResponse.json(null, { status: 404 });

    return NextResponse.json(dto);
  } catch (error) {
    return NextResponse.json(null, { status: 500 });
  }
}
