import { buildSeedReports } from '../lib/seed.js';
import { initEmbeddings, embedTexts, cosineVec } from '../lib/embeddings.js';
import { buildIdf, textSimilarity, duplicateScore } from '../lib/ai.js';
import { haversine } from '../lib/geo.js';

const now = Date.parse('2026-06-15T12:00:00Z');
const reports = buildSeedReports(now);
const texts = reports.map(r => r.text);
const idf = buildIdf(texts);
const st = await initEmbeddings();
const vecs = st.ready ? await embedTexts(texts) : null;
const idx = new Map(reports.map((r, i) => [r.id, i]));

function score(a, b) {
  const meters = haversine(a.location, b.location);
  const geo = Math.exp(-meters / 320);
  const cat = a.category === b.category ? 1 : 0.12;
  const days = Math.abs(new Date(a.createdAt) - new Date(b.createdAt)) / 864e5;
  const time = Math.exp(-days / 12);
  const lex = textSimilarity(a.text, b.text, idf);
  const sem = vecs ? cosineVec(vecs[idx.get(a.id)], vecs[idx.get(b.id)]) : 0;
  const w = { sim: 0.6, geo: 0.22, cat: 0.1, time: 0.08 };
  const lexScore = w.sim * lex + w.geo * geo + w.cat * cat + w.time * time;
  const semScore = w.sim * sem + w.geo * geo + w.cat * cat + w.time * time;
  return { lex, sem, meters: Math.round(meters), days: +days.toFixed(1), lexScore: +lexScore.toFixed(3), semScore: +semScore.toFixed(3) };
}

console.log('--- linked duplicate pairs ---');
for (const r of reports.filter(r => r.duplicateOf)) {
  const t = reports.find(x => x.id === r.duplicateOf);
  console.log(r.id, '->', t.id, r.category, JSON.stringify(score(r, t)));
}

console.log('\n--- top semantic scores among all pairs ---');
const all = [];
for (let i = 0; i < reports.length; i++) {
  for (let j = i + 1; j < reports.length; j++) {
    const s = score(reports[i], reports[j]);
    all.push({ a: reports[i].id, b: reports[j].id, cat: reports[i].category, ...s });
  }
}
all.sort((x, y) => y.semScore - x.semScore);
for (const p of all.slice(0, 15)) console.log(p.a, p.b, p.cat, JSON.stringify(p));

for (const th of [0.72, 0.75, 0.78, 0.8]) {
  const parent = Object.fromEntries(reports.map(r => [r.id, r.id]));
  const find = x => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb; };
  for (const p of all) if (p.semScore >= th) union(p.a, p.b);
  const groups = {};
  for (const r of reports) (groups[find(r.id)] = groups[find(r.id)] || []).push(r.id);
  const multi = Object.values(groups).filter(g => g.length > 1);
  console.log(`threshold ${th}: ${multi.length} groups`, multi.map(g => `${g.length}:${g[0]}`).join(' '));
}
