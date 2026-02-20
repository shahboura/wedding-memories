import type { MediaProps } from './types';

export const PHOTOS_PAGE_SIZE = 50;
export const PHOTOS_PAGE_SIZE_MAX = 120;

interface MediaCursorPayload {
  publicId: string;
  uploadDate?: string;
}

function encodeBase64Url(value: string): string {
  if (typeof window === 'undefined') {
    return Buffer.from(value, 'utf-8').toString('base64url');
  }
  const encoded = btoa(unescape(encodeURIComponent(value)));
  return encoded.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function decodeBase64Url(value: string): string {
  if (typeof window === 'undefined') {
    return Buffer.from(value, 'base64url').toString('utf-8');
  }
  const padded = value
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(value.length / 4) * 4, '=');
  return decodeURIComponent(escape(atob(padded)));
}

export function encodeMediaCursor(item: MediaProps): string {
  const payload: MediaCursorPayload = {
    publicId: item.public_id,
    uploadDate: item.uploadDate,
  };
  return encodeBase64Url(JSON.stringify(payload));
}

export function decodeMediaCursor(cursor: string): MediaCursorPayload | null {
  try {
    const raw = decodeBase64Url(cursor);
    const parsed = JSON.parse(raw) as MediaCursorPayload;
    if (!parsed.publicId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function paginateMedia(
  items: MediaProps[],
  options: { cursor?: string | null; limit?: number } = {}
): { items: MediaProps[]; nextCursor: string | null } {
  const { cursor, limit = PHOTOS_PAGE_SIZE } = options;
  let startIndex = 0;

  if (cursor) {
    const decoded = decodeMediaCursor(cursor);
    if (decoded) {
      const matchIndex = items.findIndex(
        (item) => item.public_id === decoded.publicId && item.uploadDate === decoded.uploadDate
      );
      if (matchIndex >= 0) {
        startIndex = matchIndex + 1;
      }
    }
  }

  const pagedItems = items.slice(startIndex, startIndex + limit);
  const lastItem = pagedItems[pagedItems.length - 1];
  const hasMore = startIndex + limit < items.length;
  const nextCursor = lastItem && hasMore ? encodeMediaCursor(lastItem) : null;

  return { items: pagedItems, nextCursor };
}
