import { fileExtension } from '@/lib/chat/attachments';

/** `m:ss` até uma hora, `h:mm:ss` depois — o mesmo formato que todo player usa. */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';

  const total = Math.floor(seconds);
  const s = total % 60;
  const m = Math.floor(total / 60) % 60;
  const h = Math.floor(total / 3600);

  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  return `${h > 0 ? `${h}:` : ''}${mm}:${String(s).padStart(2, '0')}`;
}

const ICON_BY_EXTENSION: Record<string, string> = {
  pdf: 'pdf-01',
  zip: 'file-zip',
  rar: 'file-zip',
  '7z': 'file-zip',
  gz: 'file-zip',
  tar: 'file-zip',
  txt: 'txt-01',
  log: 'txt-01',
  md: 'txt-01',
  csv: 'csv-01',
  doc: 'doc-01',
  docx: 'doc-01',
  xls: 'file-spreadsheet',
  xlsx: 'file-spreadsheet',
  ppt: 'ppt-01',
  pptx: 'ppt-01',
  json: 'file-code',
  js: 'file-code',
  ts: 'file-code',
  tsx: 'file-code',
  html: 'file-code',
  css: 'file-code',
  sql: 'file-database',
  // Mídia que o browser não toca (ver ADR-0013) chega aqui como arquivo, e
  // ainda assim merece o ícone do que é.
  mkv: 'file-video',
  avi: 'file-video',
  heic: 'file-image',
  aac: 'file-audio',
  wma: 'file-audio',
};

export function fileIconFor(fileName: string): string {
  return ICON_BY_EXTENSION[fileExtension(fileName)] ?? 'file-02';
}
