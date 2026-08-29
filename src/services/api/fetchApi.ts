export async function fetchApi(path: string, options?: RequestInit) {
  let extraHeaders: Record<string, string> = {};

  if (typeof window === 'undefined') {
    const { headers } = await import('next/headers');
    const headersList = headers();
    const cookie = headersList.get('cookie');
    if (cookie) extraHeaders['cookie'] = cookie;
  }

  return fetch(`${process.env.NEXT_PUBLIC_apiBaseUrl}/api/${path}`, {
    // Proxy interno pra dado autenticado por request (nunca um recurso
    // cacheável) — sem isso, o fetch cache do Next.js pode servir pra sempre
    // uma resposta antiga (ex: lista de usuários vazia de um request anterior).
    cache: 'no-store',
    ...options,
    headers: {
      ...extraHeaders,
      ...(options?.headers as Record<string, string> | undefined),
    },
  });
}
