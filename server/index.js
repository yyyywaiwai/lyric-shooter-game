// Minimal local API server for iTunes search + gamdl downloads
// No external deps; uses Node 18+ built-ins
// Endpoints:
//  - GET  /api/search?term=...&country=US&limit=20
//  - POST /api/download { url, cookiesPath? }

import { createServer } from 'http';
import { parse as parseUrl } from 'url';
import { randomBytes } from 'crypto';
import { spawn } from 'child_process';
import { promises as fsp } from 'fs';
import fs from 'fs';
import path from 'path';

const PORT = process.env.PORT ? Number(process.env.PORT) : 3001;
const HOST = process.env.HOST || '127.0.0.1';

const ROOT = process.cwd();
const TMP_ROOT = path.join(ROOT, 'server', 'tmp');

async function ensureTmpRoot() {
  await fsp.mkdir(TMP_ROOT, { recursive: true });
}

function sendJSON(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  });
  res.end(body);
}

function sendText(res, status, text) {
  res.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  });
  res.end(text);
}

async function readJSONBody(req, limitBytes = 10 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limitBytes) {
        reject(new Error('Payload too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        const body = Buffer.concat(chunks).toString('utf8');
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

async function handleSearch(req, res, urlObj) {
  const term = urlObj.searchParams.get('term') || '';
  const country = urlObj.searchParams.get('country') || 'US';
  const limit = urlObj.searchParams.get('limit') || '20';

  if (!term.trim()) {
    return sendJSON(res, 400, { error: 'Missing term' });
  }

  // iTunes Search API endpoint
  const apiUrl = new URL('https://itunes.apple.com/search');
  apiUrl.searchParams.set('term', term);
  apiUrl.searchParams.set('media', 'music');
  apiUrl.searchParams.set('entity', 'song');
  apiUrl.searchParams.set('limit', limit);
  apiUrl.searchParams.set('country', country);
  apiUrl.searchParams.set('lang', 'ja_jp');

  try {
    const r = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'lyric-shooter-game/1.0'
      }
    });
    if (!r.ok) {
      return sendJSON(res, 502, { error: 'iTunes API error', status: r.status });
    }
    const data = await r.json();
    // Pass through, but include only the key fields we need for the UI to keep responses light
    const results = (data.results || []).map((x) => ({
      trackId: x.trackId,
      trackName: x.trackName,
      artistName: x.artistName,
      collectionName: x.collectionName,
      artworkUrl100: x.artworkUrl100,
      previewUrl: x.previewUrl,
      trackTimeMillis: x.trackTimeMillis,
      country: x.country,
      primaryGenreName: x.primaryGenreName,
      trackViewUrl: x.trackViewUrl,
      collectionViewUrl: x.collectionViewUrl,
    }));
    return sendJSON(res, 200, { resultCount: results.length, results });
  } catch (e) {
    return sendJSON(res, 500, { error: 'Failed to fetch iTunes API', message: String(e) });
  }
}

async function findFirstByExt(rootDir, extList) {
  const entries = await fsp.readdir(rootDir, { withFileTypes: true });
  for (const ent of entries) {
    const full = path.join(rootDir, ent.name);
    if (ent.isDirectory()) {
      const found = await findFirstByExt(full, extList);
      if (found) return found;
    } else if (ent.isFile()) {
      for (const ext of extList) {
        if (ent.name.toLowerCase().endsWith(ext)) return full;
      }
    }
  }
  return null;
}

function detectMimeFromExt(filePath) {
  const lower = filePath.toLowerCase();
  if (lower.endsWith('.m4a')) return 'audio/mp4';
  if (lower.endsWith('.mp4')) return 'audio/mp4';
  if (lower.endsWith('.m4v')) return 'video/mp4';
  return 'application/octet-stream';
}

async function handleDownload(req, res) {
  const body = await readJSONBody(req).catch((e) => ({ __error: e }));
  if (body.__error) {
    return sendJSON(res, 400, { error: 'Invalid JSON', message: String(body.__error) });
  }
  const url = (body.url || '').trim();
  if (!url || !/^https:\/\/music\.apple\.com\//.test(url)) {
    return sendJSON(res, 400, { error: 'Provide a valid Apple Music track URL in `url` (e.g., trackViewUrl from iTunes search).' });
  }

  await ensureTmpRoot();
  const id = `${Date.now()}-${randomBytes(4).toString('hex')}`;
  const outDir = path.join(TMP_ROOT, id);
  await fsp.mkdir(outDir, { recursive: true });

  const args = ['-o', outDir, '--synced-lyrics-format', 'lrc'];

  // Optional cookies path (env or body)
  const cookiesPath = body.cookiesPath || process.env.GAMDL_COOKIES || path.join(ROOT, 'cookies.txt');
  if (fs.existsSync(cookiesPath)) {
    args.push('-c', cookiesPath);
  }

  // Avoid loading user config if desired
  if (body.noConfig || process.env.GAMDL_NO_CONFIG === '1') {
    args.push('-n');
  }

  args.push(url);

  const child = spawn('gamdl', args, { stdio: ['ignore', 'pipe', 'pipe'] });

  let logs = '';
  child.stdout.on('data', (d) => (logs += d.toString()));
  child.stderr.on('data', (d) => (logs += d.toString()));

  const killTimer = setTimeout(() => {
    child.kill('SIGKILL');
  }, (Number(process.env.GAMDL_TIMEOUT_MS) || 120000));

  child.on('close', async (code) => {
    clearTimeout(killTimer);
    if (code !== 0) {
      try { await fsp.rm(outDir, { recursive: true, force: true }); } catch {}
      return sendJSON(res, 502, { error: 'gamdl failed', code, logs });
    }

    try {
      const audioPath = await findFirstByExt(outDir, ['.m4a', '.mp4', '.m4v']);
      const lrcPath = await findFirstByExt(outDir, ['.lrc']);
      if (!audioPath || !lrcPath) {
        try { await fsp.rm(outDir, { recursive: true, force: true }); } catch {}
        return sendJSON(res, 500, { error: 'Downloaded files not found', audioPath, lrcPath, logs });
      }
      const audioBuf = await fsp.readFile(audioPath);
      const lrcText = await fsp.readFile(lrcPath, 'utf8');
      const mime = detectMimeFromExt(audioPath);
      const audioDataUrl = `data:${mime};base64,${audioBuf.toString('base64')}`;

      // best-effort cleanup
      try { await fsp.rm(outDir, { recursive: true, force: true }); } catch {}

      return sendJSON(res, 200, { audioDataUrl, lrcText });
    } catch (e) {
      try { await fsp.rm(outDir, { recursive: true, force: true }); } catch {}
      return sendJSON(res, 500, { error: 'Failed to prepare files', message: String(e) });
    }
  });
}

const server = createServer(async (req, res) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    });
    return res.end();
  }

  const urlObj = new URL(req.url || '/', `http://${req.headers.host}`);
  const { pathname } = urlObj;

  if (process.env.LOG_REQUESTS === '1') {
    // eslint-disable-next-line no-console
    console.log(`[${new Date().toISOString()}] ${req.method} ${pathname}${urlObj.search}`);
  }

  if (req.method === 'GET' && pathname === '/api/health') {
    return sendText(res, 200, 'ok');
  }
  if (req.method === 'GET' && pathname === '/api/search') {
    return handleSearch(req, res, urlObj);
  }
  if (req.method === 'POST' && pathname === '/api/download') {
    try {
      return await handleDownload(req, res);
    } catch (e) {
      return sendJSON(res, 500, { error: 'Unexpected server error', message: String(e) });
    }
  }

  sendJSON(res, 404, { error: 'Not found' });
});

server.listen(PORT, HOST, () => {
  // eslint-disable-next-line no-console
  console.log(`API server listening at http://${HOST}:${PORT}`);
});
