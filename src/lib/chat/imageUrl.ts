/**
 * Sem dependências de servidor (nada de AWS SDK) — importável tanto pelas
 * rotas de API quanto por componentes client (a mensagem otimista precisa da
 * URL da imagem antes de qualquer round-trip ao servidor).
 */
export function publicImageUrl(key: string): string {
  const base = process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL!;
  // `[` e `]` são válidos numa chave S3 mas precisam ser percent-encoded na URL.
  const encoded = key.split('/').map(encodeURIComponent).join('/');
  return `${base}/${encoded}`;
}
