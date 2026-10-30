import { api } from '../api.js';
import {
  icon, esc, categoryTag, priorityPill, statusPill, timeAgo, fmtDateTime, fmtDate,
  pct, scoreBar, toast, emptyState, relativeDue, $,
} from '../ui.js';
import { createMap, reportMarker } from '../map.js';

const CITIZEN_STEPS = [
  { id: 'new', label: 'Report received', desc: 'Your report reached the civic queue.' },
  { id: 'review', label: 'Being reviewed', desc: 'An operator checks the AI triage and any duplicate suggestions.' },
  { id: 'assigned', label: 'Assigned to a team', desc: 'A field team now owns the work.' },
  { id: 'in_progress', label: 'Work started', desc: 'A crew is on site or the repair is scheduled.' },
  { id: 'resolved', label: 'Resolved', desc: 'The fix was completed and verified.' },
];

const STATUS_INDEX = { new: 0, review: 1, assigned: 2, in_progress: 3, resolved: 4, rejected: 1 };

function historyFor(report, status) {
  const hits = (report.history || []).filter(h => h.to === status || (status === 'new' && h.type === 'created'));
  return hits.length ? hits[hits.length - 1].at : null;
}

function timelineMarkup(report) {
  const idx = STATUS_INDEX[report.status] ?? 0;
  const rejected = report.status === 'rejected';
  return `<div class="timeline">
    ${CITIZEN_STEPS.map((step, i) => {
      const done = !rejected && i < idx;
      const current = !rejected && i === idx;
      const at = historyFor(report, step.id);
      const resolvedAt = step.id === 'resolved' && report.status === 'resolved' ? report.updatedAt : at;
      return `<div class="tl-item ${done ? 'done' : ''} ${current ? 'current' : ''}">
        <div class="tl-dot">${done || current ? icon('check', 13) : `<span style="font-size:10px">${i + 1}</span>`}</div>
        <div class="tl-body">
          <b>${esc(step.label)}</b>
          <p>${esc(step.desc)}</p>
          ${done || current ? `<div class="tl-time">${resolvedAt ? fmtDateTime(resolvedAt) : 'In progress'}</div>` : ''}
        </div>
      </div>`;
    }).join('')}
  </div>`;
}

function statusRail(report) {
  const idx = STATUS_INDEX[report.status] ?? 0;
  const closed = report.status === 'rejected';
  return `<div class="status-rail">
    ${CITIZEN_STEPS.map((s, i) => `<span class="seg ${!closed && i <= idx ? 'on' : ''}"></span>`).join('')}
  </div>
  <div class="status-rail-labels"><span>Received</span><span>Reviewed</span><span>Assigned</span><span>Started</span><span>Resolved</span></div>`;
}

function searchMarkup(reports) {
  const recent = reports.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 6);
  return `
    <div class="page">
      <div class="shell">
        <div class="center" style="max-width:720px;margin:10px auto 0">
          <span class="eyebrow" style="justify-content:center">Track a report</span>
          <h1 class="display" style="margin:12px 0 12px">Where did your report get to?</h1>
          <p class="lede" style="margin-inline:auto">Enter the tracking ID you received. You'll see a plain-language timeline, the team that owns it, and any public updates.</p>
        </div>
        <div class="track-search">
          <form class="searchbar" id="track-form">
            <input class="input" id="track-input" placeholder="e.g. CP-1001" aria-label="Tracking ID" autocomplete="off">
            <button class="btn primary" type="submit">${icon('search', 15)} Track</button>
          </form>
          <div class="recent-chips">
            ${recent.map(r => `<a class="chip" href="#/track/${esc(r.id)}"><span class="mono">${esc(r.id)}</span><span class="muted">${esc(r.category)}</span></a>`).join('')}
          </div>
        </div>

        <div class="card pad" style="max-width:760px;margin:28px auto 0">
          <div class="card-title">No ID handy?</div>
          <p class="hint" style="margin-top:5px">This prototype keeps no accounts. Recent synthetic reports are listed below; in a real deployment a citizen would get a magic link by SMS.</p>
          <div class="latest-list" style="margin-top:10px">
            ${recent.map(r => `<a class="latest-item" href="#/track/${esc(r.id)}">
              <div>${categoryTag(r.category, { small: true })}</div>
              <div><p>${esc(r.summary)}</p><div class="meta"><span>${esc(r.area)}</span><span>·</span><span>${timeAgo(r.createdAt)}</span></div></div>
              <div>${statusPill(r.status, true)}</div>
            </a>`).join('')}
          </div>
        </div>
      </div>
    </div>`;
}

function reportMarkup(report, config) {
  const due = relativeDue(report.dueAt);
  const canonical = report.duplicateOf ? null : null;
  const publicUpdates = (report.comments || []).filter(c => !c.internal);
  const dupes = (report.ai?.duplicates || []).filter(d => d.decision === 'likely-duplicate').slice(0, 3);
  const team = config.teams.find(t => t.name === report.team);

  return `
    <div class="page">
      <div class="shell">
        <div class="row wrap" style="margin-bottom:16px;gap:8px">
          <a class="btn ghost small" href="#/track">${icon('arrow-left', 14)} All reports</a>
          <span class="mono tiny muted">${esc(report.id)}</span>
        </div>

        <div class="track-layout">
          <div class="stack">
            <div class="card track-head-card">
              <div class="row wrap" style="gap:8px">
                ${statusPill(report.status, true)}
                ${priorityPill(report.priority.level)}
                ${categoryTag(report.category)}
              </div>
              <h1 class="track-title">${esc(report.summary)}</h1>
              <div class="row wrap" style="gap:14px;font-size:12.5px;color:var(--muted)">
                <span class="row" style="gap:5px">${icon('pin', 13)} ${esc(report.area)}${report.location?.address ? ` · ${esc(report.location.address)}` : ''}</span>
                <span class="row" style="gap:5px">${icon('clock', 13)} ${fmtDateTime(report.createdAt)}</span>
                ${report.confirmations ? `<span class="row" style="gap:5px">${icon('users', 13)} ${report.confirmations} confirmations</span>` : ''}
              </div>
              ${report.photo ? `<img src="${esc(report.photo)}" alt="Photo attached to report ${esc(report.id)}" style="margin-top:16px;border-radius:12px;max-height:320px;object-fit:cover;width:100%">` : ''}
              <div class="divider" style="margin:18px 0 8px"></div>
              ${statusRail(report)}
              ${report.status === 'rejected' ? `<div class="card flat pad" style="margin-top:16px;background:var(--surface-2);padding:14px"><b style="font-size:13px">This report was closed</b><p class="hint" style="margin-top:3px">${esc(report.resolution || 'No reason recorded.')}</p></div>` : ''}
              ${report.status === 'resolved' ? `<div class="card flat pad" style="margin-top:16px;background:var(--green-soft);border-color:var(--mint);padding:14px"><b style="font-size:13px;color:var(--green)">${icon('check-circle', 14)} Resolved</b><p class="hint" style="margin-top:3px">${esc(report.resolution || 'Work completed.')}</p></div>` : ''}
              <div class="row wrap" style="gap:8px;margin-top:16px">
                <button class="btn small" id="confirm-btn">${icon('users', 14)} I'm also affected</button>
                <a class="btn small ghost" href="#/ops">${icon('map', 14)} See it on the ops map</a>
              </div>
            </div>

            <div class="card pad">
              <div class="card-title">Timeline</div>
              ${timelineMarkup(report)}
            </div>

            <div class="card pad">
              <div class="card-title">Public updates</div>
              ${publicUpdates.length ? `<div class="updates-list" style="margin-top:12px">
                ${publicUpdates.map(c => `<div class="update-item"><div class="meta"><b>${esc(c.author)}</b><span>${fmtDateTime(c.at)}</span></div><p>${esc(c.text)}</p></div>`).join('')}
              </div>` : `<p class="hint" style="margin-top:6px">No public updates yet. The team's internal notes stay internal; anything written for citizens appears here.</p>`}
            </div>
          </div>

          <aside class="stack">
            <div class="card pad">
              <div class="card-title">Ownership</div>
              <div class="stack" style="margin-top:12px;gap:10px">
                <div class="spread"><span class="hint">Team</span><b style="font-size:13px;text-align:right">${esc(report.team || 'Not assigned yet')}</b></div>
                <div class="spread"><span class="hint">Contact</span><b style="font-size:13px">${esc(report.assignee || '—')}</b></div>
                <div class="spread"><span class="hint">Response target</span><b style="font-size:13px">${report.priority.slaHours} hours</b></div>
                <div class="spread"><span class="hint">Deadline</span><b style="font-size:13px;color:${due.late ? 'var(--red)' : 'var(--ink)'}">${due.text}</b></div>
              </div>
              ${team ? `<p class="hint" style="margin-top:12px">${esc(team.name)} handles ${team.categories.length ? team.categories.join(', ').toLowerCase() : 'emergency escalations'}.</p>` : ''}
            </div>

            <div class="card" style="overflow:hidden">
              <div class="report-map" id="track-map" style="height:220px;border:0;border-radius:0"></div>
              <div class="pad" style="padding:14px 16px">
                <div class="tiny muted">Pinned location</div>
                <div class="mono tiny">${report.location.lat.toFixed(5)}, ${report.location.lng.toFixed(5)}</div>
              </div>
            </div>

            <div class="card pad">
              <div class="spread">
                <div class="card-title">How this was triaged</div>
                <span class="pill neutral">${report.ai?.models?.duplicates === 'bge-small-semantic-hybrid-v2' ? 'semantic' : 'lexical'}</span>
              </div>
              <div class="metric" style="display:flex;justify-content:space-between;padding:9px 0;border-bottom:1px dashed var(--line);font-size:12.5px"><span class="muted">Category</span><b>${esc(report.category)}</b></div>
              <div style="margin-top:10px">
                <div class="spread tiny"><span class="muted">Model confidence</span><b>${pct(report.ai?.categoryPrediction?.confidence || 0)}</b></div>
                ${scoreBar((report.ai?.categoryPrediction?.confidence || 0) * 100)}
              </div>
              <div style="margin-top:12px">
                <div class="spread tiny"><span class="muted">Priority score</span><b>${report.priority.score}/100</b></div>
                ${scoreBar(report.priority.score, report.priority.level === 'Critical' ? 'var(--red)' : 'var(--green-3)')}
                <p class="hint" style="margin-top:6px">${esc(report.priority.explanation)}</p>
              </div>
              ${report.duplicateOf ? `<div class="dup-mini" style="margin-top:14px"><div class="row"><b>Linked duplicate</b><span class="pill amber">${esc(report.duplicateOf)}</span></div><p>This report was merged into <a class="mono" href="#/track/${esc(report.duplicateOf)}" style="text-decoration:underline">${esc(report.duplicateOf)}</a>. The canonical report carries the queue position.</p></div>` : ''}
              ${dupes.length ? `<div style="margin-top:14px"><div class="label">AI duplicate suggestions</div>${dupes.map(d => `<div class="dup-mini"><div class="row"><b class="mono">${esc(d.id)}</b><span class="pill neutral">${Math.round(d.score * 100)}%</span></div><p>${esc(d.reason)}</p></div>`).join('')}<p class="hint" style="margin-top:6px">Staff confirm these links; the AI never merges on its own.</p></div>` : ''}
            </div>
          </aside>
        </div>
      </div>
    </div>`;
}

export function trackView(root, ctx) {
  let alive = true;
  let map = null;

  function bindConfirm(report) {
    const btn = $('#confirm-btn', root);
    if (!btn) return;
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        const res = await api.action(report.id, { action: 'confirm' });
        toast(`Thanks — ${res.report.confirmations} neighbours have now confirmed this.`, 'success');
        await ctx.reload();
      } catch (err) {
        toast(err.message, 'error');
        btn.disabled = false;
      }
    });
  }

  function paint(report) {
    if (!alive) return;
    root.innerHTML = reportMarkup(report, ctx.data.config);
    if (map) { try { map.remove(); } catch { /* noop */ } }
    const el = $('#track-map', root);
    if (el) {
      map = createMap(el, { center: [report.location.lat, report.location.lng], zoom: 15, interactive: false });
      reportMarker(report).addTo(map);
      setTimeout(() => map.invalidateSize(), 60);
    }
    bindConfirm(report);
    if (report.ai?.duplicates?.length) {
      // Keep the view lightweight: suggestions are already rendered server-side.
    }
  }

  if (!ctx.param) {
    root.innerHTML = searchMarkup(ctx.data.reports);
    $('#track-form', root).addEventListener('submit', (e) => {
      e.preventDefault();
      const id = $('#track-input', root).value.trim().toUpperCase();
      if (!id) return;
      ctx.navigate(`track/${id}`);
    });
    return () => { alive = false; };
  }

  const local = ctx.data.reports.find(r => r.id.toLowerCase() === ctx.param.toLowerCase());
  if (local) {
    paint(local);
  } else {
    root.innerHTML = `<div class="page"><div class="shell">${emptyState('Looking up that report…', ctx.param, 'search')}</div></div>`;
    api.report(ctx.param)
      .then(r => { if (alive) paint(r); })
      .catch(err => {
        if (!alive) return;
        root.innerHTML = `<div class="page"><div class="shell" style="max-width:640px">${emptyState('Report not found', `We could not find ${ctx.param}. Check the ID or open a recent report.`, 'search')}<div class="center" style="margin-top:16px"><a class="btn" href="#/track">Back to search</a></div></div></div>`;
        toast(err.message, 'error');
      });
  }

  return () => { alive = false; if (map) { try { map.remove(); } catch { /* noop */ } } };
}
