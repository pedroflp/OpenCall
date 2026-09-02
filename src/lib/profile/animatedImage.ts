/**
 * A imagem tem mais de um quadro?
 *
 * O CROPPER só abre pra imagem estática. Em GIF/WebP animado o enquadramento é
 * sempre central (ver processAvatar), e mostrar um cropper cujo recorte o
 * servidor vai ignorar seria pior do que não mostrar nenhum — a pessoa
 * escolheria um enquadramento e receberia outro.
 *
 * Quem decide de verdade é o sharp, no servidor (`metadata.pages`). Isto aqui é
 * a mesma pergunta feita no cliente, onde não há sharp, pra saber se abre o
 * cropper. Errar pra menos (achar que é estático o que é animado) só custa um
 * recorte ignorado; por isso os três testes são os marcadores explícitos de
 * animação de cada formato, e não heurística de contagem de bytes.
 */
export function isAnimatedImage(bytes: Uint8Array): boolean {
  if (hasAscii(bytes, 'GIF8', 0)) return hasGifAnimation(bytes);
  // 'ANMF' é o quadro de animação do WebP estendido; 'ANIM' é o cabeçalho dela.
  if (hasAscii(bytes, 'RIFF', 0) && hasAscii(bytes, 'WEBP', 8)) return findAscii(bytes, 'ANMF') || findAscii(bytes, 'ANIM');
  // APNG: o chunk 'acTL' é o que separa um PNG animado de um PNG comum.
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50) return findAscii(bytes, 'acTL');
  return false;
}

/**
 * Dois blocos de controle gráfico (0x21 0xF9) é o que todo GIF animado tem —
 * um por quadro. O `NETSCAPE2.0` (o bloco de loop) é o marcador mais citado,
 * mas ele é OPCIONAL: um GIF de dois quadros que roda uma vez só não tem
 * nenhum, e cairia no cropper como se fosse foto parada.
 */
function hasGifAnimation(bytes: Uint8Array): boolean {
  let found = 0;
  for (let i = 0; i < bytes.length - 1; i += 1) {
    if (bytes[i] === 0x21 && bytes[i + 1] === 0xf9) {
      found += 1;
      if (found > 1) return true;
    }
  }
  return false;
}

function hasAscii(bytes: Uint8Array, text: string, offset: number): boolean {
  if (bytes.length < offset + text.length) return false;
  for (let i = 0; i < text.length; i += 1) {
    if (bytes[offset + i] !== text.charCodeAt(i)) return false;
  }
  return true;
}

/** Varre só o começo: os chunks de animação vêm antes dos dados de imagem nos três formatos. */
function findAscii(bytes: Uint8Array, text: string): boolean {
  const limit = Math.min(bytes.length, 64 * 1024);
  for (let i = 0; i <= limit - text.length; i += 1) {
    if (hasAscii(bytes, text, i)) return true;
  }
  return false;
}
