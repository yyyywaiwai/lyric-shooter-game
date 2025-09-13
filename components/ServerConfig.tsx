import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { getCookie, setCookie } from '@/services/cookies';

export default function ServerConfig(): React.ReactNode {
  const [input, setInput] = useState<string>('');
  const [status, setStatus] = useState<'idle' | 'ok' | 'fail' | 'checking'>('idle');
  const [message, setMessage] = useState<string>('');

  useEffect(() => {
    const saved = getCookie('LS_SERVER_URL');
    if (saved) {
      setInput(saved);
    } else {
      const envDefault = (process.env.LS_SERVER_URL_DEFAULT as string) || '';
      if (envDefault) setInput(envDefault);
    }
  }, []);

  const normalized = useMemo(() => {
    const raw = input.trim();
    if (!raw) return '';
    try {
      const url = new URL(raw);
      let origin = url.origin + url.pathname;
      origin = origin.replace(/\/$/, '');
      if (!/\/api$/i.test(origin)) origin += '/api';
      return origin;
    } catch {
      return '';
    }
  }, [input]);

  const save = useCallback(() => {
    setCookie('LS_SERVER_URL', input.trim());
    setStatus('idle');
    setMessage('Saved server address to cookie.');
  }, [input]);

  const check = useCallback(async () => {
    if (!normalized) {
      setStatus('fail');
      setMessage('Invalid URL. Include protocol, e.g., https://example.com:3001');
      return;
    }
    setStatus('checking');
    setMessage('');
    try {
      const resp = await fetch(`${normalized}/health`, { method: 'GET' });
      if (!resp.ok) throw new Error(String(resp.status));
      const txt = await resp.text();
      setStatus('ok');
      setMessage(`OK: ${txt || 'healthy'}`);
    } catch (e: any) {
      setStatus('fail');
      setMessage('Could not reach server. Check CORS and URL.');
    }
  }, [normalized]);

  return (
    <div className="p-4 bg-slate-900 rounded-lg border border-slate-700 space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sky-300 font-orbitron text-lg">Server Address</h3>
        {status === 'ok' && <span className="text-emerald-400 text-sm">Connected</span>}
        {status === 'fail' && <span className="text-red-400 text-sm">Unreachable</span>}
        {status === 'checking' && <span className="text-sky-400 text-sm">Checking…</span>}
      </div>
      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="https://your-host:3001"
          className="flex-1 px-3 py-2 rounded bg-slate-700 text-white border border-slate-600 focus:outline-none focus:ring-2 focus:ring-sky-500"
        />
        <button onClick={save} className="px-3 py-2 rounded bg-slate-700 text-slate-200 border border-slate-600 hover:bg-slate-600">Save</button>
        <button onClick={check} className="px-3 py-2 rounded bg-sky-600 text-white hover:bg-sky-500">Check</button>
      </div>
      {message && <div className="text-slate-300 text-sm">{message}</div>}
      <div className="text-slate-400 text-xs">Base in use: <span className="font-mono">{normalized || '(invalid)'}</span></div>
      <div className="text-slate-500 text-xs">The address is stored in a cookie and used by the app for search/download. The API base is assumed to be at <code className="font-mono">/api</code>.</div>
    </div>
  );
}
