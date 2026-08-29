# OpenCall

Voz, vídeo e chat de comunidade, self-hosted. Discord como auth wall, Next.js como front+back, Postgres, LiveKit (cloud ou self-host) e R2 para arquivos.

## Rodando localmente

```bash
pnpm install
cp .env.example .env.local   # preencha as variáveis (ver docs/)
pnpm prisma migrate dev
pnpm dev
```

## Documentação

Guia completo de deploy (Discord, Postgres, LiveKit cloud vs self-host, hospedagem do Next.js) no site de docs — projeto irmão em `../opencall-docs`, publicado em `<link quando existir>`.

## Stack

- **Front + back**: Next.js (App Router), um processo único (ver nota abaixo)
- **Auth**: Discord OAuth (NextAuth), acesso controlado por role no Postgres — primeiro admin via `BOOTSTRAP_ADMIN_DISCORD_IDS`
- **Banco**: PostgreSQL (Prisma)
- **Voz/vídeo**: LiveKit, cloud ou self-host
- **Arquivos**: Cloudflare R2 (S3-compatible)

## Restrição de deploy importante

Chat, presença e chamadas em tempo real usam Server-Sent Events com pub/sub **em memória** (não Redis) — por isso o app precisa rodar como **um único processo Node persistente**. Funciona em qualquer VPS/container de longa duração (Railway, Fly.io, Docker na sua própria VPS). **Não funciona em plataformas serverless (Vercel, Netlify Functions)** sem antes trocar o pub/sub por Redis — ver documentação de deploy.

## Licença

MIT — ver [LICENSE](./LICENSE).
