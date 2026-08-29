'use client';

import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export default function ControlButton({
  label,
  active,
  danger,
  dangerSoft,
  disabled,
  onClick,
  className,
  children,
}: {
  label: string;
  active?: boolean;
  danger?: boolean;
  dangerSoft?: boolean;
  disabled?: boolean;
  onClick: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          size="icon"
          variant={danger ? 'destructive' : active ? 'default' : 'secondary'}
          aria-label={label}
          aria-pressed={danger ? undefined : active}
          disabled={disabled}
          onClick={(event) => {
            event.stopPropagation();
            onClick();
          }}
          className={cn('rounded-lg', dangerSoft && 'bg-destructive/20 text-destructive hover:bg-destructive/30', className)}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
