/**
 * O formato do código de acesso — o transporte "digitável" do mesmo pareamento
 * que o QR entrega pela câmera (ver devicePairing.ts).
 *
 * Módulo isomórfico de propósito: o servidor gera e valida, o campo do
 * LoginPopover normaliza a digitação com estas mesmas regras. Duas
 * normalizações diferentes nas duas pontas seria o mesmo que nenhuma — quem
 * digita `O` no lugar de `0` levaria "código inválido" só num dos caminhos.
 * Por isso nada de `crypto` aqui: importar node:crypto num client component
 * quebra o bundle, e é o que empurraria alguém a duplicar a tabela abaixo.
 */

/**
 * Crockford base32: os 32 símbolos que sobram do alfanumérico depois de tirar
 * `I`, `L`, `O` e `U`. Os três primeiros são os confundíveis com `1`/`0` e
 * entre si — num código lido de uma tela e digitado em outra, ambiguidade
 * visual custa uma tentativa; `U` sai pra não formar palavra indesejada.
 */
export const ACCESS_CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** 6 símbolos = 32^6 ≈ 2^30. Ver a nota de segurança em devicePairing.ts. */
export const ACCESS_CODE_LENGTH = 6;

/**
 * Os confundíveis que ficaram de fora do alfabeto viram o símbolo que eles
 * parecem, em vez de erro: quem lê `0` na tela e digita `O` acertou o código,
 * só escreveu com outra letra. É a mesma tabela de decodificação do Crockford.
 */
const CONFUSABLES: Record<string, string> = { I: '1', L: '1', O: '0' };

/** Aceita minúscula, espaço, hífen e confundível — o que não sobrar do alfabeto é descartado. */
export function normalizeAccessCode(raw: string): string {
  let normalized = '';

  for (const char of raw.toUpperCase()) {
    const mapped = CONFUSABLES[char] ?? char;
    if (ACCESS_CODE_ALPHABET.includes(mapped)) normalized += mapped;
    if (normalized.length === ACCESS_CODE_LENGTH) break;
  }

  return normalized;
}

/** Dois grupos de três, do mesmo tamanho dos grupos do campo de entrada — o olho copia por bloco, não caractere a caractere. */
export function formatAccessCode(code: string): string {
  const half = Math.ceil(code.length / 2);
  return `${code.slice(0, half)} ${code.slice(half)}`;
}
