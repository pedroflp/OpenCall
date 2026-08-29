# Ícones do canal (texto e voz)

Só HugeIcon. Nada de Heroicons, lucide-react, phosphor, emoji como ícone ou
SVG próprio — nem para ícone novo, nem para variação de um existente. Use
`<HugeIcon name="..." size={n} />` (`@/components/HugeIcon`) sempre.

O `name` é uma chave kebab-case do `@iconify-json/hugeicons` (ver
`node_modules/@iconify-json/hugeicons/icons.json`) — confira que a chave
existe antes de usar, o componente retorna `null` silenciosamente se não
achar. Não existe mais `icons.tsx` neste diretório — foi todo migrado pra
HugeIcon, não recrie um arquivo de ícones locais.

Essa regra vale pra toda a área de canais: `src/flows/channel/`,
`src/components/VoiceDock/`, `src/components/PlatformUsersSidebar/`.
