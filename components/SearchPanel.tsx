import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { parseLRC } from '@/services/lrcParser';
import type { ITunesTrack } from '@/services/api';
import { searchSongs, downloadByAppleMusicUrl } from '@/services/api';
import type { LyricLine, SongMetadata } from '@/types';
import { getCookie, setCookie } from '@/services/cookies';
import { PreviewPlayIcon } from '@/components/icons';
import GameConstants from '@/services/gameConstants';
import {
  AppleHistoryEntry,
  APPLE_HISTORY_LIMIT,
  loadAppleHistory,
} from '@/services/appleHistory';
import type { LoadedSongContext } from '@/types';

interface SearchPanelProps {
  onLoaded: (
    audioUrl: string,
    lyrics: LyricLine[],
    metadata: SongMetadata,
    context?: LoadedSongContext
  ) => void;
  historyVersion: number;
}

function msToTime(ms?: number) {
  if (!ms && ms !== 0) return '';
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const r = String(s % 60).padStart(2, '0');
  return `${m}:${r}`;
}

export default function SearchPanel({ onLoaded, historyVersion }: SearchPanelProps): React.ReactNode {
  const { BGM_VOLUME } = GameConstants.getInstance();
  const [q, setQ] = useState('');
  const [country, setCountry] = useState('US');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<ITunesTrack[] | null>(null);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  const [previewingId, setPreviewingId] = useState<number | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const [history, setHistory] = useState<AppleHistoryEntry[]>(() => loadAppleHistory());

  const canSearch = useMemo(() => q.trim().length > 0 && !loading, [q, loading]);

  // Load saved region from cookie on first render
  useEffect(() => {
    const saved = getCookie('LS_COUNTRY');
    if (saved) setCountry(saved);
  }, []);

  // Persist region selection to cookie
  useEffect(() => {
    setCookie('LS_COUNTRY', country, 365);
  }, [country]);

  useEffect(() => {
    setHistory(loadAppleHistory());
  }, [historyVersion]);

  const stopPreview = useCallback(() => {
    const audio = previewAudioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
      previewAudioRef.current = null;
    }
    setPreviewingId(null);
  }, []);

  const doSearch = useCallback(async () => {
    if (!canSearch) return;
    setLoading(true);
    setError(null);
    try {
      const items = await searchSongs(q.trim(), country, 24);
      setResults(items);
    } catch (e: any) {
      setError(e?.message || 'Search failed');
      setResults(null);
    } finally {
      setLoading(false);
    }
  }, [q, country, canSearch]);

  const handlePlay = useCallback(async (t: ITunesTrack) => {
    stopPreview();
    if (!t.trackViewUrl) return;
    setDownloadingId(t.trackId);
    setError(null);
    try {
      const { audioDataUrl, lrcText } = await downloadByAppleMusicUrl(t.trackViewUrl);
      if (!lrcText || !lrcText.trim()) {
        throw new Error('No synced lyrics were returned for this track.');
      }
      const lyrics = parseLRC(lrcText);
      if (!lyrics.length) throw new Error('No synced lyrics found for this track.');
      // Prefer 600px artwork if available
      const artwork = t.artworkUrl100 ? t.artworkUrl100.replace(/100x100bb/, '600x600bb') : undefined;
      const metadata: SongMetadata = {
        title: `${t.trackName} - ${t.artistName}`,
        picture: artwork,
      };
      const historyEntry: AppleHistoryEntry | undefined = t.trackViewUrl
        ? {
            trackId: t.trackId,
            url: t.trackViewUrl,
            title: t.trackName,
            artist: t.artistName,
            artwork,
          }
        : undefined;
      onLoaded(audioDataUrl, lyrics, metadata, historyEntry ? { appleHistory: historyEntry } : undefined);
    } catch (e: any) {
      setError(e?.message || 'Download failed');
    } finally {
      setDownloadingId(null);
    }
  }, [onLoaded, stopPreview]);

  const handleHistoryPlay = useCallback(
    async (entry: AppleHistoryEntry) => {
      stopPreview();
      setDownloadingId(entry.trackId);
      setError(null);
      try {
        const { audioDataUrl, lrcText } = await downloadByAppleMusicUrl(entry.url);
        if (!lrcText || !lrcText.trim()) {
          throw new Error('No synced lyrics were returned for this track.');
        }
        const lyrics = parseLRC(lrcText);
        if (!lyrics.length) throw new Error('No synced lyrics found for this track.');
        const metadataTitle = entry.artist ? `${entry.title} - ${entry.artist}` : entry.title;
        const metadata: SongMetadata = {
          title: metadataTitle,
          picture: entry.artwork ?? undefined,
        };
        onLoaded(audioDataUrl, lyrics, metadata, { appleHistory: entry });
      } catch (e: any) {
        setError(e?.message || 'Download failed');
      } finally {
        setDownloadingId(null);
      }
    },
    [onLoaded, stopPreview]
  );

  const handlePreview = useCallback((track: ITunesTrack) => {
    if (!track.previewUrl) return;

    if (previewingId === track.trackId) {
      stopPreview();
      return;
    }

    stopPreview();

    const audio = new Audio(track.previewUrl);
    previewAudioRef.current = audio;
    setPreviewingId(track.trackId);

    const clearStatus = () => {
      if (previewAudioRef.current === audio) {
        previewAudioRef.current = null;
      }
      setPreviewingId(null);
      audio.removeEventListener('ended', clearStatus);
      audio.removeEventListener('error', clearStatus);
    };

    audio.volume = BGM_VOLUME;
    audio.addEventListener('ended', clearStatus);
    audio.addEventListener('error', clearStatus);
    audio.play().catch(() => {
      clearStatus();
      setError('Preview playback failed.');
    });
  }, [previewingId, stopPreview]);

  useEffect(() => stopPreview, [stopPreview]);

  return (
    <div className="w-full max-w-2xl p-8 space-y-6 bg-slate-800 rounded-2xl shadow-2xl">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-white font-orbitron">Search Apple Music</h2>
        <p className="mt-1 text-sky-300">Search a song, then click Play to start.</p>
      </div>

      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); doSearch(); }}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Song or artist..."
          className="flex-1 px-3 py-2 rounded bg-slate-700 text-white border border-slate-600 focus:outline-none focus:ring-2 focus:ring-sky-500"
        />
        <select
          value={country}
          onChange={(e) => setCountry(e.target.value)}
          className="px-2 py-2 rounded bg-slate-700 text-white border border-slate-600"
          title="Country"
        >
          <option value="US">US</option>
          <option value="JP">JP</option>
          <option value="GB">GB</option>
          <option value="KR">KR</option>
          <option value="TW">TW</option>
          <option value="DE">DE</option>
          <option value="FR">FR</option>
        </select>
        <button
          type="submit"
          disabled={!canSearch}
          className="px-4 py-2 font-bold rounded bg-sky-600 text-white disabled:bg-slate-600 hover:bg-sky-500"
        >
          {loading ? 'Searching...' : 'Search'}
        </button>
      </form>

      {error && (
        <div className="p-3 text-red-300 bg-red-900/50 rounded">{error}</div>
      )}

      {history.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-200 uppercase tracking-wide">
              Recent Apple Music Plays
            </h3>
            <span className="text-xs text-slate-500">
              {Math.min(history.length, APPLE_HISTORY_LIMIT)} / {APPLE_HISTORY_LIMIT}
            </span>
          </div>
          <ul className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
            {history.map((entry) => (
              <li
                key={entry.trackId}
                className="flex items-center gap-3 p-3 bg-slate-900 rounded border border-slate-700"
              >
                {entry.artwork ? (
                  <img src={entry.artwork} alt="artwork" className="w-16 h-16 rounded" />
                ) : (
                  <div className="w-16 h-16 rounded bg-slate-700 flex items-center justify-center text-slate-400 text-xs uppercase tracking-wide">
                    No Art
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div
                    className="text-white font-semibold truncate"
                    title={entry.artist ? `${entry.title} - ${entry.artist}` : entry.title}
                  >
                    {entry.title}
                  </div>
                  {entry.artist && <div className="text-slate-400 text-sm truncate">{entry.artist}</div>}
                </div>
                <button
                  type="button"
                  onClick={() => handleHistoryPlay(entry)}
                  disabled={downloadingId === entry.trackId}
                  className="px-3 py-2 font-bold rounded bg-emerald-600 text-white disabled:bg-emerald-900/60 hover:bg-emerald-500 transition-colors"
                >
                  {downloadingId === entry.trackId ? 'Loading...' : 'Play'}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {results && (
        <ul className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
          {results.map((t) => (
            <li key={t.trackId} className="flex items-center gap-3 p-3 bg-slate-900 rounded border border-slate-700">
              {t.artworkUrl100 && (
                <img src={t.artworkUrl100} alt="artwork" className="w-16 h-16 rounded" />
              )}
              <div className="flex-1 min-w-0">
                <div className="text-white font-semibold truncate" title={`${t.trackName} - ${t.artistName}`}>{t.trackName}</div>
                <div className="text-slate-400 text-sm truncate">{t.artistName}</div>
                <div className="text-slate-500 text-xs">{msToTime(t.trackTimeMillis)}</div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handlePreview(t)}
                  disabled={!t.previewUrl}
                  title={t.previewUrl ? (previewingId === t.trackId ? '試聴を停止' : '試聴する') : '試聴できません'}
                  aria-label={t.previewUrl ? (previewingId === t.trackId ? 'Stop preview' : 'Play preview') : 'Preview unavailable'}
                  className={`p-2 transition-colors ${
                    previewingId === t.trackId
                      ? 'text-emerald-400 drop-shadow-[0_0_8px_rgba(16,185,129,0.75)]'
                      : 'text-sky-300 hover:text-white'
                  } disabled:text-slate-500`}
                >
                  <PreviewPlayIcon className="w-5 h-5" />
                </button>
                <button
                  type="button"
                  onClick={() => handlePlay(t)}
                  disabled={downloadingId === t.trackId}
                  className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded disabled:bg-slate-600"
                >
                  {downloadingId === t.trackId ? 'Loading...' : 'Play'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {!results && !loading && (
        <div className="text-center text-slate-400 text-sm">Try searching for a track or artist.</div>
      )}
    </div>
  );
}
