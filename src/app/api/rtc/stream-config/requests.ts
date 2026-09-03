import { fetchApi } from '@/services/api/fetchApi';
import type { StreamSettings } from '@/lib/rtc/streamQuality';

export async function fetchStreamSettings(): Promise<StreamSettings | null> {
  const response = await fetchApi('rtc/stream-config');
  if (!response.ok) return null;
  return (await response.json()).settings;
}


export async function updateStreamSettings(settings: StreamSettings) {
  const response = await fetchApi('rtc/stream-config', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ settings }),
  });
  return { ok: response.ok };
}
