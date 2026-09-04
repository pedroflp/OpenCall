'use client';

import { useTranslations } from 'next-intl';
import DevicePairingPanel from '@/components/DevicePairingModal/DevicePairingPanel';

/**
 * Entrar na mesma conta em outro aparelho, sem senha: o QR pra câmera do
 * celular e o código de 6 caracteres pra quem vai digitar.
 *
 * É o mesmo painel do `DevicePairingModal` que o menu da sidebar abre — o modal
 * continua existindo como atalho, e os dois compartilham o corpo pra não
 * divergirem.
 *
 * `active` é o gate, e nesta aba ele não é formalidade: sem ele o painel
 * ficaria fazendo polling a cada 1,5s por trás de qualquer outra aba.
 */
export default function AccountLinkTab({ active }: { active: boolean }) {
  const t = useTranslations('settings.accountLink');

  return (
    <div className="space-y-4">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{t('heading')}</p>
        <p className="mt-1 text-xs text-muted-foreground">{t('description')}</p>
      </div>

      {/* `max-w-xs` é a largura do modal irmão: o QR tem 240px fixos, e num vão
          largo ele ficaria boiando no meio de uma coluna vazia. */}
      <DevicePairingPanel active={active} autoStart={false} className="max-w-xs" />
    </div>
  );
}
