'use client';

import useSWR from 'swr';

interface RtcEnabledConfig {
  enabled: boolean;
}

async function fetcher(url: string): Promise<RtcEnabledConfig> {
  const response = await fetch(url);
  if (!response.ok) throw new Error('Falha ao carregar config do OpenCall');
  return response.json();
}

/**
 * Liga/desliga do TDCalls controlado pelo admin (ver /api/rtc/config). `active`
 * segue o mesmo padrão de useChannelPresence: false pausa o polling pra não gastar
 * chamada de quem não tem acesso ao canal. Enquanto carrega, assume ligado — evita
 * o dock sumir e reaparecer a cada navegação só por causa da primeira busca.
 */
export function useRtcEnabled(active: boolean) {
  const { data, mutate } = useSWR<RtcEnabledConfig>(active ? '/api/rtc/config' : null, fetcher, {
    dedupingInterval: 30_000,
    refreshInterval: 30_000,
  });

  const setRtcEnabled = async (enabled: boolean) => {
    await fetch('/api/rtc/config', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    });
    await mutate({ enabled });
  };

  return { rtcEnabled: data?.enabled ?? true, setRtcEnabled };
}
