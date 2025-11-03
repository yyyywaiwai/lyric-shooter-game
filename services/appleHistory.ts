import { getCookie, setCookie } from '@/services/cookies';
import type { AppleHistoryEntry } from '@/types';
export type { AppleHistoryEntry } from '@/types';

export const APPLE_HISTORY_COOKIE_KEY = 'LS_APPLE_HISTORY';
export const APPLE_HISTORY_LIMIT = 10;

const sanitizeEntry = (candidate: any): AppleHistoryEntry | null => {
  if (!candidate) return null;
  const trackId = Number(candidate.trackId);
  if (!Number.isFinite(trackId)) return null;
  const url = typeof candidate.url === 'string' ? candidate.url : '';
  if (!url) return null;
  const title =
    typeof candidate.title === 'string' && candidate.title.trim().length > 0
      ? candidate.title.trim()
      : 'Unknown Title';
  const artist = typeof candidate.artist === 'string' ? candidate.artist : '';
  const artwork =
    typeof candidate.artwork === 'string' && candidate.artwork.length > 0
      ? candidate.artwork
      : undefined;
  return { trackId, url, title, artist, artwork };
};

export const loadAppleHistory = (): AppleHistoryEntry[] => {
  const raw = getCookie(APPLE_HISTORY_COOKIE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const sanitized = parsed
      .map((item) => sanitizeEntry(item))
      .filter((entry): entry is AppleHistoryEntry => entry !== null);
    return sanitized.slice(0, APPLE_HISTORY_LIMIT);
  } catch (error) {
    console.warn('Failed to parse Apple Music history cookie', error);
    return [];
  }
};

export const saveAppleHistory = (entries: AppleHistoryEntry[]): void => {
  setCookie(APPLE_HISTORY_COOKIE_KEY, JSON.stringify(entries.slice(0, APPLE_HISTORY_LIMIT)), 365);
};

export const upsertAppleHistoryEntry = (entry: AppleHistoryEntry): AppleHistoryEntry[] => {
  const existing = loadAppleHistory();
  const filtered = existing.filter(
    (item) => item.trackId !== entry.trackId && item.url !== entry.url
  );
  const updated = [entry, ...filtered].slice(0, APPLE_HISTORY_LIMIT);
  saveAppleHistory(updated);
  return updated;
};
