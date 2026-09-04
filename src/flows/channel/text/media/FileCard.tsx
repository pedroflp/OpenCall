'use client';

import { HugeIcon } from '@/components/HugeIcon';
import { useLocale, useTranslations } from 'next-intl';
import { fileExtension, formatBytes } from '@/lib/chat/attachments';
import type { AttachmentDTO } from '@/lib/chat/dto';
import { fileIconFor } from './format';

/**
 * Anexo que não é mídia tocável em browser (ver ADR-0013): card com o ícone da
 * extensão, nome, tamanho e download.
 *
 * O `download` do HTML é ignorado entre origens diferentes, e o bucket é outro
 * domínio — quem faz baixar em vez de abrir é o `Content-Disposition:
 * attachment` gravado no objeto no upload.
 */
export default function FileCard({ attachment }: { attachment: AttachmentDTO }) {
  const locale = useLocale();
  const extension = fileExtension(attachment.name);

  return (
    <a
      href={attachment.url}
      download={attachment.name}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(event) => event.stopPropagation()}
      className="group/file mt-1.5 flex w-[340px] max-w-full items-center gap-3 rounded-[12px] border border-border/50 bg-muted/40 p-2.5 transition-colors hover:bg-muted/70"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-background/70 text-muted-foreground">
        <HugeIcon name={fileIconFor(attachment.name)} size={21} />
      </span>

      <span className="min-w-0 flex-1">
        <span title={attachment.name} className="block truncate text-[13.5px] font-semibold">
          {attachment.name}
        </span>
        <span className="mt-0.5 block text-[11.5px] uppercase text-muted-foreground">
          {extension ? `${extension} · ` : ''}
          {formatBytes(attachment.bytes, locale)}
        </span>
      </span>

      <span className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors group-hover/file:text-foreground">
        <HugeIcon name="download-04" size={18} />
      </span>
    </a>
  );
}
