/**
 * Commit que ESTE processo está servindo, ou string vazia quando o deploy não
 * informa nenhum.
 *
 * Só faz sentido lido no servidor: o valor tem que mudar quando o container
 * troca, e qualquer coisa inlined no bundle client (NEXT_PUBLIC_*) fica
 * congelada no build — justamente o que o aviso de atualização precisa detectar.
 *
 * Vazio é resposta legítima, não erro: dev local e self-host que não passam a
 * variável caem aqui, e o cliente (useAppVersion) trata vazio como "não dá pra
 * saber" e nunca acende o aviso.
 */
export function appCommit(): string {
  return (
    process.env.APP_COMMIT_SHA ||
    process.env.RAILWAY_GIT_COMMIT_SHA ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    ''
  );
}
