# Catálogos de tradução

Um arquivo por idioma, com o nome sendo a tag BCP 47 exata de `src/i18n/config.ts`
(`pt-BR.json`, `en-US.json`). O `next.config.mjs` aponta o plugin do next-intl
para `src/i18n/request.ts`, que resolve o idioma da request e importa o JSON
correspondente.

## pt-BR é a fonte

As telas são escritas em português, então é lá que a chave nasce — e é o pt-BR
que o `global.d.ts` usa para **tipar** o `t()`. Consequência de propósito:
`t('chave.que.nao.existe')` é erro de compilação, não string crua na tela.

Ao adicionar texto novo: escreva a chave no `pt-BR.json`, traduza no
`en-US.json`, use no componente. Nessa ordem — o TypeScript reclama antes de
você errar o nome.

## Como não deixar os dois divergirem

```bash
pnpm check:messages
```

O TypeScript vê a chave, mas não vê o *outro* idioma. O script cobre o resto:

- **paridade** — o en-US tem exatamente as chaves do pt-BR (nem faltando, nem
  sobrando);
- **ICU válido** — todo `plural`/`select`/tag compila de verdade, em vez de
  estourar só quando alguém abre aquela tela;
- **mesmos argumentos** — os dois idiomas pedem os mesmos `{valores}`. Uma
  tradução que esquece o `{username}` não quebra build nenhum, só apaga o nome
  da frase.

## Convenções

**Namespace por área**, não por componente: `chat`, `voice`, `admin`, `auth`,
`settings`, `presence`, `common`. Dois componentes que mostram a mesma frase
compartilham a chave — é o caso de `settings.audioVideo.micSensitivityHint`, que
a aba das Configurações e o popover do microfone usam juntos.

**Códigos de erro viram chave.** As rotas de API devolvem código
(`RATE_LIMITED`, `CHANNEL_FULL`), nunca a frase pronta: o servidor não sabe a
língua de quem lê. O cliente estreita o código com uma lista de conhecidos e o
usa como chave — código novo sem frase cai no genérico em vez de pintar o
próprio código na tela.

**Plural e gênero são do ICU**, não do `if`. `{count, plural, one {...} other
{...}}` deixa a tradução escolher a forma verbal ("está" vs "estão") sem que o
componente saiba disso.

**Negrito no meio da frase é tag**, não concatenação: `<b>` na mensagem +
`t.rich('chave', { b: (chunks) => <b>{chunks}</b> })`. Onde a ênfase cai muda
com a língua. Cuidado: o nome de uma tag não pode ser igual ao de um valor na
mesma mensagem — daí pares como `<name>{channelName}</name>`.

**Nome de idioma não se traduz.** "English" é "English" em qualquer catálogo —
por isso os rótulos do seletor moram em `LOCALE_LABELS`, em
`src/i18n/config.ts`, e não aqui.

## O que fica de fora

- `src/app/global-error.tsx` — esse boundary substitui o layout raiz, e o
  `NextIntlClientProvider` mora nele; quando a tela aparece não há provider para
  ler. As três frases estão inline no arquivo, com o porquê.
- Nome do produto ("OpenCall") e termos que não mudam de língua.
