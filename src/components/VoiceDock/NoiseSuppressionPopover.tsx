'use client';

import { useEffect, useRef, useState } from 'react';
import { createLocalAudioTrack, type LocalAudioTrack } from 'livekit-client';
import { HugeIcon } from '@/components/HugeIcon';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useToast } from '@/components/ui/use-toast';
import {
  applyNoiseSuppressionMode,
  audioDeviceConstraint,
  createAudioContext,
  isKrispSupported,
  type NoiseSuppressionMode,
} from '@/lib/rtc/noiseSuppression';
import { useVoice } from '@/providers/VoiceProvider';
import AudioWaveform from './AudioWaveform';
import KrispLogo from './KrispLogo';

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

// A track processada (pós-Krisp) é o que realmente vai pro alto-falante — usa
// ela quando existe pra waveform refletir a supressão, não o áudio cru.
function attachAnalyser(context: AudioContext, track: LocalAudioTrack): AnalyserNode {
  const analyser = context.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0.7;
  const liveTrack = track.getProcessor()?.processedTrack ?? track.mediaStreamTrack;
  context.createMediaStreamSource(new MediaStream([liveTrack])).connect(analyser);
  return analyser;
}

function OptionCard({
  selected,
  disabled,
  title,
  description,
  icon,
  onClick,
}: {
  selected: boolean;
  disabled?: boolean;
  title: React.ReactNode;
  description: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={selected}
      onClick={onClick}
      className={
        'flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 ' +
        (selected ? 'border-primary/50 bg-primary/10' : 'border-border bg-muted/30 hover:bg-muted/50')
      }
    >
      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-background/60">{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-bold">{title}</div>
        <div className="text-[11.5px] text-muted-foreground">{description}</div>
      </div>
      {selected ? (
        <HugeIcon name="checkmark-circle-02" size={18} className="shrink-0 text-primary" />
      ) : (
        <div className="size-[18px] shrink-0" />
      )}
    </button>
  );
}

// Preview isolado, sem publicar nada — funciona mesmo fora do canal. Cria uma
// track de microfone só local, aplica o modo selecionado e toca de volta no
// dispositivo de saída escolhido, pra ouvir o resultado antes de entrar em voz.
function useSelfListenPreview(
  mode: NoiseSuppressionMode,
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
        noiseSuppression: mode === 'default',
      });
      // Fora de uma Room ninguém seta isso — setProcessor() exige um
      // AudioContext mesmo que o preview comece em modo padrão, porque o
      // usuário pode trocar pra Krisp com o teste já rodando (ver efeito abaixo).
      const audioContext = createAudioContext();
      if (audioContext) {
        track.setAudioContext(audioContext);
        audioContextRef.current = audioContext;
      }
      // Modo padrão já nasce correto pelas capture options acima — só o Krisp
      // precisa de uma segunda passada pra anexar o processor.
      if (mode === 'krisp') await applyNoiseSuppressionMode(track, mode, inputDeviceId);
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

  // Troca de modo com o preview ativo reaplica ao vivo, sem precisar reabrir o mic.
  useEffect(() => {
    const track = trackRef.current;
    const context = audioContextRef.current;
    if (!track) return;
    void applyNoiseSuppressionMode(track, mode, inputDeviceId).then(() => {
      // restartTrack troca a MediaStreamTrack por baixo — o analyser antigo
      // ficaria escutando uma track morta sem isso.
      if (context && trackRef.current === track) setAnalyser(attachAnalyser(context, track));
    });
  }, [mode, inputDeviceId]);

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

export default function NoiseSuppressionPopover({ trigger }: { trigger: React.ReactNode }) {
  const { noiseSuppressionMode, setNoiseSuppressionMode, inputDeviceId, outputDeviceId, channel, deafened, toggleDeafen } = useVoice();
  const [open, setOpen] = useState(false);
  const [krispSupported, setKrispSupported] = useState(true);
  const preview = useSelfListenPreview(noiseSuppressionMode, inputDeviceId, outputDeviceId, channel !== null, deafened, toggleDeafen);

  useEffect(() => {
    void isKrispSupported().then(setKrispSupported);
  }, []);

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
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Supressão de ruído</p>

          <div className="flex flex-col gap-2">
            <OptionCard
              selected={noiseSuppressionMode === 'default'}
              title="Supressão padrão"
              description="Cancelamento de eco e ruído nativo do navegador."
              icon={<HugeIcon name="audio-wave-01" size={16} />}
              onClick={() => void setNoiseSuppressionMode('default')}
            />
            <OptionCard
              selected={noiseSuppressionMode === 'krisp'}
              disabled={!krispSupported}
              title="Krisp"
              description={krispSupported ? 'Modelo de IA, mais agressivo com ruído de fundo.' : 'Não suportado neste navegador.'}
              icon={<KrispLogo height={14} />}
              onClick={() => void setNoiseSuppressionMode('krisp')}
            />
          </div>

          <Button type="button" variant="secondary" size="sm" className="w-full gap-2" disabled={preview.loading} onClick={preview.toggle}>
            <HugeIcon name={preview.active ? 'mic-off-02' : 'mic-02'} size={15} />
            {preview.active ? 'Parar de ouvir' : 'Ouvir a si mesmo'}
          </Button>
          <AudioWaveform analyser={preview.analyser} active={preview.active} />
          <p className="text-[11px] text-muted-foreground">Use fones de ouvido pra evitar eco no teste.</p>
        </PopoverContent>
      </Popover>
      <TooltipContent>Supressão de ruído</TooltipContent>
    </Tooltip>
  );
}
