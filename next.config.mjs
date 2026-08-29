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

export default nextConfig;
