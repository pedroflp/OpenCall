export interface MessageCursor {
  createdAt: Date;
  id: string;
}

/**
 * Opaco de propósito (ver D9 na RFC-008): o formato pode virar `seq` depois
 * sem quebrar client em cache — ninguém além deste módulo lê o conteúdo.
 */
export function encodeCursor(cursor: MessageCursor): string {
  return Buffer.from(`${cursor.createdAt.toISOString()}|${cursor.id}`, 'utf8').toString('base64');
}

export function decodeCursor(raw: string): MessageCursor | null {
  try {
    const decoded = Buffer.from(raw, 'base64').toString('utf8');
    const separatorIndex = decoded.lastIndexOf('|');
    if (separatorIndex === -1) return null;

    const isoDate = decoded.slice(0, separatorIndex);
    const id = decoded.slice(separatorIndex + 1);
    const createdAt = new Date(isoDate);
    if (Number.isNaN(createdAt.getTime()) || !id) return null;

    return { createdAt, id };
  } catch {
    return null;
  }
}
