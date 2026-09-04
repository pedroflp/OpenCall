'use client';

import { useTranslations } from 'next-intl';

import type { AttachmentKind } from '@/lib/chat/attachments';

/**
 * O rótulo traduzido da espécie do anexo ("Imagem", "Vídeo", "Áudio",
 * "Arquivo") — o que era o `ATTACHMENT_KIND_LABEL` de `lib/chat/attachments`.
 *
 * Virou hook porque a tradução precisa do idioma de quem LÊ, e aquele módulo é
 * importado também pelas rotas de API, onde não existe leitor. Aqui a chave é
 * o próprio literal da espécie, então `chat.attachmentKind` tem exatamente as
 * quatro entradas do tipo — uma espécie nova quebra o build sem rótulo.
 */
export function useAttachmentKindLabel(): (kind: AttachmentKind) => string {
  const t = useTranslations('chat.attachmentKind');
  return (kind) => t(kind);
}
