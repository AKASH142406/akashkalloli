// Optional local sentence embeddings (BGE-small, quantized ONNX).
// Runs entirely on the machine via @xenova/transformers. If the package or model
// is unavailable, the app automatically falls back to TF-IDF duplicate scoring.

import path from 'node:path';

const MODEL_ID = process.env.CIVIC_EMBEDDING_MODEL || 'Xenova/bge-small-en-v1.5';
const DISABLED = process.env.CIVIC_EMBEDDINGS === 'off';

let extractor = null;
let initPromise = null;
const cache = new Map();
const status = {
  enabled: !DISABLED,
  ready: false,
  model: MODEL_ID,
  dims: 0,
  error: null,
  loadMs: null,
  note: DISABLED ? 'Disabled by CIVIC_EMBEDDINGS=off.' : 'Not initialised yet.',
};

export async function initEmbeddings() {
  if (DISABLED) return status;
  if (initPromise) return initPromise;
  initPromise = (async () => {
    const started = Date.now();
    try {
      const mod = await import('@xenova/transformers');
      const { pipeline, env } = mod;
      env.localModelPath = path.resolve('models');
      env.allowRemoteModels = false;
      env.allowLocalModels = true;
      env.useBrowserCache = false;
      env.backends.onnx.logLevel = 'error';
      extractor = await pipeline('feature-extraction', MODEL_ID, { quantized: true });
      status.ready = true;
      status.error = null;
      status.loadMs = Date.now() - started;
      status.note = `Local ${MODEL_ID} (quantized ONNX). No text leaves this machine.`;
    } catch (err) {
      status.ready = false;
      status.error = err.message;
      status.note = 'Embedding model could not load. Falling back to TF-IDF cosine for duplicate scoring.';
      console.warn('Embeddings unavailable:', err.message);
    }
    return status;
  })();
  return initPromise;
}

export function embeddingsStatus() {
  return { ...status, cachedTexts: cache.size };
}

export function embeddingsReady() {
  return Boolean(extractor && status.ready);
}

export async function embedTexts(texts) {
  if (!embeddingsReady()) return null;
  const list = texts.map(t => String(t || '').slice(0, 1200));
  const results = new Array(list.length);
  const missing = [];
  list.forEach((t, i) => {
    if (cache.has(t)) results[i] = cache.get(t);
    else missing.push({ t, i });
  });
  const BATCH = 16;
  for (let start = 0; start < missing.length; start += BATCH) {
    const batch = missing.slice(start, start + BATCH);
    const out = await extractor(batch.map(x => x.t), { pooling: 'mean', normalize: true });
    const dims = out.dims[out.dims.length - 1];
    status.dims = dims;
    for (let j = 0; j < batch.length; j++) {
      const vec = Float32Array.from(out.data.slice(j * dims, (j + 1) * dims));
      cache.set(batch[j].t, vec);
      results[batch[j].i] = vec;
    }
  }
  return results;
}

export async function embedText(text) {
  const out = await embedTexts([text]);
  return out ? out[0] : null;
}

export function cosineVec(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return Math.max(0, Math.min(1, dot));
}

export function clearEmbeddingCache() {
  cache.clear();
}
