'use client';

import { useState } from 'react';
import Image from 'next/image';
import type { AttachmentDTO } from '@/lib/chat/dto';
import AudioPlayer from './AudioPlayer';
import FileCard from './FileCard';
import VideoPlayer from './VideoPlayer';

function ImageBubble({ attachment, onClick }: { attachment: AttachmentDTO; onClick: () => void }) {
  const [optimizerFailed, setOptimizerFailed] = useState(false);

  // GIF nunca passa pelo otimizador: ele devolve um frame estático e a imagem
  // para de animar (mesmo motivo do GifEmbed em messageContent.tsx).
  const unoptimized = optimizerFailed || attachment.mime === 'image/gif';

  // Sem dimensão (linha anterior à migração, ou upload cujo metadata não foi
  // lido) não dá pra reservar a caixa nem usar next/image — cai num <img> com
  // teto de altura, que é feio de layout mas nunca deixa a imagem sumir.
  if (!attachment.width || !attachment.height) {
    return (
      <button type="button" onClick={onClick} className="mt-1.5 block overflow-hidden rounded-[10px] border border-border/50 bg-muted/40">
        {/* eslint-disable-next-line @next/next/no-img-element -- sem width/height conhecidos, next/image não é utilizável. */}
        <img src={attachment.url} alt="" loading="lazy" className="max-h-[320px] w-auto max-w-full object-contain" />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-1.5 block w-[320px] max-w-full overflow-hidden rounded-[10px] border border-border/50 bg-muted/40"
      style={{ aspectRatio: `${attachment.width} / ${attachment.height}` }}
    >
      <Image
        src={attachment.url}
        alt=""
        width={attachment.width}
        height={attachment.height}
        loading="lazy"
        sizes="320px"
        className="h-full w-full object-cover"
        unoptimized={unoptimized}
        onError={() => setOptimizerFailed(true)}
      />
    </button>
  );
}

/** Barra fina no rodapé do anexo enquanto os bytes sobem — `pointer-events-none` porque a mensagem otimista continua interativa (dá pra dar play no vídeo local). */
function UploadProgress({ progress }: { progress: number }) {
  const percent = Math.round(progress * 100);

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center gap-2 rounded-b-[10px] bg-background/85 px-2 py-1 backdrop-blur-sm">
      <div className="h-1 flex-1 overflow-hidden rounded-full bg-foreground/15">
        <div className="h-full rounded-full bg-primary transition-[width] duration-150" style={{ width: `${percent}%` }} />
      </div>
      <span className="text-[10.5px] font-semibold tabular-nums text-muted-foreground">{percent}%</span>
    </div>
  );
}

/**
 * Escolhe a forma do anexo pela espécie que o servidor farejou dos bytes (ver
 * ADR-0013) — nunca pela extensão do nome, que é o que o usuário controla.
 */
export default function AttachmentBubble({
  attachment,
  uploadProgress,
  onImageClick,
}: {
  attachment: AttachmentDTO;
  /** 0..1 na mensagem otimista com anexo subindo; undefined em tudo que já está no servidor. */
  uploadProgress?: number;
  onImageClick: () => void;
}) {
  const bubble =
    attachment.kind === 'IMAGE' ? (
      <ImageBubble attachment={attachment} onClick={onImageClick} />
    ) : attachment.kind === 'VIDEO' ? (
      <VideoPlayer attachment={attachment} />
    ) : attachment.kind === 'AUDIO' ? (
      <AudioPlayer attachment={attachment} />
    ) : (
      <FileCard attachment={attachment} />
    );

  if (uploadProgress === undefined) return bubble;

  return (
    <div className="relative inline-block max-w-full">
      {bubble}
      <UploadProgress progress={uploadProgress} />
    </div>
  );
}
