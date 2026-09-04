'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { HugeIcon } from '@/components/HugeIcon';
import { RadioGroup, RadioGroupSegment } from '@/components/ui/radio-group';
import { setUserLocale } from '@/i18n/actions';
import { isLocale, LOCALE_LABELS, LOCALES } from '@/i18n/config';

/**
 * O idioma da interface.
 *
 * Não há aviso de "salvo": a tela inteira trocar de língua já é a confirmação —
 * um toast dizendo "idioma alterado" chegaria depois do fato, e no idioma
 * errado (a mensagem é montada no render anterior à troca).
 *
 * Nada de `location.reload()`: o `router.refresh()` refaz só a árvore do
 * servidor — o layout raiz relê o cookie e devolve o catálogo novo — sem
 * derrubar o estado do cliente. Recarregar a página no meio de uma chamada
 * mataria a conexão de voz só pra trocar de língua.
 *
 * A lista sai de `LOCALES`, não de dois botões escritos à mão: um terceiro
 * idioma no `config.ts` aparece aqui sem tocar neste arquivo.
 */
export default function LanguageTab() {
  const t = useTranslations('settings.language');
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function change(next: string) {
    if (!isLocale(next) || next === locale) return;

    startTransition(async () => {
      await setUserLocale(next);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{t('heading')}</p>
        <p className="mt-1 text-xs text-muted-foreground">{t('description')}</p>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">{t('label')}</p>

        {/* `orientation="horizontal"` porque os segmentos ficam lado a lado: é
            o que diz ao Radix que as setas ←→ (e não ↑↓) navegam entre eles.
            Sem isso o teclado andaria no eixo errado dentro de um modal cujas
            ABAS já usam ↑↓. */}
        <RadioGroup
          orientation="horizontal"
          value={locale}
          onValueChange={change}
          disabled={pending}
          className="grid-flow-col rounded-lg bg-muted p-1"
          aria-label={t('label')}
        >
          {LOCALES.map((item) => (
            <RadioGroupSegment key={item} value={item}>
              {/* O check ocupa lugar fixo (`w-4`) mesmo vazio: sem isso o
                  rótulo do segmento escolhido pularia alguns pixels pro lado a
                  cada troca. */}
              <span className="flex w-4 justify-center">
                {item === locale && <HugeIcon name="tick-02" size={14} />}
              </span>
              {LOCALE_LABELS[item].name}
            </RadioGroupSegment>
          ))}
        </RadioGroup>
      </div>
    </div>
  );
}
