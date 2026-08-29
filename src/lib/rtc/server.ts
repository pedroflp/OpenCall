import { LiveKitAPI } from 'livekit-server-sdk';

const globalForLiveKit = globalThis as unknown as { __livekitApi?: LiveKitAPI };

export function livekitApi(): LiveKitAPI {
  return (globalForLiveKit.__livekitApi ??= new LiveKitAPI({
    host: livekitHttpUrl(),
    apiKey: requireEnv('LIVEKIT_API_KEY'),
    secret: requireEnv('LIVEKIT_API_SECRET'),
  }));
}

export function livekitUrl(): string {
  return requireEnv('LIVEKIT_URL');
}

function livekitHttpUrl(): string {
  return livekitUrl().replace(/^wss:/, 'https:').replace(/^ws:/, 'http:');
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} não configurada`);
  return value;
}
