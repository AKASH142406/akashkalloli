// CivicPulse demo server. No external dependencies; run with `node server.js`.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  initStore, getBootstrap, getInsights, getReport, createReport, applyAction,
  simulateSurge, resetDemo, compare, analyzeText, exportCsv, flush, initLLM, httpError,
} from './lib/store.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, 'public');
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const TILE_DIR = path.join(PUBLIC_DIR, 'tiles');
const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || '127.0.0.1';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
};

function send(res, status, body, headers = {}) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(String(body));
  res.writeHead(status, {
    'Content-Length': buf.length,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    ...headers,
  });
  res.end(buf);
}

function json(res, status, data) {
  send(res, status, JSON.stringify(data), { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
}

function readBody(req, limit = 6 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', chunk => {
      size += chunk.length;
      if (size > limit) {
        reject(httpError(413, 'Request body is too large.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(httpError(400, 'Invalid JSON body.')); }
    });
    req.on('error', reject);
  });
}

function serveFile(res, filePath, { cache = 'no-cache' } = {}) {
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) return false;
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': stat.size,
      'Cache-Control': cache,
      'X-Content-Type-Options': 'nosniff',
    });
    fs.createReadStream(filePath).pipe(res);
    return true;
  });
  return true;
}

function safeJoin(root, requestPath) {
  const decoded = decodeURIComponent(requestPath);
  const resolved = path.resolve(root, `.${path.posix.normalize(decoded)}`);
  if (!resolved.startsWith(path.resolve(root))) return null;
  return resolved;
}

function handleTile(req, res, pathname) {
  const m = /^\/tiles\/(\d+)\/(\d+)\/(\d+)\.png$/.exec(pathname);
  if (!m) return json(res, 404, { error: 'Tile not found.' });
  const [, z, x, y] = m;
  const file = path.join(TILE_DIR, z, x, `${y}.png`);
  if (fs.existsSync(file)) {
    return serveFile(res, file, { cache: 'public, max-age=86400' });
  }
  // If a tile is outside the prefetched demo area, fall back to the public basemap.
  res.writeHead(302, { Location: `https://tile.openstreetmap.de/${z}/${x}/${y}.png` });
  res.end();
}

async function handleApi(req, res, url) {
  const { pathname, searchParams } = url;
  const method = req.method;

  if (pathname === '/api/health' && method === 'GET') {
    return json(res, 200, { ok: true, service: 'civicpulse', time: new Date().toISOString() });
  }
  if (pathname === '/api/bootstrap' && method === 'GET') {
    return json(res, 200, getBootstrap());
  }
  if (pathname === '/api/insights' && method === 'GET') {
    return json(res, 200, getInsights());
  }
  if (pathname === '/api/model' && method === 'GET') {
    return json(res, 200, getBootstrap().config.model);
  }
  if (pathname === '/api/export.csv' && method === 'GET') {
    return send(res, 200, exportCsv(), {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="civicpulse-reports.csv"',
    });
  }
  if (pathname === '/api/compare' && method === 'GET') {
    const a = searchParams.get('a');
    const b = searchParams.get('b');
    if (!a || !b) return json(res, 400, { error: 'Provide a and b report ids.' });
    return json(res, 200, compare(a, b));
  }
  if (pathname === '/api/analyze' && method === 'POST') {
    const body = await readBody(req, 64 * 1024);
    return json(res, 200, await analyzeText(body));
  }
  if (pathname === '/api/reports' && method === 'POST') {
    const body = await readBody(req);
    const result = await createReport(body);
    return json(res, 201, result);
  }
  if (pathname === '/api/demo/reset' && method === 'POST') {
    return json(res, 200, await resetDemo());
  }
  if (pathname === '/api/demo/surge' && method === 'POST') {
    return json(res, 200, await simulateSurge());
  }

  const reportMatch = /^\/api\/reports\/([A-Za-z0-9-]+)$/.exec(pathname);
  if (reportMatch) {
    const id = reportMatch[1];
    if (method === 'GET') {
      const report = getReport(id);
      if (!report) return json(res, 404, { error: 'Report not found.' });
      return json(res, 200, report);
    }
    if (method === 'PATCH') {
      const body = await readBody(req, 256 * 1024);
      const result = applyAction(id, body);
      return json(res, 200, result);
    }
  }

  return json(res, 404, { error: 'API route not found.' });
}

const server = http.createServer(async (req, res) => {
  const started = Date.now();
  let url;
  try {
    url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  } catch {
    return json(res, 400, { error: 'Bad request URL.' });
  }

  try {
    if (url.pathname.startsWith('/api/')) {
      await handleApi(req, res, url);
      return;
    }
    if (url.pathname.startsWith('/tiles/')) {
      return handleTile(req, res, url.pathname);
    }
    if (url.pathname.startsWith('/uploads/')) {
      const file = safeJoin(UPLOAD_DIR, url.pathname.replace('/uploads/', ''));
      if (!file || !fs.existsSync(file)) return send(res, 404, 'Not found', { 'Content-Type': 'text/plain' });
      return serveFile(res, file, { cache: 'public, max-age=86400' });
    }
    if (url.pathname === '/health') {
      return send(res, 200, 'ok', { 'Content-Type': 'text/plain' });
    }

    const requested = url.pathname === '/' ? '/index.html' : url.pathname;
    const file = safeJoin(PUBLIC_DIR, requested);
    if (!file) return send(res, 403, 'Forbidden', { 'Content-Type': 'text/plain' });
    if (fs.existsSync(file) && fs.statSync(file).isFile()) {
      const ext = path.extname(file).toLowerCase();
      return serveFile(res, file, { cache: ext === '.html' ? 'no-cache' : 'public, max-age=3600' });
    }
    // SPA fallback.
    return serveFile(res, path.join(PUBLIC_DIR, 'index.html'), { cache: 'no-cache' });
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error(err);
    if (!res.headersSent) json(res, status, { error: err.message || 'Server error.' });
  } finally {
    if (process.env.LOG_REQUESTS === '1') {
      console.log(`${req.method} ${url?.pathname} ${res.statusCode} ${Date.now() - started}ms`);
    }
  }
});

const llm = initLLM();
const result = await initStore();
server.listen(PORT, HOST, () => {
  console.log('');
  console.log('  CivicPulse — AI civic triage demo');
  console.log(`  http://${HOST}:${PORT}`);
  console.log(`  Data: ${result.count} synthetic reports${result.seeded ? ' (seeded)' : ' (loaded from data/state.json)'}`);
  console.log(`  AI: deterministic pipeline${llm.enabled ? ` + optional LLM (${llm.model})` : ' (no external LLM configured)'}`);
  console.log(`  Embeddings: ${result.embeddings.ready ? `${result.embeddings.model} (${result.embeddings.dims}d, ${result.embeddings.loadMs}ms)` : 'unavailable — TF-IDF fallback'}`);
  console.log('');
});

function shutdown() {
  console.log('\nSaving state...');
  try { flush(); } catch (err) { console.error(err.message); }
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
