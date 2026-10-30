// JSON-file persistence + domain actions. Zero external dependencies.

import fs from 'node:fs';
import path from 'node:path';
import {
  analyzeReport, buildInsights, comparePriority, classifyForPlayground,
  configureLLM, llmStatus, llmRewrite, modelCard, buildReportIdf,
  findDuplicateCandidates, setReportEmbedding, setSemanticMode, initSemanticBenchmark,
  duplicateThresholds,
} from './ai.js';
import { initEmbeddings, embedTexts, embedText, embeddingsReady, embeddingsStatus } from './embeddings.js';
import { buildSeedReports, buildSurgeReports } from './seed.js';
import {
  ALLOWED_TRANSITIONS, CATEGORY_IDS, CATEGORY_MAP, OPEN_STATUSES, PRIORITY_META,
  STATUS_MAP, TEAM_FOR_CATEGORY, TEAM_MAP, TEAMS, nearestLocality,
} from './geo.js';

const DATA_DIR = path.resolve('data');
const STATE_FILE = path.join(DATA_DIR, 'state.json');

let state = null;
let saveTimer = null;

function nowIso() { return new Date().toISOString(); }

function nextId() {
  const max = state.reports.reduce((m, r) => {
    const n = Number(String(r.id).replace(/\D/g, ''));
    return Number.isFinite(n) ? Math.max(m, n) : m;
  }, 1000);
  state.seq = max + 1;
  return `CP-${state.seq}`;
}

function addHistory(report, entry) {
  report.history.push({ at: nowIso(), actor: 'Operations desk', ...entry });
  report.updatedAt = nowIso();
}

// Embed report texts with the local BGE model and register the vectors for
// duplicate scoring. Safe to call repeatedly: embeddings.js caches by text.
async function indexEmbeddings(reports) {
  if (!embeddingsReady() || !reports.length) return false;
  const vectors = await embedTexts(reports.map(r => r.text));
  if (!vectors) return false;
  reports.forEach((r, i) => setReportEmbedding(r.id, vectors[i]));
  return setSemanticMode(true);
}

function analyzeAll({ now = Date.now() } = {}) {
  const reports = state.reports;
  // First pass: make sure every report has area/summary so duplicate previews are useful.
  for (const r of reports) {
    if (!r.area) {
      const loc = nearestLocality(r.location.lat, r.location.lng);
      r.area = loc.name; r.zone = loc.zone; r.ward = loc.ward;
    }
  }
  // Second pass: full AI analysis with the complete corpus in view. The IDF
  // model is built once instead of once per report.
  const idfModel = buildReportIdf(reports);
  for (const r of reports) {
    const ai = analyzeReport(r, reports, { now, idfModel });
    r.summary = ai.summary.text;
    r.ai = ai;
    r.priority = ai.priority;
    if (!r.team) r.team = TEAM_FOR_CATEGORY[r.category] || null;
    if (!r.dueAt) r.dueAt = new Date(new Date(r.createdAt).getTime() + ai.priority.slaHours * 36e5).toISOString();
  }
}

async function seedState({ now = Date.now() } = {}) {
  const reports = buildSeedReports(now);
  state = {
    version: 1,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    resetAt: nowIso(),
    seq: 1000,
    reports,
    meta: {
      source: 'synthetic',
      note: 'Synthetic demo dataset. All reports, names and locations are fictional.',
      seededAt: nowIso(),
    },
  };
  await indexEmbeddings(reports);
  analyzeAll({ now });
  // Add an AI triage event to each seeded report, after analysis.
  for (const r of state.reports) {
    const at = new Date(Math.min(now, new Date(r.createdAt).getTime() + 60e3)).toISOString();
    r.history.push({
      at,
      type: 'ai',
      actor: 'CivicPulse AI',
      text: `Triaged as ${r.category} (${Math.round(r.ai.categoryPrediction.confidence * 100)}% model confidence) · ${r.priority.level} priority (${r.priority.score}/100).`,
    });
    r.history.sort((a, b) => new Date(a.at) - new Date(b.at));
    // Keep the seed due date aligned with the computed priority.
    r.dueAt = new Date(new Date(r.createdAt).getTime() + r.priority.slaHours * 36e5).toISOString();
  }
  state.seq = Math.max(...state.reports.map(r => Number(String(r.id).replace(/\D/g, ''))));
  return state;
}

export async function initStore({ forceReset = false } = {}) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const embeddings = await initEmbeddings();
  if (!embeddings.ready) {
    console.warn('Local embeddings unavailable — duplicate scoring will use TF-IDF.');
  }
  // Measure the duplicate benchmark in both modes for the model card.
  await initSemanticBenchmark();

  if (!forceReset && fs.existsSync(STATE_FILE)) {
    try {
      const loaded = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
      if (loaded && Array.isArray(loaded.reports) && loaded.reports.length) {
        state = loaded;
        await indexEmbeddings(state.reports);
        // Recompute AI fields so threshold/model changes apply to saved data.
        analyzeAll();
        persistNow();
        return { seeded: false, count: state.reports.length, embeddings: embeddingsStatus() };
      }
    } catch (err) {
      console.warn('Could not read saved state, reseeding:', err.message);
    }
  }
  await seedState();
  persistNow();
  return { seeded: true, count: state.reports.length, embeddings: embeddingsStatus() };
}

export function getState() { return state; }

function persistNow() {
  if (!state) return;
  state.updatedAt = nowIso();
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${STATE_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, STATE_FILE);
}

function schedulePersist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { persistNow(); } catch (err) { console.error('Persist failed:', err.message); }
  }, 250);
}

export function flush() {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  persistNow();
}

function publicReport(r) {
  return r;
}

export function getReport(id) {
  return state.reports.find(r => r.id.toLowerCase() === String(id).toLowerCase()) || null;
}

export function getBootstrap() {
  const insights = buildInsights(state.reports);
  return {
    reports: state.reports,
    insights,
    config: {
      categories: CATEGORY_IDS.map(id => CATEGORY_MAP[id]),
      teams: TEAMS,
      statuses: Object.values(STATUS_MAP),
      openStatuses: OPEN_STATUSES,
      transitions: ALLOWED_TRANSITIONS,
      priority: PRIORITY_META,
      meta: state.meta,
      resetAt: state.resetAt,
      model: modelCard(),
      llm: llmStatus(),
      embeddings: embeddingsStatus(),
      app: {
        name: 'CivicPulse',
        version: '1.0.0',
        dataSource: 'Synthetic demo data',
        aiMode: llmStatus().enabled ? 'deterministic + optional LLM' : 'deterministic (local)',
      },
    },
  };
}

export function getInsights() {
  return buildInsights(state.reports);
}

function normalizeCategory(cat) {
  if (!cat) return null;
  const found = CATEGORY_IDS.find(c => c.toLowerCase() === String(cat).toLowerCase());
  return found || null;
}

export async function createReport(body = {}) {
  const text = String(body.text || '').trim();
  if (text.length < 8) throw httpError(400, 'Please describe the issue in at least 8 characters.');
  if (text.length > 4000) throw httpError(400, 'Description is too long (max 4000 characters).');
  const lat = Number(body.location?.lat);
  const lng = Number(body.location?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    throw httpError(400, 'A valid map location is required.');
  }
  const submitted = normalizeCategory(body.category);
  const loc = nearestLocality(lat, lng);
  const createdAt = nowIso();
  const prediction = classifyForPlayground(text).prediction;
  const category = submitted || prediction.label;
  const id = nextId();
  let photoPath = null;
  if (typeof body.photo === 'string' && body.photo.startsWith('data:image/')) {
    photoPath = savePhoto(body.photo, id);
  } else if (typeof body.photo === 'string' && /^\/uploads\/[a-z0-9._-]+$/i.test(body.photo)) {
    photoPath = body.photo;
  }
  const report = {
    id,
    createdAt,
    updatedAt: createdAt,
    status: 'new',
    category,
    submittedCategory: submitted || 'Auto-detect',
    text,
    area: body.area || loc.name,
    zone: loc.zone,
    ward: loc.ward,
    location: {
      lat: +lat.toFixed(6),
      lng: +lng.toFixed(6),
      address: String(body.location?.address || `${loc.name}, Bengaluru`).slice(0, 240),
    },
    photo: photoPath,
    photoMeta: body.photoMeta || null,
    reporter: {
      name: String(body.reporterName || 'Anonymous citizen').slice(0, 60),
      channel: body.channel || 'Citizen app',
    },
    source: body.source || 'citizen',
    confirmations: 0,
    duplicateOf: null,
    team: TEAM_FOR_CATEGORY[category] || null,
    assignee: null,
    dueAt: null,
    resolution: null,
    comments: [],
    history: [{ at: createdAt, type: 'created', actor: 'Citizen', text: `Report received via ${body.channel || 'Citizen app'}.` }],
    ai: null,
    priority: null,
    summary: null,
  };

  state.reports.push(report);
  await indexEmbeddings([report]);
  analyzeAll();
  report.dueAt = new Date(new Date(report.createdAt).getTime() + report.priority.slaHours * 36e5).toISOString();
  addHistory(report, {
    type: 'ai',
    actor: 'CivicPulse AI',
    text: `Triaged as ${report.category} (${Math.round(report.ai.categoryPrediction.confidence * 100)}% model confidence) · ${report.priority.level} priority (${report.priority.score}/100).`,
  });

  if (llmStatus().enabled) {
    const rewritten = await llmRewrite('summary', {
      text: report.text, category: report.category, area: report.area,
      signals: report.ai.summary.signals, priority: report.priority.level,
    });
    if (rewritten) {
      report.ai.llmSummary = { ...rewritten, note: 'Optional LLM rewrite; not used for classification or priority.' };
    }
  }

  schedulePersist();
  return { report, ai: report.ai, insights: buildInsights(state.reports) };
}

export function applyAction(id, body = {}) {
  const report = getReport(id);
  if (!report) throw httpError(404, 'Report not found.');
  const action = body.action;
  const actor = String(body.actor || 'Ops user').slice(0, 60);

  if (action === 'status') {
    const to = String(body.to || '');
    if (!STATUS_MAP[to]) throw httpError(400, 'Unknown status.');
    if (!ALLOWED_TRANSITIONS[report.status]?.includes(to)) {
      throw httpError(400, `Cannot move from ${STATUS_MAP[report.status].label} to ${STATUS_MAP[to].label}.`);
    }
    if (to === 'resolved' && !String(body.note || '').trim()) {
      throw httpError(400, 'A short resolution note is required before resolving.');
    }
    if (to === 'rejected' && !String(body.note || '').trim()) {
      throw httpError(400, 'A reason is required before closing a report.');
    }
    const from = report.status;
    report.status = to;
    if (to === 'resolved') {
      report.resolution = String(body.note).slice(0, 1000);
      report.comments.push({
        id: `${report.id}-c${report.comments.length + 1}`,
        at: nowIso(),
        author: actor,
        internal: false,
        text: report.resolution,
      });
    }
    if (to === 'rejected') report.resolution = String(body.note).slice(0, 1000);
    addHistory(report, {
      type: 'status',
      actor,
      from,
      to,
      text: String(body.note || '').slice(0, 500) || `Moved from ${STATUS_MAP[from].label} to ${STATUS_MAP[to].label}.`,
    });
  } else if (action === 'assign') {
    const teamId = body.teamId ? String(body.teamId) : null;
    const teamName = teamId ? TEAM_MAP[teamId]?.name : String(body.team || '');
    if (!teamName || !TEAMS.some(t => t.name === teamName)) throw httpError(400, 'Choose a valid team.');
    const assignee = String(body.assignee || TEAM_MAP[teamId]?.lead || 'Field crew').slice(0, 60);
    const from = report.status;
    report.team = teamName;
    report.assignee = assignee;
    if (report.status === 'new' || report.status === 'review') {
      report.status = 'assigned';
      report.history.push({
        at: nowIso(), type: 'status', actor, from, to: 'assigned',
        text: `Assigned to ${teamName} · ${assignee}.`,
      });
    } else {
      addHistory(report, { type: 'assignment', actor, text: `Reassigned to ${teamName} · ${assignee}.` });
    }
    report.dueAt = new Date(new Date(report.createdAt).getTime() + report.priority.slaHours * 36e5).toISOString();
    report.updatedAt = nowIso();
  } else if (action === 'comment') {
    const text = String(body.text || '').trim();
    if (text.length < 2) throw httpError(400, 'Comment is empty.');
    if (text.length > 1500) throw httpError(400, 'Comment is too long.');
    report.comments.push({
      id: `${report.id}-c${report.comments.length + 1}`,
      at: nowIso(),
      author: actor,
      internal: Boolean(body.internal),
      text,
    });
    addHistory(report, {
      type: 'comment',
      actor,
      internal: Boolean(body.internal),
      text: `${body.internal ? 'Internal note' : 'Public update'}: ${text}`.slice(0, 500),
    });
  } else if (action === 'confirm') {
    report.confirmations = (report.confirmations || 0) + 1;
    addHistory(report, { type: 'confirm', actor: 'Citizen', text: `Citizen confirmed this issue (${report.confirmations} total).` });
  } else if (action === 'linkDuplicate') {
    const targetId = String(body.targetId || '');
    const target = getReport(targetId);
    if (!target) throw httpError(400, 'Duplicate target not found.');
    if (target.id === report.id) throw httpError(400, 'A report cannot duplicate itself.');
    if (report.duplicateOf) throw httpError(400, 'This report is already linked to a duplicate.');
    report.duplicateOf = target.id;
    report.status = report.status === 'new' ? 'review' : report.status;
    target.confirmations = (target.confirmations || 0) + 1;
    addHistory(report, {
      type: 'duplicate', actor,
      text: `Confirmed as a duplicate of ${target.id}. The canonical report keeps the queue position.`,
    });
    addHistory(target, {
      type: 'duplicate', actor,
      text: `${report.id} was linked to this report as a duplicate.`,
    });
    analyzeAll();
  } else if (action === 'unlinkDuplicate') {
    if (!report.duplicateOf) throw httpError(400, 'This report is not linked.');
    const targetId = report.duplicateOf;
    report.duplicateOf = null;
    addHistory(report, { type: 'duplicate', actor, text: `Duplicate link to ${targetId} removed.` });
    analyzeAll();
  } else if (action === 'category') {
    const cat = normalizeCategory(body.category);
    if (!cat) throw httpError(400, 'Unknown category.');
    const from = report.category;
    report.category = cat;
    report.team = TEAM_FOR_CATEGORY[cat] || report.team;
    addHistory(report, { type: 'category', actor, text: `Category changed from ${from} to ${cat}. ${String(body.note || '').slice(0, 240)}`.trim() });
    analyzeAll();
  } else if (action === 'assignCluster') {
    const ids = Array.isArray(body.reportIds) ? body.reportIds : [];
    const teamId = body.teamId ? String(body.teamId) : null;
    const teamName = teamId ? TEAM_MAP[teamId]?.name : String(body.team || '');
    if (!teamName || !TEAMS.some(t => t.name === teamName)) throw httpError(400, 'Choose a valid team.');
    const assignee = String(body.assignee || TEAM_MAP[teamId]?.lead || 'Field crew').slice(0, 60);
    let count = 0;
    for (const rid of ids) {
      const r = getReport(rid);
      if (!r || r.status === 'resolved' || r.duplicateOf) continue;
      const from = r.status;
      r.team = teamName;
      r.assignee = assignee;
      if (r.status === 'new' || r.status === 'review') r.status = 'assigned';
      r.dueAt = new Date(new Date(r.createdAt).getTime() + r.priority.slaHours * 36e5).toISOString();
      r.history.push({
        at: nowIso(), type: 'assignment', actor,
        text: `Cluster assignment to ${teamName} · ${assignee}.${from !== r.status ? ` Status moved to assigned.` : ''}`,
      });
      r.updatedAt = nowIso();
      count++;
    }
    if (!count) throw httpError(400, 'No assignable reports in this cluster.');
    return { updated: count, report: getReport(id) || null };
  } else {
    throw httpError(400, 'Unknown action.');
  }

  schedulePersist();
  return { report: publicReport(getReport(report.id)), insights: buildInsights(state.reports) };
}

export async function simulateSurge() {
  const now = Date.now();
  const surge = buildSurgeReports(now);
  const created = [];
  for (const s of surge) {
    const id = nextId();
    const report = {
      ...s,
      id,
      history: [{ at: s.createdAt, type: 'created', actor: 'Citizen', text: 'Report received via Citizen app (simulated demo surge).' }],
    };
    state.reports.push(report);
    created.push(report);
  }
  await indexEmbeddings(created);
  analyzeAll({ now });
  for (const r of created) {
    r.dueAt = new Date(new Date(r.createdAt).getTime() + r.priority.slaHours * 36e5).toISOString();
    addHistory(r, {
      type: 'ai', actor: 'CivicPulse AI',
      text: `Triaged as ${r.category} (${Math.round(r.ai.categoryPrediction.confidence * 100)}% model confidence) · ${r.priority.level} priority (${r.priority.score}/100).`,
    });
  }
  schedulePersist();
  return { created: created.map(r => r.id), insights: buildInsights(state.reports) };
}

function clearUploads() {
  const dir = path.resolve('uploads');
  let removed = 0;
  try {
    for (const name of fs.readdirSync(dir)) {
      if (/^CP-\d+\.(png|jpe?g|webp)$/i.test(name)) {
        fs.rmSync(path.join(dir, name), { force: true });
        removed += 1;
      }
    }
  } catch {
    // No uploads directory yet.
  }
  return removed;
}

export async function resetDemo() {
  const removedPhotos = clearUploads();
  await seedState();
  persistNow();
  return { ...getBootstrap(), reset: { removedPhotos } };
}

export function compare(aId, bId) {
  const a = getReport(aId);
  const b = getReport(bId);
  if (!a || !b) throw httpError(404, 'Report not found.');
  return comparePriority(a, b);
}

// Live preview used by the report form and the AI playground. When a location
// is supplied we run the same duplicate scorer as a real submission, so the
// preview matches what ops will see. The preview report is never stored.
export async function analyzeText(body = {}) {
  const text = String(body.text || '').trim();
  if (!text) throw httpError(400, 'Enter some text to analyse.');
  const clipped = text.slice(0, 2000);
  const result = classifyForPlayground(clipped);
  const lat = Number(body.location?.lat);
  const lng = Number(body.location?.lng);
  const hasLocation = Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
  const category = normalizeCategory(body.category) || result.prediction.label;

  result.duplicates = [];
  result.comparedAgainst = 0;
  result.scoredWith = hasLocation ? duplicateThresholds().mode : 'text-only';
  if (!hasLocation) return result;

  const preview = {
    id: '__preview__',
    text: clipped,
    category,
    location: { lat, lng },
    createdAt: nowIso(),
    status: 'new',
  };
  let incomingEmbedding = null;
  if (embeddingsReady()) {
    try { incomingEmbedding = await embedText(clipped); } catch { incomingEmbedding = null; }
  }
  result.duplicates = findDuplicateCandidates(
    preview,
    state.reports,
    4,
    buildReportIdf(state.reports),
    incomingEmbedding,
  );
  result.comparedAgainst = state.reports.length;
  return result;
}

export function exportCsv() {
  const cols = ['id', 'createdAt', 'status', 'category', 'priority', 'score', 'area', 'ward', 'lat', 'lng', 'team', 'assignee', 'duplicateOf', 'summary'];
  const rows = state.reports.map(r => [
    r.id, r.createdAt, r.status, r.category, r.priority?.level, r.priority?.score, r.area, r.ward,
    r.location.lat, r.location.lng, r.team, r.assignee || '', r.duplicateOf || '', r.summary,
  ]);
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  return [cols.join(','), ...rows.map(r => r.map(esc).join(','))].join('\n');
}

export function savePhoto(dataUrl, id) {
  const m = /^data:image\/(png|jpe?g|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!m) throw httpError(400, 'Unsupported image format.');
  const ext = m[1] === 'jpeg' ? 'jpg' : m[1];
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > 3.5 * 1024 * 1024) throw httpError(400, 'Image is too large (max 3.5 MB after compression).');
  const dir = path.resolve('uploads');
  fs.mkdirSync(dir, { recursive: true });
  const name = `${id}.${ext}`;
  fs.writeFileSync(path.join(dir, name), buf);
  return `/uploads/${name}`;
}

export function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

export function initLLM() {
  return configureLLM({
    baseUrl: process.env.CIVIC_LLM_URL,
    apiKey: process.env.CIVIC_LLM_KEY,
    model: process.env.CIVIC_LLM_MODEL,
  });
}
