export type GroupDTO = {
  id: string;
  title: string;
  /** Cor usada no nome dos membros do grupo em algumas UIs (ex: sidebar de usuários). */
  textColor: string;
  /** Menor valor = maior prioridade de exibição. */
  sortIndex: number;
}
