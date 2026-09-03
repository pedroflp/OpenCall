'use client';

import { useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { ChannelType } from '@prisma/client';
import { HugeIcon } from '@/components/HugeIcon';
import { Dialog, DialogContent, DialogFooter, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import { routeNames } from '@/app/route.names';
import { beginChannelCreate, cancelChannelCreate, resolveChannelCreate } from '@/hooks/useChannels';
import { createChannel, updateChannel } from '@/app/api/admin/channels/requests';
import type { AdminChannelDTO } from '@/app/api/admin/channels/types';

const NAME_MAX_LENGTH = 50;
/** Teto do slider. Não é sentinela de nada: canal sem limite grava `null`. */
export const MAX_PARTICIPANTS_CEILING = 99;

type EditableChannel = Pick<AdminChannelDTO, 'id' | 'type' | 'name' | 'maxParticipants'>;

/**
 * Criar e editar canal são o mesmo formulário (pedido explícito: editar não
 * pode divergir visualmente de criar) — só o tipo trava (radio desabilitado
 * + opacidade reduzida) e o texto do rodapé/toast muda. Um `channel` presente
 * é o que decide o modo; sem ele é criação.
 *
 * `trigger` é opcional pra suportar o caso controlado de fora (ver
 * ChannelContextMenu na sidebar, que já mantém o Dialog montado e só alterna
 * `open`). Sem `onSaved`, criar navega pro canal novo (uso do botão "+" da
 * sidebar); com `onSaved`, quem chama decide o que fazer (admin/sidebar
 * editam sem navegar).
 */
export default function ChannelDialog({
  channel,
  defaultType = ChannelType.TEXT,
  trigger,
  tooltip,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  onSaved,
}: {
  channel?: EditableChannel;
  defaultType?: ChannelType;
  trigger?: ReactNode;
  tooltip?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onSaved?: (channel: AdminChannelDTO) => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const isEditing = Boolean(channel);

  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = controlledOnOpenChange ?? setUncontrolledOpen;

  const [type, setType] = useState<ChannelType>(channel?.type ?? defaultType);
  const [name, setName] = useState(channel?.name ?? '');
  const [maxParticipants, setMaxParticipants] = useState(channel?.maxParticipants ?? MAX_PARTICIPANTS_CEILING);
  const [limited, setLimited] = useState(channel?.maxParticipants != null);
  const [submitting, setSubmitting] = useState(false);

  const isVoice = type === ChannelType.VOICE;
  // POST /api/admin/channels recusa maxParticipants < 1 pra canal de voz —
  // o slider vai até 0 (pedido), mas 0 participantes trava o envio em vez de
  // criar um canal em que ninguém consegue entrar.
  const invalid = !name.trim() || (isVoice && limited && maxParticipants < 1);
  /** `null` = sem limite (toggle desligado) — é o que a API grava. */
  const limitValue = limited ? maxParticipants : null;

  function resetToChannelOrDefaults() {
    setType(channel?.type ?? defaultType);
    setName(channel?.name ?? '');
    const max = channel?.maxParticipants ?? MAX_PARTICIPANTS_CEILING;
    setMaxParticipants(max);
    setLimited(channel?.maxParticipants != null);
  }

  async function handleSubmit() {
    if (invalid) return;

    // O canal já aparece na sidebar (apagado + shimmer) enquanto o POST voa;
    // a linha só vira definitiva quando o servidor devolve o id de verdade.
    const tempId = channel ? null : beginChannelCreate(type, name.trim());

    setSubmitting(true);
    const result = channel
      ? await updateChannel(channel.id, { name: name.trim(), ...(isVoice ? { maxParticipants: limitValue } : {}) })
      : await createChannel({ type, name: name.trim(), ...(isVoice ? { maxParticipants: limitValue } : {}) });
    setSubmitting(false);

    const savedChannel = result.data?.channel as AdminChannelDTO | undefined;
    if (!result.ok || !savedChannel) {
      if (tempId) cancelChannelCreate(tempId);
      toast({
        title: isEditing ? 'Não deu pra salvar o canal' : 'Não deu pra criar o canal',
        description: 'Tenta de novo daqui a pouco.',
        variant: 'destructive',
      });
      return;
    }

    if (tempId) resolveChannelCreate(tempId, savedChannel.id);

    toast({ title: isEditing ? 'Canal atualizado!' : 'Canal criado!' });
    setOpen(false);
    resetToChannelOrDefaults();

    if (onSaved) {
      onSaved(savedChannel);
    } else if (!isEditing) {
      router.push(savedChannel.type === ChannelType.VOICE ? routeNames.CHANNEL(savedChannel.id) : routeNames.CHANNEL_TEXT_ID(savedChannel.id));
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) resetToChannelOrDefaults();
      }}
    >
      {trigger &&
        (tooltip ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <DialogTrigger asChild>{trigger}</DialogTrigger>
            </TooltipTrigger>
            <TooltipContent>{tooltip}</TooltipContent>
          </Tooltip>
        ) : (
          <DialogTrigger asChild>{trigger}</DialogTrigger>
        ))}
      <DialogContent>
        <DialogTitle>{isEditing ? 'Editar canal' : 'Novo canal'}</DialogTitle>

        <div className="space-y-4">
          <div className={cn('space-y-2 transition-opacity', isEditing && 'opacity-60')}>
            <Label>Tipo de canal</Label>
            <RadioGroup
              value={type}
              onValueChange={(value) => setType(value as ChannelType)}
              disabled={isEditing}
              className="gap-3"
            >
              <label className={cn('flex items-start gap-3', !isEditing && 'cursor-pointer')}>
                <RadioGroupItem value={ChannelType.TEXT} className="mt-1" />
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5 text-sm font-medium">
                    <HugeIcon name="hashtag" size={16} />
                    Texto
                  </div>
                  <p className="text-xs text-muted-foreground">Envie mensagens, imagens, GIFs, emojis, opiniões e piadas</p>
                </div>
              </label>
              <label className={cn('flex items-start gap-3', !isEditing && 'cursor-pointer')}>
                <RadioGroupItem value={ChannelType.VOICE} className="mt-1" />
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5 text-sm font-medium">
                    <HugeIcon name="volume-high" size={16} />
                    Voz
                  </div>
                  <p className="text-xs text-muted-foreground">Passe tempo com a turma com voz, vídeo e compartilhamento de tela</p>
                </div>
              </label>
            </RadioGroup>
            {isEditing && <p className="text-xs text-muted-foreground">O tipo não pode ser alterado depois de criado.</p>}
          </div>

          <div className="space-y-2">
            <Label>Nome</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Geral" maxLength={NAME_MAX_LENGTH} />
          </div>

          {isVoice && (
            <div className="flex items-center gap-3">
              <div className="flex shrink-0 items-center gap-2">
                <Switch
                  id="limit-channel-size"
                  checked={limited}
                  // Desligar devolve o teto ao slider: o que fica guardado pra
                  // quando religar não pode ser o número que a pessoa arrastou e
                  // não vê mais. O que vai pro banco nesse estado é `null`.
                  onCheckedChange={(next) => {
                    setLimited(next);
                    if (!next) setMaxParticipants(MAX_PARTICIPANTS_CEILING);
                  }}
                />
                <Label htmlFor="limit-channel-size" className="cursor-pointer">
                  Limitar tamanho
                </Label>
              </div>

              {limited && (
                <div className="relative flex-1">
                  <Slider
                    value={[maxParticipants]}
                    min={0}
                    max={MAX_PARTICIPANTS_CEILING}
                    step={1}
                    onValueChange={([next]) => setMaxParticipants(next)}
                  />
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs tabular-nums">{maxParticipants}</span>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button onClick={handleSubmit} disabled={invalid || submitting}>
            {isEditing ? 'Salvar alterações' : 'Criar canal'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
