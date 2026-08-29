/**
 * Avatar do chat é um círculo colorido com a inicial do nome, não a foto do
 * Discord — escolha visual do design (Chat de Mensagens.dc.html), deliberada
 * (a cor vem fixada por mensagem no mockup, não é acidente de placeholder).
 * A cor é determinística a partir do id do usuário, não aleatória por render.
 */
const PALETTE = [
  'oklch(0.62 0.19 15)',
  'oklch(0.6 0.16 250)',
  'oklch(0.58 0.14 190)',
  'oklch(0.65 0.18 85)',
  'oklch(0.62 0.2 320)',
  'oklch(0.6 0.15 145)',
  'oklch(0.63 0.19 45)',
  'oklch(0.58 0.16 280)',
];

export function avatarColorFor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}
