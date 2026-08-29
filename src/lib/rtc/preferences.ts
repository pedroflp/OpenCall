import type { ChannelPreferences } from '@/app/api/user/types';

export const DEFAULT_PARTICIPANT_VOLUME = 1;
export const MAX_PARTICIPANT_VOLUME = 1.5;
export const DEFAULT_SOUND_EFFECTS_VOLUME = 0.5;

let cache: ChannelPreferences | null = null;
let pending: Promise<ChannelPreferences> | null = null;

// Preferências (volume/mute por participante, efeitos sonoros) vivem no doc do
// usuário no Firestore em vez de localStorage, para que sincronizem entre
// dispositivos logados na mesma conta. O cache em memória evita refazer o GET
// a cada chamada — playSound() em particular roda no hot path de eventos de
// sala e precisa de leitura síncrona.
export async function loadChannelPreferences(): Promise<ChannelPreferences> {
  if (cache) return cache;
  if (!pending) {
    pending = fetch('/api/user')
      .then((res) => (res.ok ? res.json() : null))
      .then((user: { channelPreferences?: ChannelPreferences } | null) => {
        cache = user?.channelPreferences ?? {};
        return cache;
      })
      .catch(() => ({}) as ChannelPreferences)
      .finally(() => {
        pending = null;
      });
  }
  return pending;
}

export function getCachedChannelPreferences(): ChannelPreferences {
  return cache ?? {};
}

function patchChannelPreference(key: string, value: unknown) {
  fetch('/api/user', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ [key]: value }),
  }).catch(() => {});
}

const patchDebounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

// O slider de volume dispara onValueChange a cada tick do arraste — sem debounce,
// isso viraria uma rajada de PATCH por drag. O estado local (via saveParticipantVolume)
// já atualiza a UI e o RemoteParticipant.setVolume na hora; só a persistência atrasa.
function patchChannelPreferenceDebounced(key: string, value: unknown, delayMs = 400) {
  const existing = patchDebounceTimers.get(key);
  if (existing) clearTimeout(existing);
  patchDebounceTimers.set(
    key,
    setTimeout(() => {
      patchDebounceTimers.delete(key);
      patchChannelPreference(key, value);
    }, delayMs)
  );
}

export function saveParticipantVolume(identity: string, volume: number) {
  const isDefault = volume === DEFAULT_PARTICIPANT_VOLUME;

  if (cache) {
    const participantVolumes = { ...cache.participantVolumes };
    if (isDefault) delete participantVolumes[identity];
    else participantVolumes[identity] = volume;
    cache = { ...cache, participantVolumes };
  }

  patchChannelPreferenceDebounced(`channelPreferences.participantVolumes.${identity}`, isDefault ? null : volume);
}

export function saveMutedParticipant(identity: string, muted: boolean) {
  if (cache) {
    const mutedParticipants = { ...cache.mutedParticipants };
    if (muted) mutedParticipants[identity] = true;
    else delete mutedParticipants[identity];
    cache = { ...cache, mutedParticipants };
  }

  patchChannelPreference(`channelPreferences.mutedParticipants.${identity}`, muted ? true : null);
}

export function getSoundEffectsVolume(): number {
  return getCachedChannelPreferences().soundEffectsVolume ?? DEFAULT_SOUND_EFFECTS_VOLUME;
}

export function setSoundEffectsVolume(volume: number) {
  const isDefault = volume === DEFAULT_SOUND_EFFECTS_VOLUME;
  cache = { ...cache, soundEffectsVolume: volume };
  patchChannelPreferenceDebounced('channelPreferences.soundEffectsVolume', isDefault ? null : volume);
}
