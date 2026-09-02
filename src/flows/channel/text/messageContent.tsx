import { Fragment, useEffect, useState } from 'react';
import Image from 'next/image';
import AvatarCircleSmall from '@/components/Avatar';
import { cn } from '@/lib/utils';
import { gifMediaUrl, soleGifUrl } from '@/lib/chat/gifUrl';
import { soleYoutubeVideoId, youtubeVideoId, youtubeWatchUrl } from '@/lib/chat/youtubeUrl';
import type { MessageDTO } from '@/lib/chat/dto';

type Mentions = MessageDTO['mentions'];

/** Markdown inline só — nada de bloco (título, lista, citação). A dor real é link clicável; o resto é ênfase básica que já se digita naturalmente no chat. */
const INLINE_SOURCE = [
  '(?<code>`[^`\\n]+`)',
  // A ênfase só abre em começo de palavra (o `lead` é consumido e devolvido
  // como texto): sem isso "2*4*5" vira itálico e "snake_case_var" vira
  // "snakecasevar". Lookbehind resolveria em uma linha, mas Safari antigo
  // estoura SyntaxError na hora de compilar o módulo — não vale o risco.
  // Ordem importa dentro do grupo: **negrito** antes de *itálico*, senão
  // o itálico casa só o primeiro asterisco.
  '(?<lead>^|[\\s([{<"\'])(?:(?<bold>\\*\\*(?![\\s*])[^\\n]+?\\*\\*)|(?<strike>~~(?![\\s~])[^\\n]+?~~)|(?<italic>\\*(?![\\s*])[^*\\n]+\\*|_(?![\\s_])[^_\\n]+_))',
  '(?<mdlink>\\[[^\\]\\n]+\\]\\((?:https?://|www\\.)[^\\s)]+\\))',
  '(?<url>(?:https?://|www\\.)[^\\s]+)',
].join('|');

const MD_LINK_RE = /^\[([^\]\n]+)\]\((.+)\)$/;
/** Pontuação que quase sempre é da frase, não da URL ("olha o https://a.com, viu?"). */
const TRAILING_PUNCTUATION_RE = /[.,;:!?)\]}'"»…]+$/;
const USABLE_URL_RE = /^(?:https?:\/\/|www\.)\S/;

const MAX_DEPTH = 3;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function MentionChip({ mention }: { mention: Mentions[number] }) {
  return (
    <span className="mx-0.5 inline-flex translate-y-[3px] items-center gap-1 rounded-full bg-primary/15 px-1.5 py-0.5 align-baseline text-[13px] font-semibold text-primary">
      <AvatarCircleSmall image={mention.avatar} fallback={mention.username.slice(0, 2)} size={4} />
      {mention.username}
    </span>
  );
}

function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href.startsWith('www.') ? `https://${href}` : href}
      target="_blank"
      rel="noopener noreferrer nofollow"
      onClick={(event) => event.stopPropagation()}
      className="break-all font-medium text-primary underline-offset-2 hover:underline"
    >
      {children}
    </a>
  );
}

/** Troca cada "@username" mencionado por um chip com avatar — o resto continua texto puro. */
function renderMentions(text: string, mentions: Mentions, keyPrefix: string): React.ReactNode[] {
  if (!text) return [];
  if (mentions.length === 0) return [text];

  const byUsername = new Map(mentions.map((mention) => [mention.username, mention]));
  const pattern = new RegExp(`@(${mentions.map((mention) => escapeRegExp(mention.username)).join('|')})\\b`, 'g');

  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = pattern.exec(text))) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    const mention = byUsername.get(match[1]);
    if (mention) parts.push(<MentionChip key={`${keyPrefix}m${key++}`} mention={mention} />);
    else parts.push(match[0]);
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));

  return parts;
}

function renderInline(text: string, mentions: Mentions, keyPrefix: string, depth: number): React.ReactNode[] {
  if (depth > MAX_DEPTH) return renderMentions(text, mentions, keyPrefix);

  const pattern = new RegExp(INLINE_SOURCE, 'g');
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = pattern.exec(text))) {
    const groups = match.groups as Record<string, string | undefined>;
    const nodeKey = `${keyPrefix}i${key++}`;
    const lead = groups.lead ?? '';
    let consumed = match[0];
    let node: React.ReactNode;

    if (groups.code) {
      node = (
        <code key={nodeKey} className="rounded bg-foreground/10 px-1 py-px font-mono text-[13px]">
          {groups.code.slice(1, -1)}
        </code>
      );
    } else if (groups.bold) {
      node = <strong key={nodeKey} className="font-bold">{renderInline(groups.bold.slice(2, -2), mentions, `${nodeKey}-`, depth + 1)}</strong>;
    } else if (groups.strike) {
      node = <s key={nodeKey} className="opacity-70">{renderInline(groups.strike.slice(2, -2), mentions, `${nodeKey}-`, depth + 1)}</s>;
    } else if (groups.italic) {
      node = <em key={nodeKey}>{renderInline(groups.italic.slice(1, -1), mentions, `${nodeKey}-`, depth + 1)}</em>;
    } else if (groups.mdlink) {
      const [, label, href] = MD_LINK_RE.exec(groups.mdlink)!;
      node = (
        <ExternalLink key={nodeKey} href={href}>
          {renderInline(label, mentions, `${nodeKey}-`, depth + 1)}
        </ExternalLink>
      );
    } else {
      // URL solta: devolve a pontuação final pro texto antes de virar link.
      const url = groups.url!.replace(TRAILING_PUNCTUATION_RE, '');
      pattern.lastIndex -= groups.url!.length - url.length;
      consumed = url;
      node = USABLE_URL_RE.test(url) ? (
        <ExternalLink key={nodeKey} href={url}>
          {url}
        </ExternalLink>
      ) : (
        url
      );
    }

    const before = text.slice(lastIndex, match.index) + lead;
    if (before) nodes.push(...renderMentions(before, mentions, `${nodeKey}p`));
    nodes.push(node);
    lastIndex = match.index + consumed.length;
  }

  if (lastIndex < text.length) nodes.push(...renderMentions(text.slice(lastIndex), mentions, `${keyPrefix}end`));

  return nodes;
}

/**
 * GIF não passa pelo next/image: o optimizer devolve um frame estático, o GIF
 * para de animar. Enquanto carrega, a caixa reserva uma altura — sem isso a
 * mensagem cresce depois do scroll pro fundo e a lista pula.
 */
function GifEmbed({ url }: { url: string }) {
  const [loaded, setLoaded] = useState(false);

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className={cn(
        'mt-1.5 block w-[280px] max-w-full overflow-hidden rounded-[10px] border border-border/50 bg-muted/40',
        !loaded && 'aspect-[4/3] animate-pulse',
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- GIF externo: next/image mata a animação. */}
      <img
        src={url}
        alt="GIF"
        loading="lazy"
        onLoad={() => setLoaded(true)}
        className={cn('h-full w-full object-cover', !loaded && 'opacity-0')}
      />
    </a>
  );
}

/** URLs de GIF citadas no texto, sem repetir a mesma duas vezes. */
function gifUrlsIn(content: string): string[] {
  const found = new Set<string>();
  for (const token of content.split(/\s+/)) {
    const media = gifMediaUrl(token.replace(TRAILING_PUNCTUATION_RE, ''));
    if (media) found.add(media);
  }
  return [...found];
}

/** Ids de vídeo do YouTube citados no texto, sem repetir o mesmo duas vezes. */
function youtubeIdsIn(content: string): string[] {
  const found = new Set<string>();
  for (const token of content.split(/\s+/)) {
    const id = youtubeVideoId(token.replace(TRAILING_PUNCTUATION_RE, ''));
    if (id) found.add(id);
  }
  return [...found];
}

/**
 * Marca do YouTube (retângulo vermelho + triângulo branco), sem o wordmark —
 * mesma exceção do GiphyMark no GifPickerPopover: logo de marca, não ícone de
 * UI, hugeicons não tem. Geometria e vermelho (#f00) são os oficiais do
 * ícone-only do YouTube (proporção 28:20, cantos arredondados ~20% da altura).
 */
function YoutubeMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 28 20" className={className} aria-hidden focusable="false">
      <rect width="28" height="20" rx="4" fill="#f00" />
      <path d="M11.5 5.8 19.5 10 11.5 14.2Z" fill="#fff" />
    </svg>
  );
}

interface YoutubeOembedData {
  title: string;
  channel: string;
  thumbnailUrl: string;
}

// Cache em módulo: o mesmo vídeo citado em várias mensagens não deveria
// disparar uma chamada por card. `null` de uma falha some do cache pra
// permitir tentar de novo depois — só sucesso fica guardado pra sempre.
const youtubeCache = new Map<string, Promise<YoutubeOembedData | null>>();

function fetchYoutubeOembed(id: string): Promise<YoutubeOembedData | null> {
  const cached = youtubeCache.get(id);
  if (cached) return cached;

  const promise = fetch(`/api/chat/youtube-oembed?url=${encodeURIComponent(youtubeWatchUrl(id))}`)
    .then((response) => {
      if (!response.ok) throw new Error('oembed indisponível');
      return response.json() as Promise<YoutubeOembedData>;
    })
    .catch(() => {
      youtubeCache.delete(id);
      return null;
    });

  youtubeCache.set(id, promise);
  return promise;
}

/** Card com thumbnail, título e canal — busca os metadados via oEmbed (proxy nosso, ver route.ts) e some se o vídeo não existir mais. */
function YoutubeEmbed({ id }: { id: string }) {
  const [data, setData] = useState<YoutubeOembedData | null>(null);
  const [failed, setFailed] = useState(false);
  const [optimizerFailed, setOptimizerFailed] = useState(false);

  useEffect(() => {
    let active = true;
    fetchYoutubeOembed(id).then((result) => {
      if (!active) return;
      if (result) setData(result);
      else setFailed(true);
    });
    return () => {
      active = false;
    };
  }, [id]);

  if (failed) return null;

  return (
    <a
      href={youtubeWatchUrl(id)}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className="group mt-1.5 flex w-[360px] max-w-full items-stretch gap-2.5 overflow-hidden rounded-[10px] border border-border/50 bg-muted/40 p-2"
    >
      <div className="relative aspect-video w-[140px] shrink-0 overflow-hidden rounded-md bg-muted">
        {data && (
          <Image
            src={data.thumbnailUrl}
            alt=""
            fill
            sizes="140px"
            unoptimized={optimizerFailed}
            onError={() => setOptimizerFailed(true)}
            className="object-cover"
          />
        )}
        <div className="absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/15" />
        <YoutubeMark className="absolute bottom-1 right-1 h-4 w-auto drop-shadow" />
      </div>

      <div className="min-w-0 flex-1 py-0.5">
        {data ? (
          <>
            <p className="line-clamp-2 text-[13.5px] font-semibold leading-snug text-foreground/90">{data.title}</p>
            <p className="mt-1 truncate text-[12px] text-muted-foreground">{data.channel}</p>
          </>
        ) : (
          <div className="flex flex-col gap-1.5">
            <div className="h-3.5 w-4/5 animate-pulse rounded bg-muted-foreground/20" />
            <div className="h-3 w-1/2 animate-pulse rounded bg-muted-foreground/20" />
          </div>
        )}
      </div>
    </a>
  );
}

/**
 * Conteúdo da mensagem: markdown inline (link, negrito, itálico, tachado,
 * código), chips de menção, embed de GIF e card de vídeo do YouTube pra cada
 * link citado.
 */
export function MessageContent({ content, mentions }: { content: string; mentions: Mentions }) {
  const soleGif = soleGifUrl(content);
  if (soleGif) return <GifEmbed url={soleGif} />;

  const soleYoutubeId = soleYoutubeVideoId(content);
  if (soleYoutubeId) return <YoutubeEmbed id={soleYoutubeId} />;

  return (
    <Fragment>
      <p className="whitespace-pre-wrap break-words text-[14.5px] leading-[1.45] text-foreground/90">
        {renderInline(content, mentions, '', 0)}
      </p>
      {gifUrlsIn(content).map((url) => (
        <GifEmbed key={url} url={url} />
      ))}
      {youtubeIdsIn(content).map((id) => (
        <YoutubeEmbed key={id} id={id} />
      ))}
    </Fragment>
  );
}
