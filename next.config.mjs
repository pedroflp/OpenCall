import createNextIntlPlugin from 'next-intl/plugin';

// Aponta pro módulo que resolve idioma + catálogo por request (src/i18n/request.ts).
const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

/**
 * `next/image` recusa qualquer src que não bata com um remotePattern — e recusa
 * lançando, o que derruba a árvore inteira (o chat some, não só a imagem). O
 * curinga https abaixo cobre R2/CDN em produção, mas não o storage de
 * desenvolvimento: o MinIO do docker-compose serve em http://localhost:9000.
 * Em vez de fixar localhost, deriva do mesmo env que monta as URLs
 * (lib/r2/publicUrl) — quem apontar a base pra outro host http continua
 * funcionando.
 */
function padraoDaBasePublica() {
  const base = process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL;
  if (!base) return [];

  try {
    const { protocol, hostname, port } = new URL(base);
    if (protocol !== 'http:') return [];
    return [{ protocol: 'http', hostname, port, pathname: '/**' }];
  } catch {
    // Base inválida: publicR2Url já grita em runtime, aqui só não há o que liberar.
    return [];
  }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  // ssh2 (usado pelo refresh sob demanda de métricas via SSH, ver
  // lib/metrics/sshCollect.ts) traz um binário nativo (.node) que o bundler
  // de Server Components não sabe empacotar — precisa ficar de fora do bundle
  // e ser resolvido via require() normal do Node em runtime.
  experimental: {
    serverComponentsExternalPackages: ['ssh2'],
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
        port: '',
        pathname: '**',
      },
      ...padraoDaBasePublica(),
    ],
  },
  async headers() {
    return [
      {
        // matching all API routes
        source: "/api/:path*",
        headers: [
          { key: "Access-Control-Allow-Credentials", value: "true" },
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET,OPTIONS,PATCH,DELETE,POST,PUT" },
          { key: "Access-Control-Allow-Headers", value: "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version" },
        ]
      }
    ]
  }
};

export default withNextIntl(nextConfig);
