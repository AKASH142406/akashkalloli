// CivicPulse AI pipeline.
// Everything in this file runs locally with deterministic, inspectable methods:
//   - Multinomial Naive Bayes category classifier (trained on the synthetic corpus)
//   - TF-IDF + geospatial hybrid duplicate scoring
//   - Weighted, explainable priority rubric
//   - Extractive summaries with rule-based signal extraction
//   - DBSCAN hotspot detection over haversine distance
//   - Template-generated action briefs (no generative LLM required)
// An optional LLM adapter can rewrite summaries/briefs when configured by the operator.

import { TRAINING, DUP_PAIRS } from './corpus.js';
import {
  CATEGORY_IDS, CATEGORY_MAP, TEAM_FOR_CATEGORY, TEAMS, TEAM_MAP,
  PRIORITY_META, STATUS_MAP, OPEN_STATUSES, haversine, nearestLocality, formatMeters,
} from './geo.js';
import { cosineVec, embeddingsReady } from './embeddings.js';

// ---------------------------------------------------------------------------
// Text utilities
// ---------------------------------------------------------------------------

const STOPWORDS = new Set(`a an the is are was were be been being am at in on near of to for from with and or but if then than
this that these those there here it its it's i me my we our you your he she they them their his her
as by after before since over under again very so just can could will would should may might must do does did
also too when where who what which how all any some more most other into onto out up down off about around
please kindly sir madam complaint issue problem request reporting reported`.split(/\s+/));

const SUFFIXES = [
  ['ingly', ''], ['edly', ''], ['ing', ''], ['ed', ''], ['ies', 'y'], ['es', ''], ['s', ''], ['ly', ''],
];

export function stem(word) {
  let w = word;
  for (const [suf, rep] of SUFFIXES) {
    if (w.length > suf.length + 3 && w.endsWith(suf)) {
      if (suf === 's' && (w.endsWith('ss') || w.endsWith('us') || w.endsWith('is'))) break;
      if (suf === 'es' && !/(sh|ch|x|z|ss)$/.test(w.slice(0, -2))) break;
      w = w.slice(0, -suf.length) + rep;
      break;
    }
  }
  if (w.length > 4 && w[w.length - 1] === w[w.length - 2]) w = w.slice(0, -1);
  return w;
}

export function tokenize(text, { bigrams = true } = {}) {
  const raw = String(text || '')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9\s.-]/g, ' ')
    .replace(/\b(\d+)\s*(ft|feet|foot)\b/g, '$1feet')
    .split(/\s+/)
    .filter(Boolean);
  const unigrams = [];
  for (const word of raw) {
    const clean = word.replace(/^[.-]+|[.-]+$/g, '');
    if (!clean || STOPWORDS.has(clean)) continue;
    if (/^\d+$/.test(clean)) { unigrams.push(clean); continue; }
    unigrams.push(stem(clean));
  }
  if (!bigrams) return unigrams;
  const grams = [...unigrams];
  for (let i = 0; i < unigrams.length - 1; i++) grams.push(`${unigrams[i]}_${unigrams[i + 1]}`);
  return grams;
}

function softmax(logits, temperature = 1) {
  const max = Math.max(...logits);
  const exps = logits.map(v => Math.exp((v - max) / temperature));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map(v => v / sum);
}

function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return Math.abs(h);
}

// ---------------------------------------------------------------------------
// Civic lexicon: a small, hand-written set of domain phrases. This is combined
// with the learned Naive Bayes probabilities. The lexicon is intentionally
// visible and editable; it is not a black box.
// ---------------------------------------------------------------------------

const CIVIC_LEXICON = {
  Waterlogging: [
    ['waterlogging', 6], ['waterlogged', 6], ['flooded', 6], ['flooding', 5], ['flood', 5],
    ['standing water', 5], ['submerged', 5], ['knee deep', 5], ['water entering', 5], ['water entered', 5],
    ['water accumulated', 5], ['water on the road', 5], ['water on road', 5], ['rain water', 4],
    ['water level', 4], ['water rising', 5], ['under water', 5], ['puddle', 4], ['water is standing', 5],
    ['water has collected', 5], ['water collected', 5], ['water pooled', 5], ['storm water has pooled', 5],
    ['entered the basement', 4], ['entered homes', 4], ['entered the ground floor', 4], ['water is above', 4],
    ['water gushing', 4], ['water is gushing', 4], ['water is not draining', 4], ['not draining', 3],
    ['water not moving', 3], ['water is entering', 5], ['water has entered', 5], ['water rising again', 5],
    ['water is rising', 5], ['stream', 2], ['lake', 2], ['water', 1.5],
  ],
  Drainage: [
    ['drain', 4], ['drainage', 6], ['sewer', 6], ['sewage', 6], ['manhole', 3], ['gutter', 5],
    ['sullage', 6], ['storm water drain', 6], ['drain cover', 5], ['foul smell', 5], ['black water', 4],
    ['desilt', 6], ['open trench', 4], ['waste water', 5], ['sewage line', 6], ['drain is blocked', 6],
    ['drain blocked', 6], ['drain overflowing', 6], ['drain is overflowing', 6], ['manhole overflowing', 6],
    ['manhole cover', 4], ['drain water', 5], ['sewer gas', 5], ['drainage channel', 6], ['drain wall', 4],
    ['choked', 4], ['clogged', 4], ['not taking water', 3], ['overflowing drain', 6], ['drain overflow', 5],
    ['sewage overflow', 6], ['open sewage', 6], ['drainage work', 5], ['drainage problem', 5],
    ['sullage water', 6], ['sewage water', 6], ['sewage is flowing', 6], ['drain is clogged', 6],
  ],
  'Road Damage': [
    ['pothole', 7], ['pot hole', 7], ['road surface', 6], ['asphalt', 6], ['tar', 3], ['crater', 6],
    ['sinkhole', 5], ['speed breaker', 5], ['footpath tiles', 6], ['footpath tiles broken', 6], ['tiles broken', 5], ['paver', 5], ['road caved', 6],
    ['caved in', 5], ['cracks', 4], ['gravel', 5], ['road broken', 6], ['road is uneven', 5],
    ['road edge', 4], ['trench', 3], ['manhole sinking', 5], ['road has no proper surface', 6],
    ['road crumbling', 5], ['loose stones', 5], ['road damage', 6], ['broken road', 6], ['damaged road', 6],
    ['road repair', 4], ['road sunk', 5], ['broken asphalt', 6], ['road is broken', 6],
    ['road surface is broken', 6], ['pavement', 2],
  ],
  'Waste Overflow': [
    ['garbage', 7], ['waste', 4], ['trash', 6], ['bin', 5], ['dumpster', 6], ['litter', 5],
    ['debris', 5], ['dumping', 5], ['black spot', 6], ['rubbish', 6], ['collection vehicle', 5],
    ['segregation', 5], ['flies', 4], ['rats', 4], ['mattresses', 4], ['furniture', 4],
    ['garbage pile', 6], ['waste is being burned', 5], ['burning waste', 5], ['overflowing bin', 6],
    ['bin is full', 5], ['bins are full', 5], ['no bins', 4], ['garbage collection', 6],
    ['solid waste', 6], ['dumped', 4], ['waste on the road', 5], ['waste onto the road', 5],
    ['garbage bin', 7], ['garbage truck', 6], ['community bin', 6], ['dumpster is full', 6],
    ['trash is scattered', 5], ['waste collection', 5], ['illegal dumping', 5], ['blackspot', 5],
    ['smell from the garbage', 5],
  ],
  Streetlight: [
    ['streetlight', 8], ['street light', 8], ['lamp', 4], ['bulb', 4], ['pole light', 6],
    ['lighting', 4], ['dark', 2], ['flickering', 5], ['lights are off', 6], ['light not working', 6],
    ['lights not working', 6], ['solar light', 6], ['lamp post', 5], ['timer', 2], ['no lights', 5],
    ['light is out', 5], ['light is not working', 6], ['lights on during the day', 5],
    ['street lighting', 7], ['lamp head', 4], ['feeder pillar', 4], ['lamp is not working', 6],
    ['streetlight pole', 5], ['street light is', 6], ['lights switch off', 5], ['pitch dark', 5],
    ['no street lighting', 7], ['streetlight outside', 6], ['streetlight near', 6], ['lamp near', 5],
  ],
  'Safety Hazard': [
    ['live wire', 8], ['electric wire', 7], ['spark', 6], ['sparking', 6], ['shock', 5],
    ['electroc', 6], ['fire', 5], ['gas leak', 7], ['gas smell', 6], ['collapse', 6], ['collapsed', 5],
    ['tree branch', 5], ['tree has fallen', 6], ['tree fall', 6], ['open manhole', 7],
    ['manhole cover missing', 7], ['manhole cover is missing', 7], ['dangling', 6], ['hanging cable', 6],
    ['hanging wire', 6], ['transformer', 5], ['short circuit', 7], ['excavation', 5],
    ['railing is broken', 4], ['stray dog', 6], ['toxic', 5], ['danger', 4], ['dangerous', 4],
    ['accident', 4], ['injury', 4], ['child almost fell', 6], ['almost fell', 5], ['no barricade', 5],
    ['no safety net', 5], ['risk of falling', 5], ['unsafe', 4], ['smoking', 4], ['buzzing', 3],
    ['sharp edges', 4], ['broken glass', 5], ['sharp metal', 5], ['wires exposed', 10], ['pole damaged', 5],
    ['wall is leaning', 6], ['wall collapsed', 6], ['building under construction', 4],
    ['fire broke out', 6], ['burning cables', 5], ['deep excavation', 5], ['open at night', 4],
    ['tilt', 3], ['may collapse', 6], ['footbridge railing', 5],
  ],
  'Water Supply': [
    ['water supply', 8], ['no water', 6], ['pipe burst', 7], ['pipeline', 5], ['pipeline burst', 8], ['water pipe', 6],
    ['tap', 4], ['borewell', 6], ['tanker', 6], ['water pressure', 6], ['drinking water', 7],
    ['contaminated', 5], ['muddy water', 6], ['chlorine', 5], ['water meter', 6], ['valve', 4],
    ['overhead tank', 5], ['water line', 5], ['pump', 4], ['salty', 5], ['brown water', 6],
    ['water is brown', 6], ['no water supply', 8], ['taps are dry', 6], ['water tank', 4],
    ['water connection', 5], ['water is leaking', 4], ['pipe leakage', 6], ['water is not reaching', 5],
    ['water tanker', 7], ['supply has been', 4], ['water supply has', 6], ['muddy', 3],
    ['smells bad', 2], ['water quality', 5], ['tap water', 7], ['water comes', 3],
    ['water is supplied', 4], ['water supply is', 6],
  ],
  'Public Property': [
    ['bus stop', 6], ['shelter', 5], ['park bench', 7], ['benches', 6], ['playground', 7],
    ['public toilet', 7], ['sign board', 6], ['signage', 5], ['footpath encroached', 6],
    ['community hall', 6], ['park gate', 6], ['hoarding', 5], ['walking track', 6], ['statue', 5],
    ['notice board', 5], ['divider paint', 5], ['bus shelter', 7], ['public property', 6],
    ['street furniture', 5], ['community park', 6], ['compound wall', 4], ['government school', 3],
    ['footpath has been', 4], ['pedestrians walk on the road', 4], ['no bench', 4], ['no shade', 4],
    ['park', 3], ['public dustbin', 5], ['park toilet', 6], ['park has', 4], ['park is', 4],
    ['encroached', 4], ['pavement is broken', 4], ['bus stand', 6],
  ],
};

function phraseRegex(phrase) {
  const escaped = phrase
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('\\s+');
  return new RegExp(`\\b${escaped}(?:s|es|ed|ing)?\\b`, 'g');
}

const LEXICON_COMPILED = Object.entries(CIVIC_LEXICON).flatMap(([category, entries]) =>
  entries.map(([phrase, weight]) => ({ category, phrase, weight, re: phraseRegex(phrase) }))
);

export function lexiconScores(text) {
  const lower = String(text || '').toLowerCase();
  const scores = Object.fromEntries(CATEGORY_IDS.map(c => [c, 0]));
  const evidence = Object.fromEntries(CATEGORY_IDS.map(c => [c, []]));
  for (const entry of LEXICON_COMPILED) {
    entry.re.lastIndex = 0;
    const matches = lower.match(entry.re);
    if (!matches) continue;
    const count = matches.length;
    const points = entry.weight * (1 + 0.2 * (count - 1));
    scores[entry.category] += points;
    evidence[entry.category].push({ phrase: entry.phrase, weight: +points.toFixed(2), count });
  }
  for (const cat of CATEGORY_IDS) evidence[cat].sort((a, b) => b.weight - a.weight);
  return { scores, evidence, total: Object.values(scores).reduce((a, b) => a + b, 0) };
}

// ---------------------------------------------------------------------------
// Multinomial Naive Bayes classifier
// ---------------------------------------------------------------------------

class NaiveBayes {
  constructor(alpha = 0.8) {
    this.alpha = alpha;
    this.classes = [];
    this.vocab = new Set();
    this.counts = {};
    this.totals = {};
    this.priors = {};
    this.trainSize = 0;
  }

  train(docs) {
    this.classes = [...new Set(docs.map(d => d.label))].sort();
    this.counts = Object.fromEntries(this.classes.map(c => [c, Object.create(null)]));
    this.totals = Object.fromEntries(this.classes.map(c => [c, 0]));
    this.priors = {};
    this.vocab = new Set();
    this.trainSize = docs.length;
    for (const doc of docs) {
      const tokens = tokenize(doc.text);
      this.priors[doc.label] = (this.priors[doc.label] || 0) + 1;
      for (const t of tokens) {
        this.vocab.add(t);
        this.counts[doc.label][t] = (this.counts[doc.label][t] || 0) + 1;
        this.totals[doc.label] += 1;
      }
    }
    for (const c of this.classes) this.priors[c] = Math.log(this.priors[c] / docs.length);
  }

  logLikelihoods(text) {
    const tokens = tokenize(text);
    const V = this.vocab.size;
    const result = {};
    for (const c of this.classes) {
      let score = this.priors[c];
      for (const t of tokens) {
        const count = this.counts[c][t] || 0;
        score += Math.log((count + this.alpha) / (this.totals[c] + this.alpha * V));
      }
      result[c] = score;
    }
    return result;
  }

  predict(text, { useLexicon = true } = {}) {
    const logits = this.logLikelihoods(text);
    const values = this.classes.map(c => logits[c]);
    // Temperature scaling keeps confidence from saturating at 1.0 for long texts.
    const nbProbs = softmax(values, 7.5);

    const lex = useLexicon ? lexiconScores(text) : null;
    const useLex = Boolean(lex && lex.total >= 2);
    const lexProbs = useLex ? softmax(this.classes.map(c => lex.scores[c] || 0), 3) : null;

    const combinedRaw = this.classes.map((c, i) => {
      const p = useLex ? 0.55 * lexProbs[i] + 0.45 * nbProbs[i] : nbProbs[i];
      return { label: c, p, nb: nbProbs[i], lex: useLex ? lexProbs[i] : 0 };
    });
    const total = combinedRaw.reduce((s, x) => s + x.p, 0) || 1;
    const combined = combinedRaw.map(x => ({ ...x, confidence: x.p / total }))
      .sort((a, b) => b.confidence - a.confidence);

    const predicted = combined[0].label;
    const tokens = tokenize(text);
    const counts = {};
    for (const t of tokens) counts[t] = (counts[t] || 0) + 1;
    const otherClasses = this.classes.filter(c => c !== predicted);
    const contributions = Object.entries(counts).map(([token, count]) => {
      const predP = Math.log(((this.counts[predicted][token] || 0) + this.alpha) / (this.totals[predicted] + this.alpha * this.vocab.size));
      const otherP = otherClasses.reduce((sum, c) => {
        return sum + Math.log(((this.counts[c][token] || 0) + this.alpha) / (this.totals[c] + this.alpha * this.vocab.size));
      }, 0) / otherClasses.length;
      return { token, weight: (predP - otherP) * Math.min(count, 3) };
    }).filter(t => t.weight > 0.15).sort((a, b) => b.weight - a.weight).slice(0, 6);

    const lexiconEvidence = useLex
      ? (lex.evidence[predicted] || []).slice(0, 6).map(e => ({ token: e.phrase, weight: e.weight, source: 'lexicon' }))
      : [];
    const modelEvidence = contributions.map(c => ({ token: c.token.replace(/_/g, ' '), weight: +c.weight.toFixed(2), source: 'model' }));

    return {
      label: predicted,
      confidence: +combined[0].confidence.toFixed(3),
      alternatives: combined.slice(1, 4).map(r => ({
        label: r.label,
        confidence: +r.confidence.toFixed(3),
        nb: +r.nb.toFixed(3),
        lexicon: +r.lex.toFixed(3),
      })),
      evidence: [...lexiconEvidence, ...modelEvidence].slice(0, 8),
      lexiconEvidence,
      modelEvidence,
      nbConfidence: +combined[0].nb.toFixed(3),
      lexiconScore: useLex ? +lex.scores[predicted].toFixed(2) : 0,
      usedLexicon: useLex,
      method: useLex ? 'hybrid-lexicon + naive-bayes v2' : 'naive-bayes v1 (no lexicon match)',
    };
  }
}

function crossValidate(docs, folds = 5) {
  const run = (useLexicon) => {
    const buckets = Array.from({ length: folds }, () => []);
    for (const doc of docs) buckets[hashString(doc.text) % folds].push(doc);
    const labels = [...new Set(docs.map(d => d.label))];
    const confusion = Object.fromEntries(labels.map(l => [l, Object.fromEntries(labels.map(k => [k, 0]))]));
    let correct = 0;
    for (let f = 0; f < folds; f++) {
      const test = buckets[f];
      const train = buckets.flatMap((b, i) => (i === f ? [] : b));
      if (!test.length) continue;
      const model = new NaiveBayes();
      model.train(train);
      for (const doc of test) {
        const pred = model.predict(doc.text, { useLexicon }).label;
        confusion[doc.label][pred] += 1;
        if (pred === doc.label) correct++;
      }
    }
    const perClass = labels.map(label => {
      const tp = confusion[label][label];
      const fp = labels.reduce((s, l) => s + (l === label ? 0 : confusion[l][label]), 0);
      const fn = labels.reduce((s, l) => s + (l === label ? 0 : confusion[label][l]), 0);
      const precision = tp + fp ? tp / (tp + fp) : 0;
      const recall = tp + fn ? tp / (tp + fn) : 0;
      const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
      return { label, precision: +precision.toFixed(3), recall: +recall.toFixed(3), f1: +f1.toFixed(3), support: tp + fn };
    });
    return {
      accuracy: +(correct / docs.length).toFixed(3),
      macroF1: +(perClass.reduce((s, c) => s + c.f1, 0) / perClass.length).toFixed(3),
      perClass,
      confusion,
    };
  };
  const hybrid = run(true);
  const nb = run(false);
  return {
    folds,
    accuracy: hybrid.accuracy,
    macroF1: hybrid.macroF1,
    perClass: hybrid.perClass,
    confusion: hybrid.confusion,
    baselineNaiveBayes: { accuracy: nb.accuracy, macroF1: nb.macroF1 },
    note: '5-fold cross-validation on the synthetic training corpus. The hybrid includes a hand-written civic lexicon, so this is a sanity check, not independent real-world validation.',
  };
}

export const classifier = new NaiveBayes();
classifier.train(TRAINING.map(([label, text]) => ({ label, text })));
const classifierMetrics = crossValidate(TRAINING.map(([label, text]) => ({ label, text })));

// ---------------------------------------------------------------------------
// TF-IDF + duplicate detection
// ---------------------------------------------------------------------------

const RELATED_CATEGORIES = new Set([
  'Waterlogging|Drainage', 'Drainage|Waterlogging',
  'Waterlogging|Road Damage', 'Road Damage|Waterlogging',
  'Drainage|Safety Hazard', 'Safety Hazard|Drainage',
  'Waste Overflow|Drainage', 'Drainage|Waste Overflow',
  'Water Supply|Drainage', 'Drainage|Water Supply',
  'Streetlight|Safety Hazard', 'Safety Hazard|Streetlight',
  'Road Damage|Public Property', 'Public Property|Road Damage',
  'Waterlogging|Water Supply', 'Water Supply|Waterlogging',
]);

export function buildIdf(texts) {
  const df = Object.create(null);
  let n = 0;
  for (const text of texts) {
    const seen = new Set(tokenize(text));
    n++;
    for (const t of seen) df[t] = (df[t] || 0) + 1;
  }
  return { df, n, idf: t => Math.log((n + 1) / ((df[t] || 0) + 1)) + 1 };
}

export function buildReportIdf(reports) {
  return buildIdf([...reports.map(r => r.text), ...TRAINING.map(t => t[1])]);
}

export function vectorize(text, idfModel) {
  const tokens = tokenize(text);
  const counts = Object.create(null);
  for (const t of tokens) counts[t] = (counts[t] || 0) + 1;
  const vec = Object.create(null);
  let norm = 0;
  for (const [t, c] of Object.entries(counts)) {
    const w = (1 + Math.log(c)) * idfModel.idf(t);
    vec[t] = w;
    norm += w * w;
  }
  norm = Math.sqrt(norm) || 1;
  for (const t in vec) vec[t] /= norm;
  return vec;
}

export function cosine(a, b) {
  let dot = 0;
  const [small, large] = Object.keys(a).length < Object.keys(b).length ? [a, b] : [b, a];
  for (const t in small) if (large[t]) dot += small[t] * large[t];
  return Math.max(0, Math.min(1, dot));
}

export function textSimilarity(a, b, idfModel) {
  return cosine(vectorize(a, idfModel), vectorize(b, idfModel));
}

// ---------------------------------------------------------------------------
// Report embeddings. When the local BGE model is loaded, the store registers a
// 384-dim vector per report id. Duplicate scoring then uses semantic cosine
// instead of TF-IDF; the lexical score is still reported for transparency.
// ---------------------------------------------------------------------------

const REPORT_VECTORS = new Map();
let semanticMode = false;

export function setReportEmbedding(id, vector) {
  if (id && vector) REPORT_VECTORS.set(String(id), vector);
}

export function getReportEmbedding(id) {
  return REPORT_VECTORS.get(String(id)) || null;
}

export function clearReportEmbeddings() {
  REPORT_VECTORS.clear();
}

export function setSemanticMode(on) {
  semanticMode = Boolean(on) && embeddingsReady();
  return semanticMode;
}

export function semanticScoringActive() {
  return semanticMode && REPORT_VECTORS.size > 0;
}

export function duplicateScore(a, b, idfModel, embeddingPair = null) {
  const vecA = embeddingPair ? embeddingPair[0] : (a.id ? REPORT_VECTORS.get(String(a.id)) : null);
  const vecB = embeddingPair ? embeddingPair[1] : (b.id ? REPORT_VECTORS.get(String(b.id)) : null);
  const lexicalSim = textSimilarity(a.text, b.text, idfModel);
  const semanticSim = vecA && vecB ? cosineVec(vecA, vecB) : null;
  const textSim = semanticSim ?? lexicalSim;
  const meters = haversine(a.location, b.location);
  const geoSim = Math.exp(-meters / 320);
  const sameCategory = a.category === b.category;
  const related = RELATED_CATEGORIES.has(`${a.category}|${b.category}`);
  const categorySim = sameCategory ? 1 : related ? 0.7 : 0.12;
  const hours = Math.abs(new Date(a.createdAt) - new Date(b.createdAt)) / 36e5;
  const timeSim = Math.exp(-hours / (24 * 12));
  let score = 0.6 * textSim + 0.22 * geoSim + 0.1 * categorySim + 0.08 * timeSim;

  // High-precision rules for very close, same-category reports with some lexical overlap.
  if (semanticSim == null) {
    if (meters < 80 && sameCategory && textSim >= 0.3) score = Math.max(score, 0.65);
    if (meters < 45 && sameCategory && textSim >= 0.45) score = Math.max(score, 0.73);
  }

  return {
    score: +score.toFixed(3),
    textSim: +textSim.toFixed(3),
    lexicalSim: +lexicalSim.toFixed(3),
    semanticSim: semanticSim == null ? null : +semanticSim.toFixed(3),
    mode: semanticSim == null ? 'tfidf' : 'semantic',
    geoMeters: Math.round(meters),
    geoSim: +geoSim.toFixed(3),
    categorySim,
    timeSim: +timeSim.toFixed(3),
    sameCategory,
  };
}

// Thresholds are tuned separately for the two scoring modes. The semantic
// threshold deliberately sits above the F1-optimal point: merging two real
// issues is worse for citizens than asking staff to check a near-miss.
export const DUP_THRESHOLD = 0.62;
export const RELATED_THRESHOLD = 0.46;
export const SEMANTIC_DUP_THRESHOLD = 0.78;
export const SEMANTIC_RELATED_THRESHOLD = 0.62;

export function duplicateThresholds() {
  return semanticScoringActive()
    ? { duplicate: SEMANTIC_DUP_THRESHOLD, related: SEMANTIC_RELATED_THRESHOLD, mode: 'semantic' }
    : { duplicate: DUP_THRESHOLD, related: RELATED_THRESHOLD, mode: 'tfidf' };
}

export function findDuplicateCandidates(report, reports, limit = 5, idfModel = null, incomingEmbedding = null) {
  const pool = reports.filter(r => r.id !== report.id && r.status !== 'rejected' && !r.duplicateOf);
  const model = idfModel || buildIdf([...reports.map(r => r.text), ...TRAINING.map(t => t[1])]);
  const thresholds = duplicateThresholds();
  const scored = pool.map(r => {
    const candidateVector = getReportEmbedding(r.id);
    const pair = incomingEmbedding && candidateVector ? [incomingEmbedding, candidateVector] : null;
    return { report: r, ...duplicateScore(report, r, model, pair) };
  })
    .filter(x => x.score >= thresholds.related)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
  return scored.map(x => ({
    id: x.report.id,
    score: x.score,
    textSim: x.textSim,
    lexicalSim: x.lexicalSim,
    semanticSim: x.semanticSim,
    mode: x.mode,
    geoMeters: x.geoMeters,
    geoSim: x.geoSim,
    categorySim: x.categorySim,
    timeSim: x.timeSim,
    sameCategory: x.sameCategory,
    decision: x.score >= thresholds.duplicate ? 'likely-duplicate' : 'related',
    reason: duplicateReason(x),
    preview: x.report.summary || x.report.text.slice(0, 140),
    category: x.report.category,
    area: x.report.area,
    createdAt: x.report.createdAt,
    status: x.report.status,
  }));
}

function duplicateReason(x) {
  const bits = [];
  if (x.textSim >= 0.55) bits.push('very similar wording');
  else if (x.textSim >= 0.3) bits.push('overlapping wording');
  else bits.push('different wording');
  if (x.geoMeters < 60) bits.push('same spot');
  else if (x.geoMeters < 250) bits.push(`${formatMeters(x.geoMeters)} apart`);
  else bits.push(`${formatMeters(x.geoMeters)} apart`);
  if (!x.sameCategory) bits.push('different category');
  return bits.join(' · ');
}

// ---------------------------------------------------------------------------
// Summaries + signal extraction
// ---------------------------------------------------------------------------

const IMPACT_TERMS = [
  'traffic', 'jam', 'vehicles', 'vehicle', 'two-wheeler', 'two wheeler', 'bike', 'bikes', 'car', 'cars', 'auto', 'autos', 'bus', 'buses',
  'shops', 'shop', 'residents', 'homes', 'home', 'houses', 'basement', 'commuters', 'pedestrians', 'children', 'kids', 'school',
  'hospital', 'ambulance', 'market', 'women', 'elderly', 'disabled', 'wheelchair', 'passengers', 'sick', 'injury', 'accident',
];

function extractSignals(text) {
  const lower = text.toLowerCase();
  const quantities = [...lower.matchAll(/\b(\d+(?:\.\d+)?|one|two|three|four|five|six|seven|eight|nine|ten)\s*(feet|foot|ft|metres?|meters?|inches?|days?|hours?|weeks?)\b/g)]
    .map(m => m[0]).slice(0, 3);
  const impacts = IMPACT_TERMS.filter(t => lower.includes(t)).slice(0, 4);
  const duration = (lower.match(/\b(?:for|since)\s+(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|yesterday|last\s+\w+|monday|tuesday|wednesday|thursday|friday|saturday|sunday)(?:\s+(?:days?|hours?|weeks?|months?))?/) || [])[0] || null;
  return { quantities, impacts, duration };
}

function splitSentences(text) {
  return String(text)
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+|;\s+/)
    .map(s => s.trim())
    .filter(Boolean);
}

export function summarize(text, category, area) {
  const sentences = splitSentences(text);
  const signals = extractSignals(text);
  const catTokens = new Set(tokenize(category));
  const scored = sentences.map((s, i) => {
    const tokens = tokenize(s);
    const overlap = tokens.filter(t => catTokens.has(t)).length;
    const lengthScore = Math.min(tokens.length, 18) / 18;
    return { s, score: overlap * 1.6 + lengthScore + (i === 0 ? 0.8 : 0) };
  }).sort((a, b) => b.score - a.score);

  let core = (scored[0]?.s || text).replace(/\s+/g, ' ').trim();
  if (core.length > 190) core = `${core.slice(0, 187).trim()}…`;
  core = core.replace(/[.]+$/, '');

  const areaInCore = area && core.toLowerCase().includes(area.toLowerCase());
  let summary = areaInCore ? `${core}.` : `${category} at ${area}: ${core[0].toLowerCase()}${core.slice(1)}.`;

  const extra = [];
  if (signals.quantities.length) extra.push(signals.quantities.join(', '));
  if (signals.impacts.length) extra.push(`affects ${signals.impacts.slice(0, 3).join(', ')}`);
  if (signals.duration) extra.push(`ongoing ${signals.duration}`);
  if (extra.length && summary.length < 210) summary += ` Signals: ${extra.join('; ')}.`;
  if (summary.length > 260) summary = `${summary.slice(0, 257).trim()}…`;

  return {
    text: summary,
    method: 'extractive + template (no generative model)',
    coreSentence: core,
    signals,
    sentenceCount: sentences.length,
  };
}

// ---------------------------------------------------------------------------
// Explainable priority
// ---------------------------------------------------------------------------

const BASE_RISK = {
  'Safety Hazard': 40,
  Waterlogging: 26,
  Drainage: 20,
  'Road Damage': 17,
  'Water Supply': 18,
  'Waste Overflow': 14,
  Streetlight: 12,
  'Public Property': 8,
};

const SEVERE_HAZARD = /live wire|electric wire|electroc|spark|short circuit|fire|burning|gas leak|collapse|collapsed|sinkhole|open manhole|manhole cover.{0,18}(missing|open)|child.{0,18}fell|tree.{0,18}(fall|fallen)|transformer|shock|injur|accident|danger|toxic|contaminat|sewage mix|fallen wire/i;
const MODERATE_HAZARD = /blocked|overflow|deep|hazard|unsafe|risk|stranded|stuck|submerged|knee.?deep|waist|broken|damaged|foul|smell|dark|burst|leak|gushing/i;
const VULNERABLE_PLACE = /school|children|kids|hospital|clinic|ambulance|market|bus stop|bus stand|metro|playground|elderly|women|disabled|wheelchair|temple|anganwadi/i;
const IMPACT_TERMS_RE = /traffic|jam|vehicles?|two.?wheeler|bike|car|auto|bus|shops?|residents?|homes?|houses?|basement|commuters?|pedestrians?|entered|sick|stranded|blocking/i;
const PUBLIC_HEALTH = /smell|flies|rats|dogs|mosquito|sewage|sullage|contaminat|sick|unhygienic|foul/i;
const MINOR = /minor|small crack|slight|cosmetic|paint|faded|dirty only|one small/i;

export function scorePriority(report, ctx = {}) {
  const text = report.text || '';
  const category = report.category;
  const factors = [];
  const add = (id, label, points, detail, kind = 'risk') => {
    if (!points) return;
    factors.push({ id, label, points, detail, kind });
  };

  add('category', `${category} baseline`, BASE_RISK[category] ?? 10,
    `Baseline risk weight for the ${category.toLowerCase()} category.`, 'risk');

  const severe = text.match(SEVERE_HAZARD);
  if (severe) add('hazard', 'Life-safety hazard language', 32, `Matched “${severe[0]}”.`, 'risk');
  else {
    const moderate = text.match(MODERATE_HAZARD);
    if (moderate) add('hazard', 'Hazard / service-failure language', 8, `Matched “${moderate[0]}”.`, 'risk');
  }

  const vulnerable = text.match(VULNERABLE_PLACE);
  if (vulnerable) add('vulnerable', 'Near a vulnerable place', 8, `Mentions “${vulnerable[0]}”.`, 'impact');

  const impact = text.match(IMPACT_TERMS_RE);
  if (impact) add('impact', 'Impact on people or movement', 10, `Mentions “${impact[0]}”.`, 'impact');

  if (['Waste Overflow', 'Drainage', 'Water Supply', 'Waterlogging'].includes(category)) {
    const health = text.match(PUBLIC_HEALTH);
    if (health) add('health', 'Public-health signal', 6, `Mentions “${health[0]}”.`, 'impact');
  }

  if (category === 'Streetlight') {
    const night = text.match(/dark|night|women|children|school|unsafe/i);
    if (night) add('night', 'Night-time safety concern', 10, `Mentions “${night[0]}”.`, 'impact');
  }

  if (category === 'Water Supply') {
    const outage = text.match(/no water|not (?:getting|receiving|coming)|dry|tanker|contaminat|muddy|sick/i);
    if (outage) add('outage', 'Loss of essential supply', 10, `Mentions “${outage[0]}”.`, 'impact');
  }

  const linked = ctx.linkedDuplicates || 0;
  if (linked > 0) add('duplicates', 'Confirmed duplicate reports', Math.min(linked * 5, 15),
    `${linked} other report${linked > 1 ? 's' : ''} confirmed as the same issue.`, 'corroboration');

  const similar = ctx.similarReports || 0;
  if (similar > 0) add('similar', 'Corroborating nearby reports', Math.min(similar * 4, 12),
    `${similar} nearby report${similar > 1 ? 's' : ''} with similar wording (unconfirmed).`, 'corroboration');

  const clusterSize = ctx.clusterSize || 0;
  if (clusterSize >= 5) add('cluster', 'Hotspot with 5+ open reports', 14, `${clusterSize} open reports within ~250 m.`, 'corroboration');
  else if (clusterSize >= 3) add('cluster', 'Hotspot with 3+ open reports', 10, `${clusterSize} open reports within ~250 m.`, 'corroboration');

  const confirmations = ctx.confirmations || 0;
  if (confirmations > 0) add('confirmations', 'Citizen confirmations', Math.min(confirmations * 2, 8),
    `${confirmations} neighbour${confirmations > 1 ? 's' : ''} confirmed this issue.`, 'corroboration');

  const ageHours = ctx.ageHours ?? 0;
  if (OPEN_STATUSES.includes(report.status) && ageHours >= 168) add('age', 'Unresolved for 7+ days', 6, `Open for ${Math.round(ageHours / 24)} days.`, 'time');
  else if (OPEN_STATUSES.includes(report.status) && ageHours >= 72) add('age', 'Unresolved for 3+ days', 4, `Open for ${Math.round(ageHours / 24)} days.`, 'time');

  if (MINOR.test(text)) add('minor', 'Minor / cosmetic language', -6, 'Description suggests a low-impact or cosmetic issue.', 'negative');
  if (tokenize(text, { bigrams: false }).length < 5) add('vague', 'Very short description', -4, 'Too little detail to judge impact confidently.', 'negative');

  const raw = factors.reduce((s, f) => s + f.points, 0);
  const score = Math.max(0, Math.min(100, Math.round(raw)));
  const level = score >= 76 ? 'Critical' : score >= 55 ? 'High' : score >= 30 ? 'Medium' : 'Low';

  const positive = factors.filter(f => f.points > 0).sort((a, b) => b.points - a.points);
  const explanation = positive.length
    ? `${level} because ${positive.slice(0, 3).map(f => `${f.label.toLowerCase()} (+${f.points})`).join(', ')}${positive.length > 3 ? ` and ${positive.length - 3} more factor${positive.length - 3 > 1 ? 's' : ''}` : ''}.`
    : 'Low because no urgency, hazard or impact signals were found.';

  const words = tokenize(text, { bigrams: false }).length;
  let confidence = 0.42;
  if (words >= 8) confidence += 0.14;
  if (words >= 16) confidence += 0.08;
  if (ctx.categoryConfidence) confidence += 0.16 * ctx.categoryConfidence;
  if (severe) confidence += 0.08;
  if (linked + similar + clusterSize > 0) confidence += 0.1;
  if (MINOR.test(text)) confidence -= 0.08;
  confidence = Math.max(0.3, Math.min(0.93, confidence));

  return {
    score,
    level,
    raw,
    factors,
    explanation,
    confidence: +confidence.toFixed(2),
    confidenceLabel: confidence >= 0.72 ? 'High' : confidence >= 0.55 ? 'Medium' : 'Low',
    method: 'weighted rubric v1 (deterministic)',
    thresholds: { Critical: 76, High: 55, Medium: 30 },
    slaHours: PRIORITY_META[level].sla,
  };
}

export function comparePriority(a, b) {
  const ids = [...new Set([...a.priority.factors, ...b.priority.factors].map(f => f.id))];
  const rows = ids.map(id => {
    const fa = a.priority.factors.find(f => f.id === id);
    const fb = b.priority.factors.find(f => f.id === id);
    return {
      id,
      label: (fa || fb).label,
      a: fa ? fa.points : 0,
      b: fb ? fb.points : 0,
      detailA: fa ? fa.detail : null,
      detailB: fb ? fb.detail : null,
    };
  }).filter(r => r.a || r.b).sort((x, y) => Math.abs(y.a - y.b) - Math.abs(x.a - x.b));
  return {
    a: { id: a.id, score: a.priority.score, level: a.priority.level },
    b: { id: b.id, score: b.priority.score, level: b.priority.level },
    rows,
    verdict: a.priority.score === b.priority.score
      ? 'These reports score the same. Ties are broken by recency in the queue.'
      : `${a.id} scores ${Math.abs(a.priority.score - b.priority.score)} points ${a.priority.score > b.priority.score ? 'higher' : 'lower'} than ${b.id}. The biggest driver is ${rows[0]?.label.toLowerCase()}.`,
  };
}

// ---------------------------------------------------------------------------
// Full analysis for a report
// ---------------------------------------------------------------------------

export function nearbyCount(report, reports, meters = 250) {
  return reports.filter(r => r.id !== report.id && r.status !== 'rejected' && !r.duplicateOf
    && haversine(report.location, r.location) <= meters).length;
}

export function analyzeReport(report, reports, { now = Date.now(), idfModel = null } = {}) {
  const categoryPrediction = classifier.predict(report.text);
  const area = report.area || nearestLocality(report.location.lat, report.location.lng).name;
  const summary = summarize(report.text, report.category, area);
  const duplicates = findDuplicateCandidates(report, reports, 5, idfModel);
  const linked = reports.filter(r => r.duplicateOf === report.id).length;
  const clusterSize = nearbyCount(report, reports) + 1;
  const ageHours = (now - new Date(report.createdAt)) / 36e5;
  const priority = scorePriority(report, {
    linkedDuplicates: linked,
    similarReports: duplicates.filter(d => d.decision === 'likely-duplicate').length,
    clusterSize,
    confirmations: report.confirmations || 0,
    ageHours,
    categoryConfidence: categoryPrediction.confidence,
  });
  return {
    categoryPrediction,
    summary,
    duplicates,
    priority,
    nearby: clusterSize,
    area,
    generatedAt: new Date(now).toISOString(),
    models: {
      category: 'naive-bayes-v1',
      duplicates: semanticScoringActive() ? 'bge-small-semantic-hybrid-v2' : 'tfidf-geo-hybrid-v1',
      priority: 'rubric-v1',
      summary: 'extractive-v1',
    },
  };
}

// ---------------------------------------------------------------------------
// DBSCAN hotspots
// ---------------------------------------------------------------------------

export const CLUSTER_EPS_METERS = 220;
export const CLUSTER_MIN_POINTS = 3;

function dbscan(points, eps, minPts) {
  const labels = new Array(points.length).fill(-1);
  let clusterId = 0;
  const regionQuery = (i) => points
    .map((p, j) => ({ j, d: haversine(p, points[i]) }))
    .filter(x => x.d <= eps);

  for (let i = 0; i < points.length; i++) {
    if (labels[i] !== -1) continue;
    const neighbors = regionQuery(i);
    if (neighbors.length < minPts) { labels[i] = -2; continue; }
    labels[i] = clusterId;
    const queue = neighbors.map(n => n.j).filter(j => j !== i);
    while (queue.length) {
      const j = queue.shift();
      if (labels[j] === -2) labels[j] = clusterId;
      if (labels[j] !== -1) continue;
      labels[j] = clusterId;
      const n2 = regionQuery(j);
      if (n2.length >= minPts) queue.push(...n2.map(n => n.j));
    }
    clusterId++;
  }
  return { labels, count: clusterId };
}

const HYPOTHESES = [
  {
    test: s => s.has('Waterlogging') && s.has('Drainage'),
    title: 'Drainage failure suspected',
    text: 'Standing water and blocked/overflowing drains are reported together. These are probably one underlying drainage problem, not separate fixes.',
    team: 'Drainage & Stormwater',
    firstStep: 'Inspect and clear the storm-water drain at the cluster centre; deploy a pump if water is still standing.',
  },
  {
    test: s => s.has('Waterlogging') && s.has('Road Damage'),
    title: 'Water damage to road surface',
    text: 'Waterlogging and road damage co-occur. Repeated flooding may be eroding the road base, so patching before the drainage is fixed would be temporary.',
    team: 'Drainage & Stormwater',
    firstStep: 'Fix the water outlet first, then schedule pavement repair after the surface dries.',
  },
  {
    test: s => s.has('Waste Overflow') && (s.has('Drainage') || s.has('Waterlogging')),
    title: 'Waste blocking drainage',
    text: 'Waste and drainage complaints overlap. Solid waste may be choking drain inlets and causing local flooding.',
    team: 'Solid Waste Management',
    firstStep: 'Clear the waste black spot and inspect the adjacent drain inlets.',
  },
  {
    test: s => s.has('Water Supply') && (s.has('Drainage') || s.has('Waterlogging')),
    title: 'Possible water contamination',
    text: 'Water-supply complaints appear alongside drainage problems. Contamination is possible and should be verified, not assumed.',
    team: 'Water Supply',
    firstStep: 'Test tap water at two points and isolate any cross-connection before restoring supply.',
  },
  {
    test: s => s.has('Streetlight') && s.has('Safety Hazard'),
    title: 'Darkness linked to safety reports',
    text: 'Streetlight outages and safety complaints co-occur. Darkness may be raising perceived or actual risk.',
    team: 'Street Lighting',
    firstStep: 'Restore lighting on the main pedestrian stretch and check exposed wiring.',
  },
  {
    test: s => s.has('Road Damage') && s.has('Safety Hazard'),
    title: 'Road defect with safety consequences',
    text: 'Road damage is being reported together with safety hazards, suggesting the defect is actively dangerous.',
    team: 'Roads & Potholes',
    firstStep: 'Barricade the defect, then schedule a permanent repair.',
  },
];

function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
}

export function detectClusters(reports, { now = Date.now() } = {}) {
  const open = reports.filter(r => OPEN_STATUSES.includes(r.status) && !r.duplicateOf);
  const points = open.map(r => ({ lat: r.location.lat, lng: r.location.lng }));
  const { labels, count } = dbscan(points, CLUSTER_EPS_METERS, CLUSTER_MIN_POINTS);
  const clusters = [];

  for (let c = 0; c < count; c++) {
    const members = open.filter((_, i) => labels[i] === c);
    if (!members.length) continue;
    const cats = {};
    for (const r of members) cats[r.category] = (cats[r.category] || 0) + 1;
    const catSet = new Set(Object.keys(cats));
    const dominant = Object.entries(cats).sort((a, b) => b[1] - a[1])[0][0];
    const lat = members.reduce((s, r) => s + r.location.lat, 0) / members.length;
    const lng = members.reduce((s, r) => s + r.location.lng, 0) / members.length;
    const radius = Math.max(...members.map(r => haversine({ lat, lng }, r.location)));
    const areaCounts = {};
    for (const r of members) areaCounts[r.area] = (areaCounts[r.area] || 0) + 1;
    const area = Object.entries(areaCounts).sort((a, b) => b[1] - a[1])[0][0];
    const sorted = [...members].sort((a, b) => b.priority.score - a.priority.score);
    const critical = members.filter(r => r.priority.level === 'Critical').length;
    const high = members.filter(r => r.priority.level === 'High').length;
    const avg = Math.round(members.reduce((s, r) => s + r.priority.score, 0) / members.length);
    const severity = Math.min(100, Math.round(avg + Math.min(18, members.length * 2) + critical * 4));
    const last7 = members.filter(r => now - new Date(r.createdAt) < 7 * 864e5).length;
    const prev7 = members.filter(r => {
      const age = now - new Date(r.createdAt);
      return age >= 7 * 864e5 && age < 14 * 864e5;
    }).length;
    const firstSeen = new Date(Math.min(...members.map(r => new Date(r.createdAt)))).toISOString();
    const lastSeen = new Date(Math.max(...members.map(r => new Date(r.createdAt)))).toISOString();
    const daysActive = Math.max(1, Math.round((now - new Date(firstSeen)) / 864e5));
    const hyp = HYPOTHESES.find(h => h.test(catSet)) || {
      title: 'Recurring local issue',
      text: `Multiple ${dominant.toLowerCase()} reports are concentrated in one area, suggesting a recurring local problem rather than isolated incidents.`,
      team: TEAM_FOR_CATEGORY[dominant] || 'Drainage & Stormwater',
      firstStep: `Send a field officer to inspect the ${dominant.toLowerCase()} reports at the cluster centre.`,
    };
    const team = hyp.team || TEAM_FOR_CATEGORY[dominant];
    const id = `hs-${slugify(area)}-${lat.toFixed(3)}-${lng.toFixed(3)}`;
    const brief = buildBrief({
      area, members, sorted, cats, dominant, severity, critical, high, avg,
      radius, daysActive, last7, prev7, hypothesis: hyp, firstStep: hyp.firstStep, team, id,
    });
    clusters.push({
      id,
      area,
      centroid: { lat: +lat.toFixed(6), lng: +lng.toFixed(6) },
      radiusMeters: Math.round(radius + 60),
      count: members.length,
      openCount: members.length,
      critical,
      high,
      avgPriority: avg,
      severity,
      categories: Object.entries(cats).sort((a, b) => b[1] - a[1]).map(([name, n]) => ({ name, count: n })),
      dominantCategory: dominant,
      reportIds: sorted.map(r => r.id),
      topReports: sorted.slice(0, 4).map(r => ({
        id: r.id, category: r.category, priority: r.priority.level, score: r.priority.score,
        summary: r.summary, area: r.area, status: r.status, createdAt: r.createdAt,
      })),
      firstSeen,
      lastSeen,
      daysActive,
      newLast7: last7,
      prev7,
      trend: last7 > prev7 ? 'rising' : last7 < prev7 ? 'falling' : 'steady',
      hypothesis: hyp.title,
      hypothesisDetail: hyp.text,
      recommendedTeam: team,
      firstStep: hyp.firstStep,
      brief,
      method: 'DBSCAN · eps 220 m · minPts 3',
    });
  }
  return clusters.sort((a, b) => b.severity - a.severity);
}

function buildBrief(c) {
  const count = c.count ?? c.members.length;
  const categories = c.categories || Object.entries(c.cats).sort((a, b) => b[1] - a[1]).map(([name, n]) => ({ name, count: n }));
  const catList = categories.slice(0, 4).map(x => `${x.name} (${x.count})`).join(', ');
  const top = c.sorted[0];
  const hypothesisTitle = typeof c.hypothesis === 'string' ? c.hypothesis : c.hypothesis.title;
  const hypothesisDetail = c.hypothesisDetail || (typeof c.hypothesis === 'object' ? c.hypothesis.text : '');
  const confidence = count >= 5 && c.critical > 0 ? 'Medium-high' : count >= 4 ? 'Medium' : 'Low-medium';
  const evidence = [
    `${count} open reports within ${Math.round(c.radius + 60)} m over ${c.daysActive} day${c.daysActive === 1 ? '' : 's'}.`,
    `${c.critical} critical and ${c.high} high-priority report${c.high === 1 ? '' : 's'} in this cluster.`,
    `Categories: ${catList}.`,
    c.last7 > c.prev7
      ? `Reports are rising: ${c.last7} in the last 7 days vs ${c.prev7} the week before.`
      : c.last7 === c.prev7
        ? `Report volume is steady: ${c.last7} in each of the last two weeks.`
        : `Reports are falling: ${c.last7} in the last 7 days vs ${c.prev7} the week before.`,
  ];
  const unknowns = 'Root cause has not been verified on site. Household counts and water-quality results are unknown.';
  return {
    headline: `${c.area}: ${hypothesisTitle.toLowerCase()}`,
    situation: `${count} open reports cluster around ${c.area}. ${hypothesisDetail}`,
    evidence,
    priorityNote: `Highest report: ${top.id} (${top.priority.level}, score ${top.priority.score}). ${top.summary}`,
    action: `${c.firstStep} Owner: ${c.team}. Target: ${c.critical ? '4 hours for critical reports' : '24 hours for a first inspection'}.`,
    confidence,
    unknowns,
    generatedBy: 'template brief v1 over computed cluster statistics',
    generatedAt: new Date().toISOString(),
    clusterId: c.id,
  };
}

// ---------------------------------------------------------------------------
// Duplicate benchmark
// ---------------------------------------------------------------------------

function duplicateBenchmarkRows(embeddingPairFor = null) {
  const texts = [...DUP_PAIRS.flatMap(p => [p.a[1], p.b[1]]), ...TRAINING.map(t => t[1])];
  const idfModel = buildIdf(texts);
  const base = Date.parse('2026-06-01T08:00:00Z');
  return DUP_PAIRS.map((p, i) => {
    const a = { text: p.a[1], category: p.a[0], location: { lat: p.a[2], lng: p.a[3] }, createdAt: new Date(base).toISOString() };
    const b = { text: p.b[1], category: p.b[0], location: { lat: p.b[2], lng: p.b[3] }, createdAt: new Date(base - p.days * 864e5).toISOString() };
    return { ...duplicateScore(a, b, idfModel, embeddingPairFor ? embeddingPairFor(i) : null), label: p.label };
  });
}

function summarizeBenchmark(rows, lo = 0.3, hi = 0.9, step = 0.02) {
  const at = (threshold) => {
    const tp = rows.filter(r => r.label === 1 && r.score >= threshold).length;
    const fp = rows.filter(r => r.label === 0 && r.score >= threshold).length;
    const fn = rows.filter(r => r.label === 1 && r.score < threshold).length;
    const tn = rows.length - tp - fp - fn;
    const precision = tp + fp ? tp / (tp + fp) : 0;
    const recall = tp + fn ? tp / (tp + fn) : 0;
    const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
    return { threshold: +threshold.toFixed(2), tp, fp, fn, tn, precision: +precision.toFixed(3), recall: +recall.toFixed(3), f1: +f1.toFixed(3) };
  };
  const sweep = [];
  for (let t = lo; t <= hi + 1e-9; t += step) sweep.push(at(t));
  const best = [...sweep].sort((a, b) => b.f1 - a.f1 || b.recall - a.recall)[0];
  return { sweep, best };
}

function evaluateDuplicates() {
  const rows = duplicateBenchmarkRows();
  const { sweep, best } = summarizeBenchmark(rows);
  return {
    pairs: rows.length,
    positives: rows.filter(r => r.label === 1).length,
    fixedThreshold: summarizeBenchmark(rows).sweep.find(r => r.threshold === DUP_THRESHOLD) || null,
    bestF1: best,
    sweep,
    note: 'Small hand-labeled synthetic benchmark. Thresholds were inspected on this set, so treat these numbers as a sanity check, not real-world validation.',
  };
}

let semanticBenchmark = null;

// Called once at startup after the local embedding model is loaded. Measures
// the same benchmark with BGE vectors so the model card can compare both modes.
export async function initSemanticBenchmark() {
  const { embeddingsReady, embedTexts } = await import('./embeddings.js');
  if (!embeddingsReady()) return null;
  const texts = DUP_PAIRS.flatMap(p => [p.a[1], p.b[1]]);
  const vectors = await embedTexts(texts);
  if (!vectors) return null;
  const rows = duplicateBenchmarkRows(i => [vectors[i * 2], vectors[i * 2 + 1]]);
  const { sweep, best } = summarizeBenchmark(rows, 0.5, 0.9, 0.02);
  semanticBenchmark = {
    pairs: rows.length,
    positives: rows.filter(r => r.label === 1).length,
    fixedThreshold: sweep.find(r => r.threshold === SEMANTIC_DUP_THRESHOLD) || null,
    bestF1: best,
    sweep,
    note: 'Same 31 hand-labelled synthetic pairs, scored with local BGE-small embeddings. The operating threshold is set above the F1-optimal point to favour precision.',
  };
  return semanticBenchmark;
}

export function getSemanticBenchmark() {
  return semanticBenchmark;
}

// ---------------------------------------------------------------------------
// Insights
// ---------------------------------------------------------------------------

export function buildInsights(reports, { now = Date.now(), idfModel = null } = {}) {
  const open = reports.filter(r => OPEN_STATUSES.includes(r.status));
  const active = reports.filter(r => r.status !== 'rejected');
  const clusters = detectClusters(reports, { now });
  const model = idfModel || buildIdf([...reports.map(r => r.text), ...TRAINING.map(t => t[1])]);
  const thresholds = duplicateThresholds();


  // Suggested duplicate groups (unconfirmed): union-find over pairs above threshold.
  const parent = {};
  const find = x => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb; };
  for (const r of active) parent[r.id] = r.id;
  const candidates = [];
  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const s = duplicateScore(active[i], active[j], model);
      if (s.score >= thresholds.duplicate) {
        candidates.push({ a: active[i].id, b: active[j].id, ...s });
        union(active[i].id, active[j].id);
      }
    }
  }
  const groups = {};
  for (const r of active) {
    const root = find(r.id);
    (groups[root] = groups[root] || []).push(r);
  }
  const duplicateGroups = Object.values(groups)
    .filter(g => g.length > 1)
    .map(g => {
      const pairScores = candidates.filter(c => g.some(r => r.id === c.a) && g.some(r => r.id === c.b));
      const avg = pairScores.reduce((s, c) => s + c.score, 0) / (pairScores.length || 1);
      const sorted = [...g].sort((a, b) => b.priority.score - a.priority.score);
      return {
        id: `dg-${sorted[0].id}`,
        reportIds: sorted.map(r => r.id),
        reports: sorted.map(r => ({ id: r.id, category: r.category, summary: r.summary, area: r.area, priority: r.priority.level, createdAt: r.createdAt, duplicateOf: r.duplicateOf || null })),
        avgScore: +avg.toFixed(3),
        area: sorted[0].area,
        confirmed: sorted.some(r => r.duplicateOf),
      };
    })
    .sort((a, b) => b.avgScore - a.avgScore);

  // 14-day trend by category.
  const days = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now - i * 864e5);
    const key = d.toISOString().slice(0, 10);
    days.push({ date: key, label: d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }), total: 0, byCategory: {} });
  }
  for (const r of active) {
    const key = new Date(r.createdAt).toISOString().slice(0, 10);
    const day = days.find(d => d.date === key);
    if (!day) continue;
    day.total++;
    day.byCategory[r.category] = (day.byCategory[r.category] || 0) + 1;
  }
  const last7 = days.slice(7).reduce((s, d) => s + d.total, 0);
  const prev7 = days.slice(0, 7).reduce((s, d) => s + d.total, 0);
  const trendByCategory = CATEGORY_IDS.map(cat => {
    const a = days.slice(7).reduce((s, d) => s + (d.byCategory[cat] || 0), 0);
    const b = days.slice(0, 7).reduce((s, d) => s + (d.byCategory[cat] || 0), 0);
    return { category: cat, last7: a, prev7: b, delta: a - b };
  }).sort((a, b) => b.last7 - a.last7);

  // Area watchlist.
  const areaMap = {};
  for (const r of open) {
    if (!areaMap[r.area]) areaMap[r.area] = { area: r.area, open: 0, critical: 0, high: 0, scoreSum: 0, cats: {}, last7: 0, prev7: 0 };
    const a = areaMap[r.area];
    a.open++;
    if (r.priority.level === 'Critical') a.critical++;
    if (r.priority.level === 'High') a.high++;
    a.scoreSum += r.priority.score;
    a.cats[r.category] = (a.cats[r.category] || 0) + 1;
    const age = now - new Date(r.createdAt);
    if (age < 7 * 864e5) a.last7++;
    else if (age < 14 * 864e5) a.prev7++;
  }
  const areas = Object.values(areaMap).map(a => {
    const dominant = Object.entries(a.cats).sort((x, y) => y[1] - x[1])[0];
    const cluster = clusters.find(c => c.area === a.area);
    return {
      area: a.area,
      open: a.open,
      critical: a.critical,
      high: a.high,
      avgScore: Math.round(a.scoreSum / a.open),
      dominantCategory: dominant[0],
      dominantCount: dominant[1],
      trend: a.last7 > a.prev7 ? 'rising' : a.last7 < a.prev7 ? 'falling' : 'steady',
      last7: a.last7,
      prev7: a.prev7,
      clusterId: cluster?.id || null,
    };
  }).map(a => {
    const loc = reports.find(r => r.area === a.area);
    return { ...a, zone: loc?.zone || '—' };
  }).sort((a, b) => b.critical - a.critical || b.avgScore - a.avgScore || b.open - a.open);

  const resolved = reports.filter(r => r.status === 'resolved');
  const resolutionHours = resolved.map(r => (new Date(r.updatedAt) - new Date(r.createdAt)) / 36e5).filter(h => h > 0);
  const medianResolution = resolutionHours.length
    ? [...resolutionHours].sort((a, b) => a - b)[Math.floor(resolutionHours.length / 2)]
    : null;

  const queue = [...open].sort((a, b) => b.priority.score - a.priority.score || new Date(b.createdAt) - new Date(a.createdAt));
  const overdue = open.filter(r => r.dueAt && new Date(r.dueAt) < now);
  const emerging = active.filter(r => now - new Date(r.createdAt) < 48 * 36e5)
    .sort((a, b) => b.priority.score - a.priority.score).slice(0, 6)
    .map(r => ({ id: r.id, summary: r.summary, area: r.area, category: r.category, priority: r.priority.level, score: r.priority.score, createdAt: r.createdAt, status: r.status }));

  return {
    generatedAt: new Date(now).toISOString(),
    stats: {
      total: reports.length,
      open: open.length,
      critical: open.filter(r => r.priority.level === 'Critical').length,
      high: open.filter(r => r.priority.level === 'High').length,
      unassigned: open.filter(r => r.status === 'new' || r.status === 'review').length,
      overdue: overdue.length,
      resolved7d: resolved.filter(r => now - new Date(r.updatedAt) < 7 * 864e5).length,
      resolvedTotal: resolved.length,
      medianResolutionHours: medianResolution ? +medianResolution.toFixed(1) : null,
      hotspots: clusters.length,
      duplicatesLinked: reports.filter(r => r.duplicateOf).length,
      duplicateGroups: duplicateGroups.length,
      last7,
      prev7,
      trendDelta: last7 - prev7,
    },
    queue: queue.slice(0, 20).map(r => ({
      id: r.id, summary: r.summary, category: r.category, area: r.area,
      priority: r.priority.level, score: r.priority.score, status: r.status,
      createdAt: r.createdAt, dueAt: r.dueAt, assignee: r.assignee, team: r.team,
      confirmations: r.confirmations || 0, duplicateOf: r.duplicateOf || null,
      explanation: r.priority.explanation,
    })),
    clusters,
    brief: clusters[0]?.brief || globalBrief(open, clusters),
    duplicateGroups,
    duplicateCandidates: candidates.sort((a, b) => b.score - a.score).slice(0, 12),
    trends: { days, last7, prev7, delta: last7 - prev7, byCategory: trendByCategory },
    areas,
    emerging,
    statusCounts: Object.fromEntries(['new', 'review', 'assigned', 'in_progress', 'resolved', 'rejected'].map(s => [s, reports.filter(r => r.status === s).length])),
    model: modelCard(),
  };
}

function globalBrief(open, clusters) {
  const critical = open.filter(r => r.priority.level === 'Critical');
  const top = [...open].sort((a, b) => b.priority.score - a.priority.score)[0];
  return {
    headline: 'No multi-report hotspot right now',
    situation: open.length
      ? `${open.length} open reports, ${critical.length} critical. No group of 3+ open reports within 220 m was found, so there is no spatial cluster to escalate.`
      : 'There are no open reports in the current dataset.',
    evidence: top ? [`Highest-priority open report: ${top.id} (${top.priority.level}, ${top.priority.score}). ${top.summary}`] : [],
    priorityNote: top ? top.priority.explanation : '',
    action: top ? `Triage ${top.id} individually. Owner: ${top.team || TEAM_FOR_CATEGORY[top.category]}.` : 'Nothing to action.',
    confidence: 'High for the absence of a cluster in this dataset; low for real-world completeness.',
    unknowns: 'A cluster can be missed if reports are spread just over 220 m apart or use very different wording.',
    generatedBy: 'template brief v1 over computed statistics',
    generatedAt: new Date().toISOString(),
    clusterId: null,
  };
}

// ---------------------------------------------------------------------------
// Model card + optional LLM adapter
// ---------------------------------------------------------------------------

let llmConfig = { enabled: false, model: null, baseUrl: null };

export function configureLLM({ baseUrl, apiKey, model }) {
  llmConfig = {
    enabled: Boolean(baseUrl && apiKey && model),
    baseUrl: baseUrl || null,
    apiKey: apiKey || null,
    model: model || null,
  };
  return { enabled: llmConfig.enabled, model: llmConfig.model };
}

export function llmStatus() {
  return { enabled: llmConfig.enabled, model: llmConfig.model, note: llmConfig.enabled ? 'Optional LLM enhancement is configured.' : 'No LLM configured. The deterministic pipeline is the only AI in use.' };
}

export async function llmRewrite(kind, payload) {
  if (!llmConfig.enabled) return null;
  const prompts = {
    summary: 'Rewrite this civic report summary in at most 35 words. Do not invent facts. Return only the sentence.',
    brief: 'Rewrite this civic action brief in at most 90 words. Keep every number and uncertainty. Do not invent facts. Return only the text.',
  };
  try {
    const res = await fetch(`${llmConfig.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${llmConfig.apiKey}` },
      body: JSON.stringify({
        model: llmConfig.model,
        temperature: 0.2,
        max_tokens: 220,
        messages: [
          { role: 'system', content: 'You are a careful civic-operations writing assistant. Never invent facts or claim work was done.' },
          { role: 'user', content: `${prompts[kind] || prompts.summary}\n\n${JSON.stringify(payload)}` },
        ],
      }),
      signal: AbortSignal.timeout(9000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content?.trim();
    return text ? { text, model: llmConfig.model } : null;
  } catch {
    return null;
  }
}

export function modelCard() {
  return {
    classifier: {
      name: 'Multinomial Naive Bayes',
      version: 'nb-v1',
      features: 'unigrams + bigrams, stopword removal, light suffix stemming',
      classes: CATEGORY_IDS.length,
      trainingDocuments: TRAINING.length,
      synthetic: true,
      metrics: classifierMetrics,
    },
    duplicates: {
      name: semanticScoringActive()
        ? 'BGE-small sentence embeddings + geospatial hybrid'
        : 'TF-IDF cosine + geospatial hybrid',
      version: semanticScoringActive() ? 'dup-v2-semantic' : 'dup-v1-tfidf',
      activeMode: duplicateThresholds().mode,
      weights: { textSimilarity: 0.6, geoProximity: 0.22, categoryMatch: 0.1, timeDecay: 0.08 },
      threshold: duplicateThresholds().duplicate,
      relatedThreshold: duplicateThresholds().related,
      geoDecayMeters: 320,
      timeDecayDays: 12,
      embeddingModel: {
        id: 'Xenova/bge-small-en-v1.5',
        runtime: '@xenova/transformers (quantized ONNX, CPU)',
        dimensions: 384,
        local: true,
        note: 'Text never leaves the machine. If the model is unavailable the pipeline automatically falls back to TF-IDF.',
      },
      benchmark: evaluateDuplicates(),
      semanticBenchmark: getSemanticBenchmark(),
      humanInTheLoop: 'The system only suggests. A staff member must confirm a duplicate link.',
    },
    priority: {
      name: 'Explainable weighted rubric',
      version: 'rubric-v1',
      levels: { Critical: 76, High: 55, Medium: 30, Low: 0 },
      slaHours: { Critical: 4, High: 24, Medium: 72, Low: 168 },
      factors: [
        'Category baseline risk',
        'Life-safety / hazard language (+32)',
        'Vulnerable place nearby (+8)',
        'Impact on people or movement (+10)',
        'Public-health signal (+6)',
        'Night-time safety for streetlights (+10)',
        'Loss of essential water supply (+10)',
        'Confirmed duplicates (+5 each, max 15)',
        'Unconfirmed similar reports (+4 each, max 12)',
        'Hotspot size (+10 / +14)',
        'Citizen confirmations (+2 each, max 8)',
        'Age while unresolved (+4 / +6)',
        'Minor/cosmetic language (-6)',
        'Very short description (-4)',
      ],
    },
    clusters: {
      name: 'DBSCAN over haversine distance',
      epsMeters: CLUSTER_EPS_METERS,
      minPoints: CLUSTER_MIN_POINTS,
      scope: 'Open, non-duplicate reports',
    },
    summaries: { name: 'Extractive sentence selection + rule-based signal extraction', generative: false },
    llm: llmStatus(),
    teams: TEAMS.map(t => ({ id: t.id, name: t.name, categories: t.categories })),
  };
}

export function classifyForPlayground(text) {
  const prediction = classifier.predict(text);
  const area = 'your area';
  const summary = summarize(text, prediction.label, area);
  const priority = scorePriority({ text, category: prediction.label, status: 'new' }, {
    categoryConfidence: prediction.confidence,
    ageHours: 0,
  });
  return { prediction, summary, priority };
}

export { classifierMetrics, evaluateDuplicates };
