'use client';

import { useEffect } from 'react';

/**
 * Chrome no Android só dispara `beforeinstallprompt` (o app ficar instalável)
 * se existir um service worker registrado com um handler de fetch — ver
 * public/sw.js e InstallAppButton. Esse componente só registra o SW, sem
 * lógica de cache própria.
 */
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }, []);

  return null;
}
