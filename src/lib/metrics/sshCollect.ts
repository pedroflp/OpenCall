import { Client } from 'ssh2';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} não configurada`);
  return value;
}

const REMOTE_SCRIPT_PATH = '/opt/opencall-metrics/collect-local.sh';
const CONNECT_TIMEOUT_MS = 10_000;
const EXEC_TIMEOUT_MS = 20_000;

// Railway não deixa colar newline literal em toda UI de env var — aceita a
// chave com \n escapado e converte de volta pro formato PEM real.
function normalizePrivateKey(raw: string): string {
  return raw.includes('\\n') ? raw.replace(/\\n/g, '\n') : raw;
}

/**
 * SSH sob demanda na VPS pra rodar o mesmo coletor do cron horário (ver
 * infra/vps-metrics/collect-local.sh) — usado pelo botão de refresh do
 * admin em vez de esperar a próxima janela.
 */
export async function runRemoteCollection(): Promise<void> {
  const host = requireEnv('VPS_SSH_HOST');
  const port = Number(process.env.VPS_SSH_PORT ?? '22');
  const username = requireEnv('VPS_SSH_USER');
  const privateKey = normalizePrivateKey(requireEnv('VPS_SSH_PRIVATE_KEY'));

  await new Promise<void>((resolve, reject) => {
    const conn = new Client();
    let settled = false;

    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      conn.end();
      reject(new Error('SSH timeout ao coletar métricas da VPS'));
    }, EXEC_TIMEOUT_MS);

    function finish(fn: () => void) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      fn();
    }

    conn
      .on('ready', () => {
        conn.exec(REMOTE_SCRIPT_PATH, (execErr, stream) => {
          if (execErr) {
            finish(() => {
              conn.end();
              reject(execErr);
            });
            return;
          }

          let stderr = '';
          stream
            .on('close', (code: number) => {
              finish(() => {
                conn.end();
                if (code === 0) resolve();
                else reject(new Error(`collect-local.sh saiu com código ${code}: ${stderr.trim()}`));
              });
            })
            .stderr.on('data', (chunk: Buffer) => {
              stderr += chunk.toString();
            });
        });
      })
      .on('error', (connErr) => {
        finish(() => reject(connErr));
      })
      .connect({ host, port, username, privateKey, readyTimeout: CONNECT_TIMEOUT_MS });
  });
}
