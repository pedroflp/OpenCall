'use client';

import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Slider } from '@/components/ui/slider';
import AudioDeviceSelects from '@/components/VoiceDock/AudioDeviceSelects';
import SoundEffectsVolume from '@/components/VoiceDock/SoundEffectsVolume';
import VideoDeviceSelect from '@/components/VoiceDock/VideoDeviceSelect';
import { NOISE_GATE_MAX_DB, NOISE_GATE_MIN_DB } from '@/lib/rtc/noiseSuppression';
import { useVoice } from '@/providers/VoiceProvider';

/**
 * Entrada, saída, câmera e sensibilidade do microfone. Vieram do popover da
 * engrenagem no rodapé da sidebar, que empilhava tudo numa coluna só — já
 * estava alto demais e não tinha pra onde crescer. A engrenagem agora abre
 * esta aba (ver UserMenuPopover).
 *
 * `active` desliga a enumeração de dispositivos e o preview de câmera quando a
 * aba não está à vista: abrir a câmera atrás de outra aba acende o LED por
 * nada.
 */
export default function AudioVideoTab({ active }: { active: boolean }) {
  const { noiseGateThreshold, setNoiseGateThreshold } = useVoice();

  return (
    <div className="space-y-4">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Áudio e vídeo</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Escolha os dispositivos e ajuste a partir de que volume o seu microfone começa a sair.
        </p>
      </div>

      <AudioDeviceSelects active={active} />

      <div className="space-y-2">
        <div className="flex items-baseline justify-between gap-2">
          <Label htmlFor="noise-gate-tab">Sensibilidade do microfone</Label>
          <span className="text-[11px] tabular-nums text-muted-foreground">{noiseGateThreshold} dB</span>
        </div>

        {/* Invertido pelo mesmo motivo do popover: o limiar em dB é negativo,
            então o valor cru cresce ao contrário da barra. Assim, arrastar pra
            direita é sempre "captar mais". */}
        <Slider
          id="noise-gate-tab"
          value={[NOISE_GATE_MIN_DB + NOISE_GATE_MAX_DB - noiseGateThreshold]}
          min={NOISE_GATE_MIN_DB}
          max={NOISE_GATE_MAX_DB}
          step={1}
          onValueChange={([next]) => setNoiseGateThreshold(NOISE_GATE_MIN_DB + NOISE_GATE_MAX_DB - next)}
        />

        <p className="text-[11px] text-muted-foreground">
          Abaixo do limiar o microfone fica em silêncio. Arraste pra direita se estão dizendo que você some; pra
          esquerda se o ruído de fundo passa.
        </p>
      </div>

      <Separator />

      <VideoDeviceSelect active={active} />

      <Separator />

      <SoundEffectsVolume />
    </div>
  );
}
