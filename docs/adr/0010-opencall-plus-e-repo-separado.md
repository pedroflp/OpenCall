# ADR-0010: O OpenCall+ é um repositório separado que consome o OpenCall

**Status**: Aceita
**RFC relacionada**: [rfc-migracao-tdc](../rfc-migracao-tdc.md)

## Contexto

O OpenCall+ é a versão desktop do produto: um shell Electron mais o tema Liquid Glass (ADR-0008), push-to-talk global, badge do ícone, bandeja, auto-update e chrome de janela. No `tdc` tudo isso vive no mesmo repositório, com `desktop/` ao lado de `src/` e as capacidades nativas gated em tempo de execução (`window.tdcall`, `useIsDesktopApp`).

O `desktop/` do `tdc` não é uma migração do app: é um shell que carrega o mesmo deploy que o navegador usa. Nenhuma linha de `src/` muda de lugar por causa dele — o que torna a separação em repositórios viável sem duplicar o produto.

O OpenCall, diferente do `tdc`, é público e open source. Onde o código do OpenCall+ mora deixa de ser só uma escolha de organização.

## Decisão

**O OpenCall+ é um repositório separado**, contendo o shell Electron e o tema Liquid Glass, apontando para um deploy do OpenCall.

## Alternativas consideradas

- **Mesmo repositório, pasta `desktop/` com gates** (estrutura idêntica à do `tdc`). Um deploy serviria os dois e a sincronização seria automática. Rejeitada porque coloca o código do OpenCall+ dentro do repositório open source, onde ele fica visível e forkável — o oposto do que a diferenciação do OpenCall+ pretende.

- **Fork do OpenCall.** Máxima liberdade para divergir, puxando upstream quando conveniente. Rejeitada porque o merge de upstream vira trabalho recorrente — exatamente o problema que esta migração existe para resolver, reintroduzido por construção.

## Consequências

- O OpenCall permanece 100% open source, sem código do OpenCall+ no repositório.
- O+ precisa de um mecanismo para aplicar o tema Liquid Glass sobre uma interface servida por outro repositório. Isso não existe hoje no `tdc` (lá é o mesmo `src/`) e é trabalho novo do OpenCall+, não desta migração.
- Mudanças no OpenCall que alterem a estrutura da interface podem quebrar o OpenCall+ sem aviso. O contrato entre os dois precisa ser explicitado em algum momento — não nesta rodada.
- Durante esta migração, o que é do OpenCall+ não vira código: vira lista. O §6 da RFC é essa lista, e ela é o insumo para quando o repositório do OpenCall+ for criado.
