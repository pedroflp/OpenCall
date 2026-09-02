/**
 * URL pública de qualquer objeto do bucket, a partir da key.
 *
 * Sem dependências de servidor (nada de AWS SDK) — importável tanto pelas
 * rotas de API quanto por componentes client (a mensagem otimista do chat
 * precisa da URL da imagem antes de qualquer round-trip ao servidor, e a aba
 * Perfil precisa da URL do avatar recém-enviado pelo mesmo motivo).
 *
 * Morava em `lib/chat/imageUrl`, que continua reexportando pros call sites
 * antigos — o segundo domínio a precisar dela (o avatar) é onde o nome de chat
 * deixa de se sustentar.
 */
/**
 * Uma vez por processo/aba. Sem a base, toda URL daqui sai `undefined/<key>` —
 * uma URL RELATIVA, que o browser resolve contra a origem do app e devolve 404
 * sem reclamar de nada: o `<img>` cai no fallback e a tela parece só "não ter
 * foto". Pior: no servidor a variável existe em runtime e acerta, então metade
 * do app mostra o dado certo enquanto a outra metade mente.
 *
 * `NEXT_PUBLIC_*` é inlined no BUILD do bundle client. Num deploy via Docker
 * isso quer dizer build arg, não variável de serviço — ver o bloco de `ARG` do
 * Dockerfile.
 */
let semBaseAvisado = false;

export function publicR2Url(key: string): string {
  const base = process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL!;

  if (!base && !semBaseAvisado) {
    semBaseAvisado = true;
    console.error(
      '[r2] NEXT_PUBLIC_R2_PUBLIC_BASE_URL ausente neste bundle — avatar e imagem do chat vão sair como URL relativa quebrada. Ver o bloco de ARG do Dockerfile.',
    );
  }

  // `[` e `]` são válidos numa chave S3 mas precisam ser percent-encoded na URL.
  const encoded = key.split('/').map(encodeURIComponent).join('/');
  return `${base}/${encoded}`;
}
