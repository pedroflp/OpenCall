'use client';

import { useTranslations } from 'next-intl';
import { HugeIcon } from '@/components/HugeIcon';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useAppVersion } from '@/hooks/useAppVersion';

function refreshApp() {
  window.location.reload();
}

/**
 * Fica de olho, em qualquer tela, se o servidor trocou de commit enquanto a
 * aba estava aberta (deploy novo) — não é possível a própria aba detectar
 * isso sozinha, o bundle já carregado nunca muda por baixo dela.
 * Canto oposto ao VoiceDock (bottom-left) e ao FeatureAlert (bottom-right) —
 * flutuante e não-bloqueante de propósito, nunca centralizado nem modal.
 */
export default function UpdateAvailableToast() {
  const t = useTranslations('update');
  const { updateAvailable } = useAppVersion();

  if (!updateAvailable) return null;

  return (
    <div className="fixed bottom-4 right-8 z-50 w-80 animate-in slide-in-from-top-4 fade-in-0 duration-300">
      <Card className="border-[1px] border-border/40 bg-gradient-to-tr from-card/60 to-primary/10 backdrop-blur-md animate-shadow-pulse">
        <CardContent className="p-4 flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <HugeIcon name="download-02" size={30} className="shrink-0 text-primary/60" />
            <div className="min-w-0">
              <p className="font-semibold leading-snug text-primary text-lg">{t('title')}</p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground mt-1 leading-snug">
            {t('description')}
            <br />
            <b>{t('callToAction')}</b>
          </p>
          <Button className="w-full bg-primary/20 hover:bg-primary/25 text-primary gap-2" onClick={refreshApp}>
            <HugeIcon name="arrow-reload-horizontal" size={16} />
            {t('action')}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
