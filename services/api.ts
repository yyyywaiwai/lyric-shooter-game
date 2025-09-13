import { getCookie } from '@/services/cookies';

export interface ITunesTrack {
  trackId: number;
  trackName: string;
  artistName: string;
  collectionName?: string;
  artworkUrl100?: string;
  previewUrl?: string;
  trackTimeMillis?: number;
  country?: string;
  primaryGenreName?: string;
  trackViewUrl: string;
  collectionViewUrl?: string;
}

async function readJsonStrict(res: Response): Promise<any> {
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    return res.json();
  }
  // Try json anyway first; then fall back to text for better error
  try {
    return await res.json();
  } catch {
    const txt = await res.text().catch(() => '');
    const snippet = txt?.slice(0, 300) || '(empty body)';
    throw new Error(`Non-JSON response (${res.status}): ${snippet}`);
  }
}

function normalizeBase(u: string): string | null {
  if (!u) return null;
  const raw = u.trim();
  if (!/^https?:\/\//i.test(raw)) return null;
  try {
    const url = new URL(raw);
    let origin = url.origin + url.pathname;
    origin = origin.replace(/\/$/, '');
    if (!/\/api$/i.test(origin)) origin += '/api';
    return origin;
  } catch {
    return null;
  }
}

function getApiBase(): { base: string; usingCookie: boolean; usingEnv: boolean } {
  const raw = (typeof document !== 'undefined') ? getCookie('LS_SERVER_URL') : null;
  const fromCookie = normalizeBase(raw || '');
  if (fromCookie) return { base: fromCookie, usingCookie: true, usingEnv: false };

  const envDefault = (process.env.LS_SERVER_URL_DEFAULT as string) || '';
  const fromEnv = normalizeBase(envDefault);
  if (fromEnv) return { base: fromEnv, usingCookie: false, usingEnv: true };

  // Fallback: relative path (only works if server is same-origin under /api)
  return { base: '/api', usingCookie: false, usingEnv: false };
}

export async function searchSongs(term: string, country = 'US', limit = 20): Promise<ITunesTrack[]> {
  const { base } = getApiBase();
  const params = new URLSearchParams({ term, country, limit: String(limit) });
  const res = await fetch(`${base}/search?${params.toString()}`);
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Search failed: ${res.status} ${txt && '- ' + txt.slice(0, 200)}`);
  }
  const data = await readJsonStrict(res);
  return data.results as ITunesTrack[];
}

export async function downloadByAppleMusicUrl(url: string): Promise<{ audioDataUrl: string; lrcText: string }>
{
  const { base } = getApiBase();
  const res = await fetch(`${base}/download`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Download failed: ${res.status} ${txt && '- ' + txt.slice(0, 200)}`);
  }
  return readJsonStrict(res);
}
