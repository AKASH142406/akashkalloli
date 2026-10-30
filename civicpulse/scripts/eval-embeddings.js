// Offline evaluation: compare TF-IDF vs local BGE embeddings for duplicate scoring.
// Run: node scripts/eval-embeddings.js
import { DUP_PAIRS, TRAINING } from '../lib/corpus.js';
import { initEmbeddings, embedTexts, cosineVec } from '../lib/embeddings.js';
import { buildIdf, textSimilarity } from '../lib/ai.js';
import { haversine } from '../lib/geo.js';

const RELATED = new Set([
  'Waterlogging|Drainage', 'Drainage|Waterlogging',
  'Waterlogging|Road Damage', 'Road Damage|Waterlogging',
  'Drainage|Safety Hazard', 'Safety Hazard|Drainage',
  'Waste Overflow|Drainage', 'Drainage|Waste Overflow',
  'Water Supply|Drainage', 'Drainage|Water Supply',
  'Streetlight|Safety Hazard', 'Safety Hazard|Streetlight',
  'Road Damage|Public Property', 'Public Property|Road Damage',
  'Waterlogging|Water Supply', 'Water Supply|Waterlogging',
]);

const status = await initEmbeddings();
if (!status.ready) {
  console.error('Embeddings not available:', status.error);
  process.exit(1);
}

const base = Date.parse('2026-06-01T08:00:00Z');
const texts = DUP_PAIRS.flatMap(p => [p.a[1], p.b[1]]);
const vecs = await embedTexts(texts);
const idf = buildIdf([...texts, ...TRAINING.map(t => t[1])]);

const rows = DUP_PAIRS.map((p, i) => {
  const a = { text: p.a[1], category: p.a[0], location: { lat: p.a[2], lng: p.a[3] }, createdAt: new Date(base).toISOString() };
  const b = { text: p.b[1], category: p.b[0], location: { lat: p.b[2], lng: p.b[3] }, createdAt: new Date(base - p.days * 864e5).toISOString() };
  const meters = haversine(a.location, b.location);
  const geo = Math.exp(-meters / 320);
  const same = a.category === b.category;
  const cat = same ? 1 : RELATED.has(`${a.category}|${b.category}`) ? 0.7 : 0.12;
  const time = Math.exp(-(p.days * 24) / (24 * 12));
  const lex = textSimilarity(a.text, b.text, idf);
  const sem = cosineVec(vecs[i * 2], vecs[i * 2 + 1]);
  return { label: p.label, meters, geo, cat, time, lex, sem, i };
});

function score(row, w, simKey) {
  const sim = row[simKey];
  let s = w.sim * sim + w.geo * row.geo + w.cat * row.cat + w.time * row.time;
  if (simKey === 'lex') {
    if (row.meters < 80 && row.cat === 1 && sim >= 0.3) s = Math.max(s, 0.65);
    if (row.meters < 45 && row.cat === 1 && sim >= 0.45) s = Math.max(s, 0.73);
  }
  return s;
}

function sweep(simKey, w, lo = 0.3, hi = 0.9, step = 0.01) {
  const out = [];
  for (let t = lo; t <= hi + 1e-9; t += step) {
    const th = +t.toFixed(2);
    let tp = 0, fp = 0, fn = 0, tn = 0;
    for (const r of rows) {
      const s = score(r, w, simKey);
      if (r.label === 1) { if (s >= th) tp++; else fn++; }
      else if (s >= th) fp++; else tn++;
    }
    const precision = tp + fp ? tp / (tp + fp) : 0;
    const recall = tp + fn ? tp / (tp + fn) : 0;
    const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
    out.push({ threshold: th, tp, fp, fn, tn, precision, recall, f1 });
  }
  return out.sort((a, b) => b.f1 - a.f1 || b.recall - a.recall)[0];
}

const weights = { sim: 0.6, geo: 0.22, cat: 0.1, time: 0.08 };
console.log('pairs', rows.length, 'positives', rows.filter(r => r.label === 1).length);
for (const key of ['lex', 'sem']) {
  const best = sweep(key, weights);
  console.log(key, 'best', JSON.stringify(best));
  const at = (t) => {
    let tp = 0, fp = 0, fn = 0;
    for (const r of rows) {
      const s = score(r, weights, key);
      if (r.label === 1) { if (s >= t) tp++; else fn++; }
      else if (s >= t) fp++;
    }
    return { t, tp, fp, fn };
  };
  console.log(key, 'at .38/.6/.7/.72/.74/.76/.78/.8', [0.38, 0.6, 0.7, 0.72, 0.74, 0.76, 0.78, 0.8].map(at));
}

// Print the hard pairs for insight.
console.log('\nPer-pair (label, sims, meters, days):');
for (const r of rows) {
  console.log([
    r.label === 1 ? 'DUP ' : 'DIFF',
    `lex=${r.lex.toFixed(2)}`, `sem=${r.sem.toFixed(2)}`, `geo=${Math.round(r.meters)}m`,
    `days=${(r.i, DUP_PAIRS[r.i].days)}`, `${DUP_PAIRS[r.i].a[0]} vs ${DUP_PAIRS[r.i].b[0]}`,
  ].join(' '));
}
