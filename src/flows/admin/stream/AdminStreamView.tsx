'use client';

import { useState } from 'react';
import { useAdminRefresh } from '@/flows/admin/refresh';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { updateStreamSettings } from '@/app/api/rtc/stream-config/requests';
import {
  BITRATE_OPTIONS_KBPS,
  DEGRADATION_OPTIONS,
  FRAME_RATE_OPTIONS,
  RESOLUTION_OPTIONS,
  STREAM_PRESETS,
  type DegradationPreference,
  type StreamPresetId,
  type StreamSettings,
} from '@/lib/rtc/streamQuality';

const PRESET_IDS = Object.keys(STREAM_PRESETS) as StreamPresetId[];

// Presets da mesma resolução ficam lado a lado: escolher entre 720p30 e 720p60
// é decidir fluidez contra banda dentro da mesma imagem, o que é uma pergunta
// diferente de escolher a resolução.
const PRESET_ROWS = PRESET_IDS.reduce<StreamPresetId[][]>((rows, id) => {
  const current = rows[rows.length - 1];
  if (current && STREAM_PRESETS[current[0]].height === STREAM_PRESETS[id].height) current.push(id);
  else rows.push([id]);
  return rows;
}, []);

// Abaixo disso o encoder não tem bitrate pra sustentar a resolução e a imagem
// pixela em cena de movimento — é exatamente a combinação que faz o admin achar
// que "1080p não funciona". Aviso, não trava: pode ser escolha consciente de
// economizar banda.
const MIN_KBPS_AT_30FPS: Record<number, number> = { 540: 1000, 720: 2000, 1080: 4000 };
const MAX_BITRATE_KBPS = BITRATE_OPTIONS_KBPS[BITRATE_OPTIONS_KBPS.length - 1];

// O piso escala com o framerate porque dobrar os quadros dobra o que precisa ser
// codificado no mesmo segundo.
function minKbpsFor(height: number, frameRate: number) {
  return Math.round((MIN_KBPS_AT_30FPS[height] ?? 0) * Math.max(1, frameRate / 30));
}

function summarize(height: number, frameRate: number, maxBitrateKbps: number) {
  return `${height}p · ${frameRate} fps · ${maxBitrateKbps} kbps`;
}

export default function AdminStreamView({ settings }: { settings: StreamSettings }) {
  const refresh = useAdminRefresh();
  const { toast } = useToast();

  const [advanced, setAdvanced] = useState(settings.preset === 'custom');
  const [preset, setPreset] = useState<StreamPresetId>(
    settings.preset === 'custom' ? 'equilibrado' : settings.preset
  );
  const [height, setHeight] = useState(settings.height);
  const [frameRate, setFrameRate] = useState(settings.frameRate);
  const [maxBitrateKbps, setMaxBitrateKbps] = useState(settings.maxBitrateKbps);
  const [degradationPreference, setDegradationPreference] = useState(settings.degradationPreference);
  const [saving, setSaving] = useState(false);

  // Ligar o avançado continua de onde o preset parou em vez de zerar, e desligar
  // volta pros valores do preset — o que está na tela é sempre o que vai salvar.
  function handleAdvancedChange(enabled: boolean) {
    setAdvanced(enabled);
    if (enabled) return;
    setHeight(STREAM_PRESETS[preset].height);
    setFrameRate(STREAM_PRESETS[preset].frameRate);
    setMaxBitrateKbps(STREAM_PRESETS[preset].maxBitrateKbps);
  }

  function handlePresetChange(id: StreamPresetId) {
    setPreset(id);
    setHeight(STREAM_PRESETS[id].height);
    setFrameRate(STREAM_PRESETS[id].frameRate);
    setMaxBitrateKbps(STREAM_PRESETS[id].maxBitrateKbps);
  }

  async function handleSave() {
    setSaving(true);
    const { ok } = await updateStreamSettings({
      preset: advanced ? 'custom' : preset,
      height,
      frameRate,
      maxBitrateKbps,
      degradationPreference,
    });
    setSaving(false);

    if (!ok) {
      toast({
        title: 'Não deu pra salvar',
        description: 'Tenta de novo daqui a pouco.',
        variant: 'destructive',
      });
      return;
    }

    toast({
      title: 'Qualidade atualizada!',
      description: 'Lives em andamento já mudaram; quem abrir agora começa na config nova.',
    });
    refresh();
  }

  const dirty =
    (advanced ? 'custom' : preset) !== settings.preset ||
    height !== settings.height ||
    frameRate !== settings.frameRate ||
    maxBitrateKbps !== settings.maxBitrateKbps ||
    degradationPreference !== settings.degradationPreference;

  const minKbps = minKbpsFor(height, frameRate);
  const underfed = maxBitrateKbps < minKbps;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 overflow-y-auto px-6 py-10">
      <div>
        <h1 className="text-2xl font-bold">Transmissão</h1>
        <p className="text-sm text-muted-foreground">
          Qualidade das lives de tela. Vale para todos os canais.
        </p>
      </div>

      <section className="flex flex-col gap-4 rounded-xl border border-border/60 p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold">Qualidade</h2>
          <div className="flex items-center gap-2">
            <Label htmlFor="advanced" className="text-sm text-muted-foreground">
              Modo avançado
            </Label>
            <Switch id="advanced" checked={advanced} onCheckedChange={handleAdvancedChange} />
          </div>
        </div>

        {!advanced &&
          PRESET_ROWS.map((row) => (
            <div key={row.join('-')} className={`grid gap-3 ${row.length > 1 ? 'sm:grid-cols-2' : ''}`}>
              {row.map((id) => {
                const option = STREAM_PRESETS[id];
                const selected = preset === id;

                return (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => handlePresetChange(id)}
                    className={`flex flex-col gap-1 rounded-lg border p-4 text-left transition-colors ${
                      selected ? 'border-primary bg-primary/5' : 'border-border/60 hover:border-border'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                      <span className="font-medium">{option.label}</span>
                      <span className="text-xs text-muted-foreground">
                        {summarize(option.height, option.frameRate, option.maxBitrateKbps)}
                      </span>
                    </div>
                    <span className="text-sm text-muted-foreground">{option.hint}</span>
                  </button>
                );
              })}
            </div>
          ))}

        {advanced && (
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="resolution">Resolução</Label>
              <Select value={String(height)} onValueChange={(value) => setHeight(Number(value))}>
                <SelectTrigger id="resolution">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RESOLUTION_OPTIONS.map((option) => (
                    <SelectItem key={option.height} value={String(option.height)}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="framerate">FPS</Label>
              <Select value={String(frameRate)} onValueChange={(value) => setFrameRate(Number(value))}>
                <SelectTrigger id="framerate">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FRAME_RATE_OPTIONS.map((option) => (
                    <SelectItem key={option} value={String(option)}>
                      {option} fps
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="bitrate">Bitrate</Label>
              <Select
                value={String(maxBitrateKbps)}
                onValueChange={(value) => setMaxBitrateKbps(Number(value))}
              >
                <SelectTrigger id="bitrate">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BITRATE_OPTIONS_KBPS.map((option) => (
                    <SelectItem key={option} value={String(option)}>
                      {option} kbps
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {underfed && (
          <p className="rounded-lg border border-dashed border-border/60 p-3 text-sm text-muted-foreground">
            {height}p a {frameRate} fps com {maxBitrateKbps} kbps vai pixelar em cena de movimento — o
            encoder não gasta bitrate que o teto não libera.{' '}
            {minKbps > MAX_BITRATE_KBPS
              ? `Essa combinação pede ~${minKbps} kbps e não cabe no teto de ${MAX_BITRATE_KBPS} kbps: baixe a resolução ou o fps.`
              : `Para essa combinação, use pelo menos ${minKbps} kbps.`}
          </p>
        )}
      </section>

      <section className="flex flex-col gap-4 rounded-xl border border-border/60 p-5">
        <div>
          <h2 className="font-semibold">Sob congestionamento</h2>
          <p className="text-sm text-muted-foreground">
            O que sacrificar quando a banda de quem transmite não dá conta.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {DEGRADATION_OPTIONS.map((option) => {
            const selected = degradationPreference === option.value;

            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={selected}
                onClick={() => setDegradationPreference(option.value as DegradationPreference)}
                className={`flex flex-col gap-1 rounded-lg border p-4 text-left transition-colors ${
                  selected ? 'border-primary bg-primary/5' : 'border-border/60 hover:border-border'
                }`}
              >
                <span className="font-medium">{option.label}</span>
                <span className="text-sm text-muted-foreground">{option.hint}</span>
              </button>
            );
          })}
        </div>
      </section>

      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Vale na hora: {summarize(height, frameRate, maxBitrateKbps)}
        </p>
        <Button onClick={handleSave} disabled={!dirty || saving}>
          {saving ? 'Salvando...' : 'Salvar'}
        </Button>
      </div>
    </main>
  );
}
