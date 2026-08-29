/** Dispara best-effort pra /api/dev/client-error — nunca deixa o error boundary quebrar por causa do próprio report. */
export function reportClientError(boundary: string, error: Error & { digest?: string }) {
  try {
    const payload = JSON.stringify({
      boundary,
      message: error.message,
      stack: error.stack,
      digest: error.digest,
      url: typeof window !== 'undefined' ? window.location.href : undefined,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
    });

    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      navigator.sendBeacon('/api/dev/client-error', new Blob([payload], { type: 'application/json' }));
      return;
    }

    fetch('/api/dev/client-error', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload, keepalive: true }).catch(() => {});
  } catch {
    // reporting nunca pode ser a causa de um segundo crash
  }
}
