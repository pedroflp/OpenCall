'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import Avatar from '@/components/Avatar';
import { HugeIcon } from '@/components/HugeIcon';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/components/ui/use-toast';
import { NICKNAME_MAX_LENGTH } from '@/lib/profile/identity';

/**
 * MODERAÇÃO da máscara de perfil de outra pessoa, aberta pelos menus de
 * moderação que já existem: o participante na sala (ParticipantTile e o par
 * dele em liquid glass), a linha da lista do canal na sidebar e a linha da
 * sidebar de atividade.
 *
 * É um componente só para as três superfícies porque é a mesma ação nas três —
 * a alternativa era o mesmo formulário escrito quatro vezes, que é exatamente
 * como onze botões de ícone nasceram neste repo (ver a regra primordial no
 * CLAUDE.md).
 *
 * O QUE O ADMIN PODE: editar o apelido, limpar o apelido e remover a foto.
 * O que ele NÃO pode é SUBIR uma foto — isso seria vestir o perfil do outro, e
 * não tem nada a ver com tirar do ar um apelido ofensivo. O servidor cobra a
 * mesma régua (ver a rota); esconder o botão aqui não protegeria nada sozinho.
 *
 * MONTE ESTE DIÁLOGO FORA DO `PopoverContent`. O conteúdo do popover desmonta
 * quando ele fecha, e clicar num item de menu fecha o popover — o diálogo
 * sumiria no mesmo quadro em que abriu.
 */

/**
 * O item de menu que abre o diálogo. Mora aqui, e não repetido em cada popover,
 * porque a marcação de item de menu (`flex w-full … hover:bg-secondary`) já
 * está copiada em quatro arquivos — uma quinta cópia é a que sai do lugar
 * quando o estilo mudar.
 */
export function ProfileModerationMenuItem({ onSelect }: { onSelect: () => void }) {
  const t = useTranslations('moderation');

  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors hover:bg-secondary"
    >
      <HugeIcon name="user-edit-01" size={16} />
      {t('editProfile')}
    </button>
  );
}

interface ProfileMask {
  displayName: string | null;
  hasCustomAvatar: boolean;
  useDiscordProfile: boolean;
  discordUsername: string;
  discordAvatar: string;
}

export default function ProfileModerationDialog({
  userId,
  open,
  onOpenChange,
}: {
  userId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('moderation');
  const tCommon = useTranslations('common');
  const { toast } = useToast();
  const [mask, setMask] = useState<ProfileMask | null>(null);
  const [nickname, setNickname] = useState('');
  const [pending, setPending] = useState(false);

  /**
   * A máscara é buscada na ABERTURA, não no mount: os menus só conhecem a
   * identidade já resolvida (o nome que está na tela), e olhando pra ela não dá
   * pra saber se é o apelido ou o do Discord. Buscar toda vez também evita
   * abrir com um valor velho de uma abertura anterior.
   */
  useEffect(() => {
    if (!open) {
      setMask(null);
      return;
    }

    let cancelled = false;
    void (async () => {
      const response = await fetch(`/api/admin/users/${userId}/profile`);
      if (cancelled) return;
      if (!response.ok) {
        toast({ title: t('openFailed'), description: t('tryAgainSoon'), variant: 'destructive' });
        onOpenChange(false);
        return;
      }
      const data = (await response.json()) as ProfileMask;
      if (cancelled) return;
      setMask(data);
      setNickname(data.displayName ?? '');
    })();

    return () => {
      cancelled = true;
    };
  }, [open, userId, onOpenChange, toast, t]);

  async function send(init: RequestInit) {
    setPending(true);
    try {
      const response = await fetch(`/api/admin/users/${userId}/profile`, init);
      if (!response.ok) throw new Error();
      onOpenChange(false);
    } catch {
      toast({ title: t('saveFailed'), description: t('tryAgainSoon'), variant: 'destructive' });
    } finally {
      setPending(false);
    }
  }

  const saveNickname = () =>
    send({
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: nickname.trim() || null }),
    });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('editProfile')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>

        {/* Skeleton com a forma do painel carregado — mesmas medidas do avatar,
            da linha de identidade e do campo, pra o conteúdo não empurrar nada
            quando chegar (o modal muda de altura na cara de quem está olhando,
            que é o pior lugar pra isso acontecer). */}
        {!mask ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="size-10 shrink-0 animate-pulse rounded-full bg-muted/60" />
              <div className="space-y-1.5">
                <div className="h-4 w-32 animate-pulse rounded-md bg-muted/60" />
                <div className="h-3 w-24 animate-pulse rounded-md bg-muted/40" />
              </div>
            </div>
            <div className="h-9 w-full animate-pulse rounded-md bg-muted/40" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Avatar image={mask.discordAvatar} fallback={mask.discordUsername.slice(0, 2)} size={10} className="shrink-0" />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{mask.discordUsername}</p>
                <p className="text-xs text-muted-foreground">{t('discordNameAndPhoto')}</p>
              </div>
            </div>

            {/* Sem esta linha, o admin apagaria um apelido que já estava
                invisível achando que resolveu a denúncia. Só sobre o APELIDO. A foto enviada aparece com o switch ligado
                ou não (ver channelsIdentity), então dizer que ela "não aparece
                pra ninguém" mandaria o admin embora achando que a foto
                imprópria já estava fora do ar. */}
            {mask.useDiscordProfile && mask.displayName && (
              <p className="flex items-start gap-2 rounded-popover-in bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                <HugeIcon name="information-circle" size={14} className="mt-0.5 shrink-0" />
                {t('hiddenNicknameNotice')}
              </p>
            )}

            <Separator />

            <div className="space-y-2">
              <label htmlFor="moderation-nickname" className="text-xs font-medium text-muted-foreground">
                {t('nickname')}
              </label>
              <div className="flex items-center gap-2">
                <Input
                  id="moderation-nickname"
                  value={nickname}
                  maxLength={NICKNAME_MAX_LENGTH}
                  placeholder={mask.discordUsername}
                  disabled={pending}
                  onChange={(event) => setNickname(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') void saveNickname();
                  }}
                />
                <Button size="sm" disabled={pending} onClick={() => void saveNickname()}>
                  {tCommon('save')}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">{t('emptyReturnsDiscord')}</p>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">{t('photo')}</p>
              {mask.hasCustomAvatar ? (
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={pending}
                  onClick={() => void send({ method: 'DELETE' })}
                >
                  <HugeIcon name="image-not-found-01" size={16} />
                  {t('removePhoto')}
                </Button>
              ) : (
                <p className="text-xs text-muted-foreground">{t('noCustomPhoto')}</p>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
