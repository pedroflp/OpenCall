# OpenCall

Voz, vídeo e chat de comunidade, self-hosted. Discord como auth wall, Next.js como front+back, Postgres, LiveKit (cloud ou self-host) e R2 para arquivos.

## Rodando localmente

```bash
pnpm install
cp .env.example .env   # preencha as variáveis (ver docs/) — Prisma CLI só lê .env, não .env.local
pnpm prisma migrate dev
pnpm dev
```

Isso exige Postgres, LiveKit e um bucket R2 de verdade já configurados. Pra
não montar tudo isso na mão só pra rodar o projeto, veja "Docker" abaixo.

## Docker (setup rápido)

Sobe Postgres, [MinIO](https://min.io) (compatível com S3, substitui o R2) e
LiveKit num único `docker compose up` — sobra só o Discord OAuth pra
configurar na mão, porque isso depende de um app registrado na Discord e não
tem como containerizar.

1. Crie um app em [discord.com/developers/applications](https://discord.com/developers/applications),
   adicione o redirect `http://localhost:3000/api/auth/callback/discord` e
   copie o Client ID/Secret.
2. O primeiro usuário a logar vira ADMIN automaticamente (banco vazio) —
   então faça esse primeiro login com a sua própria conta do Discord.

```bash
pnpm install
cp .env.docker.example .env   # preencha DISCORD_CLIENT_ID/SECRET
pnpm dev:docker                     # sobe infra (docker compose --wait) + migra + inicia o Next
```

`pnpm dev:docker` = `pnpm docker:up` (Postgres/MinIO/LiveKit) + `prisma migrate dev` +
`pnpm dev`. Rode `pnpm docker:down` quando terminar.

Limitações desse setup (é só pra desenvolvimento local, não é o deploy real):

- **LiveKit** roda com config de dev (`docker/livekit.yaml`) num range de portas UDP
  pequeno e assumindo que o browser está na mesma máquina — voz/vídeo de outro
  dispositivo na rede não funciona nele.
- **MinIO** não é o R2 — serve pra testar upload/exclusão de imagem do chat, mas
  os arquivos ficam só no seu volume Docker local (`docker compose down -v` apaga).
- O Next.js roda no host (`pnpm dev`), não em container — hot-reload e binários
  nativos (Prisma, `ssh2`) ficam mais simples assim.

## Documentação

Guia completo de deploy (Discord, Postgres, LiveKit cloud vs self-host, hospedagem do Next.js) no site de docs — projeto irmão em `../opencall-docs`, publicado em `<link quando existir>`.

## Stack

- **Front + back**: Next.js (App Router), um processo único (ver nota abaixo)
- **Auth**: Discord OAuth (NextAuth), acesso controlado por role no Postgres — primeiro usuário criado vira ADMIN automaticamente
- **Banco**: PostgreSQL (Prisma)
- **Voz/vídeo**: LiveKit, cloud ou self-host
- **Arquivos**: Cloudflare R2 (S3-compatible)

## Restrição de deploy importante

Chat, presença e chamadas em tempo real usam Server-Sent Events com pub/sub **em memória** (não Redis) — por isso o app precisa rodar como **um único processo Node persistente**. Funciona em qualquer VPS/container de longa duração (Railway, Fly.io, Docker na sua própria VPS). **Não funciona em plataformas serverless (Vercel, Netlify Functions)** sem antes trocar o pub/sub por Redis — ver documentação de deploy.

## Licença

MIT — ver [LICENSE](./LICENSE).
