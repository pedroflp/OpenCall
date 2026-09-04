// Guarda-corpo dos catálogos de tradução (messages/*.json). Roda com
// `pnpm check:messages`.
//
// O TypeScript já cobre metade do problema: `global.d.ts` tipa o `t()` a partir
// do pt-BR, então chave inexistente é erro de compilação. O que ele NÃO vê é o
// que este script confere:
//
//   1. PARIDADE — o en-US tem exatamente as mesmas chaves que o pt-BR. Uma
//      chave nova traduzida só num idioma passa batido no build e vira o nome
//      da chave na tela do outro.
//   2. ICU VÁLIDO — todo `{plural}`/`{select}`/tag realmente compila. Uma chave
//      malformada só estoura quando alguém abre aquela tela.
//   3. MESMOS ARGUMENTOS — os dois idiomas pedem os mesmos `{valores}`. Uma
//      tradução que esquece o `{username}` não quebra o build, só apaga o nome.
//
// Sai com código 1 em qualquer divergência, pra servir de gate em CI.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { IntlMessageFormat } from 'intl-messageformat';

const messagesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'messages');

/** pt-BR é a REFERÊNCIA: é o idioma em que as telas são escritas (ver global.d.ts). */
const SOURCE_LOCALE = 'pt-BR';

const locales = fs
  .readdirSync(messagesDir)
  .filter((file) => file.endsWith('.json'))
  .map((file) => file.replace(/\.json$/, ''));

const catalogs = Object.fromEntries(
  locales.map((locale) => [locale, JSON.parse(fs.readFileSync(path.join(messagesDir, `${locale}.json`), 'utf8'))]),
);

function flatten(node, prefix = '', out = {}) {
  for (const [key, value] of Object.entries(node)) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object') flatten(value, full, out);
    else out[full] = value;
  }
  return out;
}

/** Os nomes de argumento e de tag que a mensagem exige, pelo AST do próprio ICU. */
function placeholdersOf(message, locale) {
  const found = new Set();
  (function walk(nodes) {
    for (const node of nodes) {
      // type 0 é literal — só ele não tem nome de argumento.
      if (node.type !== 0 && node.value !== undefined) found.add(node.value);
      if (node.options) for (const option of Object.values(node.options)) walk(option.value);
      if (node.children) walk(node.children);
    }
  })(new IntlMessageFormat(message, locale).getAst());
  return found;
}

const flat = Object.fromEntries(locales.map((locale) => [locale, flatten(catalogs[locale])]));
const sourceKeys = Object.keys(flat[SOURCE_LOCALE]);
const problems = [];

for (const locale of locales) {
  if (locale === SOURCE_LOCALE) continue;

  for (const key of sourceKeys) {
    if (!(key in flat[locale])) problems.push(`${locale}: falta a chave "${key}"`);
  }
  for (const key of Object.keys(flat[locale])) {
    if (!(key in flat[SOURCE_LOCALE])) problems.push(`${locale}: chave "${key}" não existe em ${SOURCE_LOCALE}`);
  }
}

for (const locale of locales) {
  for (const [key, message] of Object.entries(flat[locale])) {
    try {
      placeholdersOf(message, locale);
    } catch (error) {
      problems.push(`${locale}: ICU inválido em "${key}" — ${error.message}`);
    }
  }
}

for (const locale of locales) {
  if (locale === SOURCE_LOCALE) continue;

  for (const key of sourceKeys) {
    if (!(key in flat[locale])) continue;
    let expected;
    let actual;
    try {
      expected = placeholdersOf(flat[SOURCE_LOCALE][key], SOURCE_LOCALE);
      actual = placeholdersOf(flat[locale][key], locale);
    } catch {
      continue; // já reportado como ICU inválido acima
    }
    const missing = [...expected].filter((name) => !actual.has(name));
    const extra = [...actual].filter((name) => !expected.has(name));
    if (missing.length) problems.push(`${locale}: "${key}" não usa ${missing.map((n) => `{${n}}`).join(', ')}`);
    if (extra.length) problems.push(`${locale}: "${key}" usa ${extra.map((n) => `{${n}}`).join(', ')}, que ${SOURCE_LOCALE} não tem`);
  }
}

if (problems.length) {
  console.error(`${problems.length} problema(s) nos catálogos:\n`);
  for (const problem of problems) console.error(`  · ${problem}`);
  process.exit(1);
}

console.log(`Catálogos ok — ${locales.join(', ')}, ${sourceKeys.length} chaves cada.`);
