'use client';

import { forwardRef } from 'react';
import { useTranslations } from 'next-intl';
import { HugeIcon } from '@/components/HugeIcon';
import { cn } from '@/lib/utils';

/**
 * Campo de busca — lupa, texto e botão de limpar numa caixa só.
 *
 * O poço é da CAIXA, não do input: o `<input>` fica transparente e quem tem
 * fundo, raio e anel de foco é o wrapper. É por isso que o estado de foco é
 * `:focus-within` — quem recebe o anel é a caixa, mas quem foca é o input.
 *
 * O ref vai pro input, não pro wrapper: quem usa isto quase sempre quer focar o
 * campo ao abrir o popover (`onOpenAutoFocus`), não medir a caixa.
 */

interface SearchFieldProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  value: string;
  onValueChange: (value: string) => void;
  /** Classe do wrapper — é ele que tem a forma, então largura e raio vêm por aqui. */
  className?: string;
}

const SearchField = forwardRef<HTMLInputElement, SearchFieldProps>(
  ({ value, onValueChange, className, placeholder, ...props }, ref) => {
    const t = useTranslations('common');

    return (
      <div
        className={cn(
          'flex h-auto items-center gap-2 rounded-md bg-background px-2.5 py-1.5 ring-offset-background',
          'focus-within:outline-none focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2',
          className,
        )}
      >
        <HugeIcon name="search-01" size={16} className="shrink-0 text-muted-foreground" />
        <input
          ref={ref}
          type="search"
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
          placeholder={placeholder ?? t('search')}
          className="min-w-0 flex-1 bg-transparent text-[13.5px] outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:hidden"
          {...props}
        />
        {value && (
          <button
            type="button"
            onClick={() => onValueChange('')}
            aria-label={t('clearSearch')}
            className="shrink-0 text-muted-foreground hover:text-foreground"
          >
            <HugeIcon name="cancel-01" size={14} />
          </button>
        )}
      </div>
    );
  },
);
SearchField.displayName = 'SearchField';

export { SearchField };
