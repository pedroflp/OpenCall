'use client';

import { useEffect, useRef, useState } from 'react';
import { createLocalAudioTrack, type LocalAudioTrack } from 'livekit-client';
import { HugeIcon } from '@/components/HugeIcon';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Slider } from '@/components/ui/slider';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useToast } from '@/components/ui/use-toast';
import {
  applyMicProcessing,
  audioDeviceConstraint,
  createAudioContext,
  NOISE_GATE_MAX_DB,
  NOISE_GATE_MIN_DB,
} from '@/lib/rtc/noiseSuppression';
import { useVoice } from '@/providers/VoiceProvider';
import AudioWaveform from './AudioWaveform';

// Sem sinkId explícito o preview toca no dispositivo padrão do navegador, e
// não no que está escolhido nas configurações sonoras. 'default' (em vez de
// simplesmente pular a chamada) importa porque o LiveKit recicla elementos de
// áudio de um pool global: um elemento reaproveitado pode vir com o sinkId de
// um uso anterior grudado nele.
async function applyOutputDevice(element: HTMLMediaElement, outputDeviceId: string) {
  if (!('setSinkId' in element)) return;
  try {
    await (element as HTMLMediaElement & { setSinkId(id: string): Promise<void> }).setSinkId(outputDeviceId || 'default');
  } catch {
    // Navegador sem suporte ou sem permissão pro dispositivo — segue no padrão
    // em vez de derrubar o teste inteiro.
  }
}

// A track processada (pós-gate) é o que realmente vai pro alto-falante — usa
// ela quando existe pra waveform refletir o corte, não o áudio cru.
function attachAnalyser(context: AudioContext, track: LocalAudioTrack): AnalyserNode {
  const analyser = context.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0.7;
  const liveTrack = track.getProcessor()?.processedTrack ?? track.mediaStreamTrack;
  context.createMediaStreamSource(new MediaStream([liveTrack])).connect(analyser);
  return analyser;
}

// Preview isolado, sem publicar nada — funciona mesmo fora do canal. Cria uma
// track de microfone só local, aplica o gate e toca de volta no dispositivo de
// saída escolhido, pra ouvir o resultado antes de entrar em voz.
function useSelfListenPreview(
  thresholdDb: number,
  inputDeviceId: string,
  outputDeviceId: string,
  inChannel: boolean,
  deafened: boolean,
  toggleDeafen: () => Promise<void>
) {
  const [active, setActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const trackRef = useRef<LocalAudioTrack | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  // true só quando FOMOS NÓS que ligamos o deaf pra testar — se o usuário já
  // estava ensurdecido antes, não mexemos nele nem ao ligar nem ao desligar.
  const autoDeafenedRef = useRef(false);
  const { toast } = useToast();

  const stopTrack = () => {
    audioElRef.current?.remove();
    audioElRef.current = null;
    trackRef.current?.stop();
    trackRef.current = null;
    void audioContextRef.current?.close().catch(() => {});
    audioContextRef.current = null;
  };

  const stop = () => {
    stopTrack();
    setActive(false);
    setAnalyser(null);
    if (autoDeafenedRef.current) {
      autoDeafenedRef.current = false;
      void toggleDeafen();
    }
  };

  const start = async () => {
    setLoading(true);
    try {
      const track = await createLocalAudioTrack({
        // Mesma constraint exata que o call usa — o teste tem que ouvir o
        // microfone configurado, não um que o navegador escolher por conta.
        deviceId: audioDeviceConstraint(inputDeviceId),
        echoCancellation: true,
        autoGainControl: true,
        noiseSuppression: true,
      });
      // Fora de uma Room ninguém seta isso, e o gate é um AudioWorklet —
      // setProcessor() exige um AudioContext (ver createAudioContext).
      const audioContext = createAudioContext();
      if (audioContext) {
        track.setAudioContext(audioContext);
        audioContextRef.current = audioContext;
      }
      await applyMicProcessing(track, thresholdDb, inputDeviceId);
      trackRef.current = track;

      const audioEl = track.attach();
      audioEl.muted = false;
      // setSinkId só é confiável com o elemento no documento — o attach() do
      // LiveKit devolve um elemento solto, fora da árvore.
      audioEl.style.display = 'none';
      document.body.appendChild(audioEl);
      await applyOutputDevice(audioEl, outputDeviceId);
      audioElRef.current = audioEl;
      if (audioContext) setAnalyser(attachAnalyser(audioContext, track));

      // No canal ativo, ouvir o próprio teste em cima do áudio dos outros
      // participantes seria confuso — ensurdece pra isolar o teste, só se o
      // usuário não estava ensurdecido por conta própria já.
      if (inChannel && !deafened) {
        autoDeafenedRef.current = true;
        void toggleDeafen();
      } else {
        autoDeafenedRef.current = false;
      }

      setActive(true);
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Não foi possível testar o microfone',
        description: error instanceof Error ? error.message : 'Verifique a permissão de microfone.',
      });
      stop();
    } finally {
      setLoading(false);
    }
  };

  const toggle = () => {
    if (active) stop();
    else void start();
  };

  // Trocar de MICROFONE com o preview ativo reaquire a track. O LIMIAR não
  // entra aqui de propósito: ele é ajustado ao vivo pelo próprio slider (ver
  // updateNoiseGateThreshold no onValueChange), sem reabrir o mic — reaquisitar
  // a cada pixel arrastado cortaria o áudio no meio do teste.
  useEffect(() => {
    const track = trackRef.current;
    const context = audioContextRef.current;
    if (!track) return;
    void applyMicProcessing(track, thresholdDb, inputDeviceId).then(() => {
      // restartTrack troca a MediaStreamTrack por baixo — o analyser antigo
      // ficaria escutando uma track morta sem isso.
      if (context && trackRef.current === track) setAnalyser(attachAnalyser(context, track));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputDeviceId]);

  // Trocar a saída nas configurações sonoras com o teste rolando também tem
  // que redirecionar o áudio na hora, sem reabrir o microfone.
  useEffect(() => {
    const element = audioElRef.current;
    if (!element) return;
    void applyOutputDevice(element, outputDeviceId);
  }, [outputDeviceId]);

  useEffect(() => stopTrack, []);

  return { active, loading, toggle, stop, analyser };
}

export default function MicSettingsPopover({ trigger }: { trigger: React.ReactNode }) {
  const { noiseGateThreshold, setNoiseGateThreshold, inputDeviceId, outputDeviceId, channel, deafened, toggleDeafen } = useVoice();
  const [open, setOpen] = useState(false);
  const preview = useSelfListenPreview(noiseGateThreshold, inputDeviceId, outputDeviceId, channel !== null, deafened, toggleDeafen);

  // Fechar o popover com o preview ligado deixaria o mic capturando e o áudio
  // tocando sem nenhum indicador visível — encerra o teste junto com o fechamento.
  useEffect(() => {
    if (!open && preview.active) preview.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, preview.active, preview.stop]);

  return (
    <Tooltip>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <TooltipTrigger asChild>{trigger}</TooltipTrigger>
        </PopoverTrigger>
        <PopoverContent align="start" sideOffset={12} className="space-y-3 border-0">
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Microfone</p>

          <div className="space-y-2">
            <div className="flex items-baseline justify-between gap-2">
              <Label htmlFor="noise-gate">Sensibilidade</Label>
              <span className="text-[11px] tabular-nums text-muted-foreground">{noiseGateThreshold} dB</span>
            </div>

            {/* O slider cresce pra DIREITA na direção de "abre mais fácil": o
                limiar em dB é negativo, então o valor cru cresce ao contrário do
                que a barra sugere. Invertendo aqui, arrastar pra direita é
                sempre "captar mais", que é como a pessoa lê a barra. */}
            <Slider
              id="noise-gate"
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

          <Button type="button" variant="secondary" size="sm" className="w-full gap-2" disabled={preview.loading} onClick={preview.toggle}>
            <HugeIcon name={preview.active ? 'mic-off-02' : 'mic-02'} size={15} />
            {preview.active ? 'Parar de ouvir' : 'Ouvir a si mesmo'}
          </Button>
          <AudioWaveform analyser={preview.analyser} active={preview.active} />
          <p className="text-[11px] text-muted-foreground">Use fones de ouvido pra evitar eco no teste.</p>
        </PopoverContent>
      </Popover>
      <TooltipContent>Configurações do microfone</TooltipContent>
    </Tooltip>
  );
}
