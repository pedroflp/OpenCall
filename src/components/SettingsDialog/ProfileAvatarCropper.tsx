'use client';
import { useTranslations } from 'next-intl';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { HugeIcon } from '@/components/HugeIcon';
import { Slider } from '@/components/ui/slider';
import type { CropRect } from '@/lib/profile/avatarStorage';

/**
 * Enquadramento da foto de perfil: arrastar pra mover, zoom pra aproximar.
 *
 * INLINE na aba, e não um Dialog por cima do Dialog de Configurações — dois
 * focus traps empilhados pra mostrar uma imagem é o que o repo já decidiu
 * evitar (ver o cabeçalho de SoundboardManageTable). Enquanto o cropper está
 * aberto ele É a aba; cancelar devolve o formulário.
 *
 * Só abre pra imagem ESTÁTICA. Em animado o enquadramento é central e o
 * servidor faz sozinho (ver processAvatar).
 *
 * O RECORTE VAI EM PIXELS DA IMAGEM ORIGINAL, não em pixels da tela: quem
 * recorta é o sharp, no servidor, e ele nunca viu esta viewport. `baseScale`
 * é a conversão entre os dois — o quanto a imagem foi reduzida pra caber
 * cobrindo o quadrado de preview.
 */

/** Lado do quadrado de preview. Não tem relação com os 512 do arquivo final — é só o tamanho em que a pessoa enquadra. */
const VIEWPORT = 288;
const MAX_ZOOM = 4;

interface Offset {
  x: number;
  y: number;
}

export default function ProfileAvatarCropper({
  file,
  saving,
  onCancel,
  onConfirm,
}: {
  file: File;
  saving: boolean;
  onCancel: () => void;
  onConfirm: (crop: CropRect) => void;
}) {
  const t = useTranslations('settings.profile.cropper');
  const [url, setUrl] = useState<string | null>(null);
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState<Offset>({ x: 0, y: 0 });
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; origin: Offset } | null>(null);

  // O object URL é revogado no cleanup: sem isso cada foto escolhida e
  // descartada seguraria o arquivo inteiro na memória da aba até recarregar.
  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    setNatural(null);
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  // Quanto a imagem encolhe pra COBRIR a viewport (o menor lado encosta nas
  // bordas). É a mesma conta do `fit: cover`, e é o que garante que nunca
  // sobra buraco atrás do recorte.
  const baseScale = natural ? VIEWPORT / Math.min(natural.width, natural.height) : 1;
  const displayed = natural
    ? { width: natural.width * baseScale * zoom, height: natural.height * baseScale * zoom }
    : { width: VIEWPORT, height: VIEWPORT };

  const clamp = useCallback(
    (next: Offset, size: { width: number; height: number }): Offset => ({
      // A imagem só anda até a borda: `VIEWPORT - largura` é o limite esquerdo
      // (negativo), 0 é o direito. Fora disso apareceria vazio no recorte.
      x: Math.min(0, Math.max(VIEWPORT - size.width, next.x)),
      y: Math.min(0, Math.max(VIEWPORT - size.height, next.y)),
    }),
    [],
  );

  // Zoom mantém o CENTRO da viewport parado. Sem isto a imagem escorrega pro
  // canto a cada passo do slider e a pessoa reposiciona a cada zoom.
  const applyZoom = useCallback(
    (nextZoom: number) => {
      if (!natural) return;
      const clampedZoom = Math.min(MAX_ZOOM, Math.max(1, nextZoom));
      const nextSize = {
        width: natural.width * baseScale * clampedZoom,
        height: natural.height * baseScale * clampedZoom,
      };
      setOffset((current) => {
        const ratio = clampedZoom / zoom;
        const center = VIEWPORT / 2;
        return clamp({ x: center - (center - current.x) * ratio, y: center - (center - current.y) * ratio }, nextSize);
      });
      setZoom(clampedZoom);
    },
    [baseScale, clamp, natural, zoom],
  );

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (saving) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, origin: offset };
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setOffset(
      clamp(
        { x: drag.origin.x + (event.clientX - drag.startX), y: drag.origin.y + (event.clientY - drag.startY) },
        displayed,
      ),
    );
  }

  function endDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
  }

  function confirm() {
    if (!natural) return;
    const pixelsPerScreenUnit = 1 / (baseScale * zoom);
    onConfirm({
      x: Math.max(0, Math.round(-offset.x * pixelsPerScreenUnit)),
      y: Math.max(0, Math.round(-offset.y * pixelsPerScreenUnit)),
      size: Math.round(VIEWPORT * pixelsPerScreenUnit),
    });
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <div
        // `touch-none` é o que faz o arraste funcionar no toque: sem ele o
        // navegador trata o gesto como rolagem da página e o pointermove nunca
        // chega aqui.
        className="relative shrink-0 cursor-grab touch-none overflow-hidden rounded-panel bg-black/40 active:cursor-grabbing"
        style={{ width: VIEWPORT, height: VIEWPORT }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onWheel={(event) => applyZoom(zoom - event.deltaY * 0.002)}
      >
        {url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt=""
            draggable={false}
            onLoad={(event) => {
              const image = event.currentTarget;
              setNatural({ width: image.naturalWidth, height: image.naturalHeight });
              // Começa CENTRALIZADO: é o enquadramento que a pessoa esperaria
              // se não mexesse em nada, e o mesmo que o animado recebe.
              const scale = VIEWPORT / Math.min(image.naturalWidth, image.naturalHeight);
              setOffset({
                x: (VIEWPORT - image.naturalWidth * scale) / 2,
                y: (VIEWPORT - image.naturalHeight * scale) / 2,
              });
            }}
            className="max-w-none select-none"
            style={{
              width: displayed.width,
              height: displayed.height,
              transform: `translate(${offset.x}px, ${offset.y}px)`,
            }}
          />
        )}

        {/* A máscara redonda é o recorte VISUAL — o arquivo continua quadrado
            (é assim que todo avatar do app é servido, e o `<img>` redondo é
            quem arredonda). O escurecido de fora sai de um box-shadow com
            spread gigante, que é o jeito de escurecer "tudo menos o círculo"
            sem um segundo elemento com clip-path. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-full shadow-crop-scrim ring-1 ring-white/40"
        />
      </div>

      <div className="flex w-full max-w-xs items-center gap-3">
        <HugeIcon name="image-01" size={14} className="shrink-0 text-muted-foreground" />
        <Slider
          value={[zoom]}
          min={1}
          max={MAX_ZOOM}
          step={0.02}
          aria-label={t('zoomIn')}
          disabled={saving || !natural}
          onValueChange={([next]) => applyZoom(next)}
        />
        <HugeIcon name="image-01" size={20} className="shrink-0 text-muted-foreground" />
      </div>

      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={saving}>
          {t('cancel')}
        </Button>
        <Button size="sm" onClick={confirm} disabled={saving || !natural}>
          {t('use')}
        </Button>
      </div>
    </div>
  );
}
