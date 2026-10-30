import { api } from '../api.js';
import {
  icon, esc, categoryTag, priorityPill, statusPill, timeAgo, fmtDateTime, pct,
  scoreBar, toast, emptyState, relativeDue, openModal, debounce, catMeta, $, $$,
} from '../ui.js';
import { createMap, reportMarker, hotspotLayer, mapLegend } from '../map.js';

const viewState = {
  q: '',
  category: '',
  priority: '',
  status: '',
  area: '',
  clusterId: null,
  selectedId: null,
};
let pendingSelect = null;
let drawerApi = null;

function openReports(reports) {
  return reports.filter(r => !r.duplicateOf && ['new', 'review', 'assigned', 'in_progress'].includes(r.status));
}

function matchesFilters(r, filters, cluster) {
  if (filters.q) {
    const q = filters.q.toLowerCase();
    if (![r.id, r.summary, r.text, r.area, r.category, r.team, r.assignee].join(' ').toLowerCase().includes(q)) return false;
  }
  if (filters.category && r.category !== filters.category) return false;
  if (filters.priority && r.priority.level !== filters.priority) return false;
  if (filters.status && r.status !== filters.status) return false;
  if (filters.area && r.area !== filters.area) return false;
  if (filters.clusterId) {
    if (!cluster || !cluster.reportIds.includes(r.id)) return false;
  }
  return true;
}

function drawerMarkup(report, config) {
  const due = relativeDue(report.dueAt);
  const transitions = config.transitions?.[report.status] || [];
  const dupes = (report.ai?.duplicates || []).slice(0, 4);
  const history = (report.history || []).slice().reverse().slice(0, 8);
  const team = config.teams.find(t => t.name === report.team);
  return `
    <div class="drawer-head">
      <div class="grow">
        <div class="row wrap" style="gap:6px">
          <span class="mono tiny muted">${esc(report.id)}</span>
          ${statusPill(report.status)}
          ${priorityPill(report.priority.level)}
        </div>
        <h2>${esc(report.summary)}</h2>
        <div class="row wrap tiny muted" style="gap:10px">
          <span>${esc(report.area)}</span><span>·</span><span>${timeAgo(report.createdAt)}</span><span>·</span><span>${esc(report.category)}</span>
        </div>
      </div>
      <button class="icon-btn" id="drawer-close" aria-label="Close">${icon('x', 16)}</button>
    </div>
    <div class="drawer-body">
      <div class="row wrap" style="gap:6px">
        ${categoryTag(report.category)}
        <span class="pill neutral">${icon('clock', 12)} ${due.text}</span>
        <span class="pill neutral">${icon('users', 12)} ${report.confirmations || 0} confirmations</span>
        ${report.duplicateOf ? `<span class="pill amber">${icon('link', 12)} duplicate of ${esc(report.duplicateOf)}</span>` : ''}
      </div>

      ${report.photo ? `<img src="${esc(report.photo)}" alt="Report photo" style="width:100%;max-height:260px;object-fit:cover;border-radius:12px;border:1px solid var(--line)">` : ''}

      <div>
        <h4>Citizen description</h4>
        <p style="font-size:13.5px;background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:13px">${esc(report.text)}</p>
      </div>

      <div class="card flat pad" style="padding:14px;background:var(--surface)">
        <div class="spread" style="margin-bottom:8px">
          <h4 style="margin:0">AI triage</h4>
          <span class="pill neutral">${pct(report.ai?.categoryPrediction?.confidence || 0)} confidence</span>
        </div>
        <p style="font-size:12.5px;color:var(--ink-2)">${esc(report.priority.explanation)}</p>
        <div class="row" style="gap:10px;margin-top:10px;align-items:baseline">
          <span style="font-family:var(--display);font-size:1.9rem;line-height:1">${report.priority.score}</span>
          <span class="tiny muted">/100 priority score · ${report.priority.slaHours}h target</span>
        </div>
        ${scoreBar(report.priority.score, report.priority.level === 'Critical' ? 'var(--red)' : 'var(--green-3)')}
        <div class="divider" style="margin:12px 0"></div>
        <div class="spread tiny"><span class="muted">Predicted category</span><b>${esc(report.ai?.categoryPrediction?.label || report.category)}</b></div>
        <div class="spread tiny" style="margin-top:4px"><span class="muted">Suggested team</span><b>${esc(team?.name || report.team || '—')}</b></div>
        <div class="spread tiny" style="margin-top:4px"><span class="muted">Duplicate scoring</span><b>${esc(report.ai?.models?.duplicates || '—')}</b></div>
      </div>

      ${dupes.length ? `<div>
        <h4>Duplicate suggestions</h4>
        <div class="stack" style="gap:8px">
          ${dupes.map(d => `<div class="dup-mini" style="margin-top:0">
            <div class="row" style="justify-content:space-between">
              <b class="mono">${esc(d.id)}</b>
              <span class="pill ${d.decision === 'likely-duplicate' ? 'amber' : 'neutral'}">${Math.round(d.score * 100)}%</span>
            </div>
            <p>${esc(d.preview || '')}</p>
            <div class="hint" style="margin:4px 0 8px">${esc(d.reason)}</div>
            <div class="row" style="gap:6px">
              ${d.decision === 'likely-duplicate' ? `<button class="btn small primary" data-link="${esc(d.id)}">${icon('link', 13)} Confirm duplicate</button>` : ''}
              <button class="btn small" data-compare="${esc(d.id)}">${icon('scale', 13)} Compare</button>
            </div>
          </div>`).join('')}
        </div>
        <p class="hint" style="margin-top:7px">Linking keeps the canonical report's queue position and adds a confirmation to it.</p>
      </div>` : `<p class="hint">No duplicate suggestions above the related threshold.</p>`}

      <div>
        <h4>Priority factors</h4>
        <div>
          ${report.priority.factors.map(f => `<div class="factor-row ${f.points < 0 ? 'neg' : ''}">
            <div class="lbl">${esc(f.label)}<small>${esc(f.detail)}</small></div>
            <b style="color:${f.points < 0 ? 'var(--red)' : 'var(--green)'}">${f.points > 0 ? '+' : ''}${f.points}</b>
            <div class="bar"><i style="width:${Math.min(100, Math.abs(f.points) * 3)}%"></i></div>
          </div>`).join('')}
        </div>
      </div>

      <div>
        <h4>Dispatch actions</h4>
        <div class="field" style="margin-bottom:10px">
          <label for="op-note">Note / resolution text</label>
          <textarea class="textarea" id="op-note" style="min-height:70px" placeholder="Required to resolve or close. Shown to citizens when public."></textarea>
        </div>
        <div class="row wrap" style="gap:6px;margin-bottom:12px">
          ${transitions.length ? transitions.map(t => {
            const label = { review: 'Move to review', assigned: 'Assign', in_progress: 'Start work', resolved: 'Mark resolved', rejected: 'Close report', new: 'Reopen as new' }[t] || t;
            const primary = t === 'resolved' || t === 'assigned';
            return `<button class="btn small ${primary ? 'primary' : t === 'rejected' ? 'danger' : ''}" data-status="${esc(t)}">${esc(label)}</button>`;
          }).join('') : `<span class="hint">No status transitions available.</span>`}
          ${report.duplicateOf ? `<button class="btn small" data-unlink>${icon('x', 13)} Unlink duplicate</button>` : ''}
        </div>
        <div class="action-grid">
          <div class="field">
            <label for="op-team">Assign to team</label>
            <select class="select" id="op-team">
              ${config.teams.map(t => `<option value="${esc(t.id)}" ${t.name === report.team ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}
            </select>
            <button class="btn small" id="op-assign">${icon('send', 13)} Assign</button>
          </div>
          <div class="field">
            <label for="op-category">Override category</label>
            <select class="select" id="op-category">
              ${config.categories.map(c => `<option value="${esc(c.id)}" ${c.id === report.category ? 'selected' : ''}>${esc(c.label)}</option>`).join('')}
            </select>
            <button class="btn small" id="op-set-category">${icon('check', 13)} Apply</button>
          </div>
        </div>
      </div>

      <div>
        <h4>Add an update</h4>
        <div class="field">
          <textarea class="textarea" id="op-comment" style="min-height:64px" placeholder="Short update for the field team or the citizen…"></textarea>
          <div class="spread">
            <label class="checkline"><input type="checkbox" id="op-internal" checked> Internal note only</label>
            <button class="btn small" id="op-comment-btn">${icon('send', 13)} Post</button>
          </div>
        </div>
      </div>

      <div>
        <h4>History</h4>
        <div class="stack" style="gap:7px">
          ${history.map(h => `<div class="update-item" style="padding:9px 11px"><div class="meta"><b>${esc(h.actor || 'System')}</b><span>${fmtDateTime(h.at)}</span></div><p style="font-size:12px">${esc(h.text || '')}</p></div>`).join('')}
        </div>
      </div>
    </div>`;
}

function compareBody(c) {
  return `
    <div class="compare-head" style="margin-bottom:14px">
      <div class="compare-box"><div class="label">${esc(c.a.id)}</div><div class="score">${c.a.score}</div><div>${priorityPill(c.a.level)}</div></div>
      <div class="compare-box"><div class="label">${esc(c.b.id)}</div><div class="score">${c.b.score}</div><div>${priorityPill(c.b.level)}</div></div>
    </div>
    <p style="font-size:13px;margin-bottom:14px">${esc(c.verdict)}</p>
    <table class="compare-table">
      <thead><tr><th>Factor</th><th style="text-align:right">${esc(c.a.id)}</th><th style="text-align:right">${esc(c.b.id)}</th></tr></thead>
      <tbody>
        ${c.rows.map(r => `<tr><td>${esc(r.label)}</td><td class="num">${r.a > 0 ? '+' : ''}${r.a}</td><td class="num">${r.b > 0 ? '+' : ''}${r.b}</td></tr>`).join('')}
      </tbody>
    </table>`;
}

export function opsView(root, ctx) {
  const { reports, insights, config } = ctx.data;
  // Deep links from Insights: #/ops/cluster:<id>, #/ops/area:<name>, #/ops/report:<id>
  if (ctx.param) {
    if (ctx.param.startsWith('cluster:')) viewState.clusterId = ctx.param.slice(8);
    else if (ctx.param.startsWith('area:')) { viewState.area = ctx.param.slice(5); viewState.clusterId = null; }
    else if (ctx.param.startsWith('report:')) pendingSelect = ctx.param.slice(7);
  }
  const allOpen = openReports(reports);
  const areas = [...new Set(allOpen.map(r => r.area))].sort();
  const clusters = insights.clusters || [];
  const cluster = viewState.clusterId ? clusters.find(c => c.id === viewState.clusterId) : null;
  const s = insights.stats;
  const filters = viewState;

  const filtered = allOpen
    .filter(r => matchesFilters(r, filters, cluster))
    .sort((a, b) => b.priority.score - a.priority.score || new Date(b.createdAt) - new Date(a.createdAt));

  root.innerHTML = `
    <div class="page">
      <div class="shell">
        <div class="page-head">
          <div>
            <span class="eyebrow">Operations desk</span>
            <h1 class="display">The queue, with the reasoning attached.</h1>
            <p class="lede">Review AI triage, confirm duplicates, assign teams and close the loop. Every automated suggestion is a proposal, not a decision.</p>
          </div>
          <div class="row" style="gap:8px">
            <a class="btn small" href="/api/export.csv" download>${icon('download', 14)} Export</a>
            <button class="btn small primary" id="surge-btn">${icon('zap', 14)} Simulate surge</button>
          </div>
        </div>

        <div class="ops-stats">
          <div class="ops-stat"><div class="k">Open</div><div class="v">${s.open}</div></div>
          <div class="ops-stat alert"><div class="k">Critical</div><div class="v">${s.critical}</div></div>
          <div class="ops-stat"><div class="k">Unassigned</div><div class="v">${s.unassigned}</div></div>
          <div class="ops-stat"><div class="k">Overdue</div><div class="v" style="color:${s.overdue ? 'var(--amber)' : 'inherit'}">${s.overdue}</div></div>
          <div class="ops-stat"><div class="k">Hotspots</div><div class="v">${s.hotspots}</div></div>
        </div>

        <div class="toolbar">
          <div class="search">
            ${icon('search', 16)}
            <input class="input" id="ops-search" placeholder="Search ID, text, area, team…" value="${esc(filters.q)}" aria-label="Search reports">
          </div>
          <select class="select" id="f-category" aria-label="Category" style="width:auto">
            <option value="">All categories</option>
            ${config.categories.map(c => `<option value="${esc(c.id)}" ${filters.category === c.id ? 'selected' : ''}>${esc(c.label)}</option>`).join('')}
          </select>
          <select class="select" id="f-priority" aria-label="Priority" style="width:auto">
            <option value="">All priorities</option>
            ${['Critical', 'High', 'Medium', 'Low'].map(p => `<option value="${p}" ${filters.priority === p ? 'selected' : ''}>${p}</option>`).join('')}
          </select>
          <select class="select" id="f-status" aria-label="Status" style="width:auto">
            <option value="">All open statuses</option>
            ${['new', 'review', 'assigned', 'in_progress'].map(st => `<option value="${st}" ${filters.status === st ? 'selected' : ''}>${esc(config.statuses.find(x => x.id === st)?.label || st)}</option>`).join('')}
          </select>
          <select class="select" id="f-area" aria-label="Area" style="width:auto">
            <option value="">All areas</option>
            ${areas.map(a => `<option value="${esc(a)}" ${filters.area === a ? 'selected' : ''}>${esc(a)}</option>`).join('')}
          </select>
          <button class="btn ghost small" id="f-reset">${icon('refresh', 14)} Reset</button>
          <span class="hint" id="f-count" style="margin-left:auto">${filtered.length} of ${allOpen.length} reports</span>
        </div>

        ${clusters.length ? `<div class="cluster-strip">
          ${clusters.slice(0, 9).map(c => `<button class="cluster-chip ${filters.clusterId === c.id ? 'active' : ''}" data-cluster="${esc(c.id)}" style="${filters.clusterId === c.id ? 'border-color:var(--green);background:var(--green-soft)' : ''}">
            <span class="sev" style="background:${c.critical ? 'var(--red)' : 'var(--amber)'}"></span>
            <b>${esc(c.area)}</b><span class="muted">${c.count} · sev ${c.severity}</span>
          </button>`).join('')}
        </div>` : ''}

        ${cluster ? `<div class="card pad" style="margin-bottom:12px;border-color:var(--mint);background:var(--green-soft)">
          <div class="spread" style="gap:14px;align-items:flex-start">
            <div>
              <div class="row" style="gap:8px"><b style="font-size:13.5px">${esc(cluster.area)}: ${esc(cluster.hypothesis)}</b><span class="pill ${cluster.critical ? 'critical' : 'high'}">severity ${cluster.severity}</span></div>
              <p class="hint" style="margin-top:4px">${esc(cluster.brief.situation)}</p>
              <p class="hint" style="margin-top:4px"><b>Suggested first step:</b> ${esc(cluster.firstStep)}</p>
            </div>
            <div class="row" style="gap:6px">
              <button class="btn small" id="assign-cluster">${icon('users', 13)} Assign cluster</button>
              <a class="btn small ghost" href="#/insights">${icon('arrow-right', 13)} Brief</a>
            </div>
          </div>
        </div>` : ''}

        <div class="ops-grid">
          <div class="map-panel">
            <div class="card" style="overflow:hidden;position:relative">
              <div class="ops-map" id="ops-map"></div>
              ${mapLegend()}
            </div>
            <p class="hint" style="margin-top:8px">${icon('info', 12)} Circles are DBSCAN hotspots (3+ open reports within 220 m). Pins are open, non-duplicate reports.</p>
          </div>
          <div class="queue-panel" id="queue"></div>
        </div>
      </div>
    </div>

    <div class="drawer-backdrop" id="drawer-backdrop"></div>
    <aside class="drawer" id="drawer" aria-label="Report detail"></aside>
  `;

  const queueEl = $('#queue', root);
  const drawerEl = $('#drawer', root);
  const backdrop = $('#drawer-backdrop', root);

  const map = createMap($('#ops-map', root), { zoom: 13, interactive: true });
  const markerGroup = L.layerGroup().addTo(map);
  const hotspotGroup = L.layerGroup().addTo(map);

  function renderQueue() {
    const list = allOpen
      .filter(r => matchesFilters(r, filters, cluster))
      .sort((a, b) => b.priority.score - a.priority.score || new Date(b.createdAt) - new Date(a.createdAt));
    $('#f-count', root).textContent = `${list.length} of ${allOpen.length} reports`;
    if (!list.length) {
      queueEl.innerHTML = emptyState('No reports match', 'Try clearing a filter or searching a different term.', 'filter');
      return;
    }
    queueEl.innerHTML = list.map(r => {
      const due = relativeDue(r.dueAt);
      return `<article class="queue-card ${viewState.selectedId === r.id ? 'selected' : ''}" data-report="${esc(r.id)}" tabindex="0" role="button" aria-label="Open ${esc(r.id)}">
        <div class="queue-bar ${esc(r.priority.level)}"></div>
        <div class="queue-body">
          <div class="top">
            <span class="id">${esc(r.id)}</span>
            ${priorityPill(r.priority.level)}
            <span class="pill" style="background:${catMeta(r.category).soft};color:${catMeta(r.category).color};height:22px;padding:0 8px;font-size:10.5px">${esc(r.category)}</span>
            ${r.duplicateOf ? `<span class="pill neutral" style="height:22px;font-size:10.5px">merged</span>` : ''}
          </div>
          <p>${esc(r.summary)}</p>
          <div class="meta">
            <span>${icon('pin', 11)} ${esc(r.area)}</span>
            <span>${statusPill(r.status)}</span>
            <span style="color:${due.late ? 'var(--red)' : 'inherit'}">${due.text}</span>
            ${r.assignee ? `<span>${esc(r.assignee)}</span>` : ''}
          </div>
        </div>
        <div class="queue-score"><b>${r.priority.score}</b><span>score</span></div>
      </article>`;
    }).join('');
    $$('.queue-card', queueEl).forEach(card => {
      const open = () => openReport(card.dataset.report);
      card.addEventListener('click', open);
      card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
    });
  }

  function renderMap() {
    markerGroup.clearLayers();
    hotspotGroup.clearLayers();
    const list = allOpen.filter(r => matchesFilters(r, filters, cluster));
    list.forEach(r => {
      reportMarker(r, { selected: viewState.selectedId === r.id, onClick: (rep) => openReport(rep.id) }).addTo(markerGroup);
    });
    clusters.filter(c => !filters.clusterId || c.id === filters.clusterId).forEach(c => {
      hotspotLayer(c, { onClick: () => { viewState.clusterId = c.id; syncClusterChips(); renderQueue(); renderMap(); renderClusterBanner(); } }).addTo(hotspotGroup);
    });
    if (filters.clusterId && cluster) {
      map.fitBounds(L.latLngBounds(cluster.reportIds.map(id => {
        const r = reports.find(x => x.id === id);
        return r ? [r.location.lat, r.location.lng] : null;
      }).filter(Boolean)).pad(0.25), { maxZoom: 15 });
    }
  }

  function syncClusterChips() {
    $$('.cluster-chip', root).forEach(chip => {
      const active = chip.dataset.cluster === viewState.clusterId;
      chip.style.borderColor = active ? 'var(--green)' : '';
      chip.style.background = active ? 'var(--green-soft)' : '';
    });
  }

  function renderClusterBanner() {
    // Banner is rendered server-side; a full reload is used when it changes.
  }

  function openReport(id) {
    const report = reports.find(r => r.id === id);
    if (!report) return;
    viewState.selectedId = id;
    drawerEl.innerHTML = drawerMarkup(report, config);
    drawerEl.classList.add('open');
    backdrop.classList.add('open');
    document.body.classList.add('no-scroll');
    $('#drawer-close', drawerEl)?.addEventListener('click', closeDrawer);
    bindDrawerActions(report);
    $$('.queue-card', queueEl).forEach(c => c.classList.toggle('selected', c.dataset.report === id));
    renderMap();
  }

  function closeDrawer() {
    drawerEl.classList.remove('open');
    backdrop.classList.remove('open');
    document.body.classList.remove('no-scroll');
    viewState.selectedId = null;
    $$('.queue-card', queueEl).forEach(c => c.classList.remove('selected'));
  }

  async function act(report, body, successMessage) {
    try {
      await api.action(report.id, { actor: 'Ops desk (demo)', ...body });
      toast(successMessage, 'success');
      pendingSelect = report.id;
      await ctx.reload();
    } catch (err) { toast(err.message, 'error'); }
  }

  function bindDrawerActions(report) {
    const note = () => $('#op-note', drawerEl)?.value.trim() || '';
    $$('[data-status]', drawerEl).forEach(btn => {
      btn.addEventListener('click', () => {
        const to = btn.dataset.status;
        if ((to === 'resolved' || to === 'rejected') && !note()) {
          toast('Add a short note before resolving or closing.', 'error');
          $('#op-note', drawerEl)?.focus();
          return;
        }
        act(report, { action: 'status', to, note: note() }, `Status moved to ${to.replace('_', ' ')}.`);
      });
    });
    $('#op-assign', drawerEl)?.addEventListener('click', () => {
      const teamId = $('#op-team', drawerEl).value;
      act(report, { action: 'assign', teamId }, 'Report assigned.');
    });
    $('#op-set-category', drawerEl)?.addEventListener('click', () => {
      const category = $('#op-category', drawerEl).value;
      if (category === report.category) { toast('That is already the category.'); return; }
      act(report, { action: 'category', category, note: note() }, `Category overridden to ${category}.`);
    });
    $('#op-comment-btn', drawerEl)?.addEventListener('click', () => {
      const text = $('#op-comment', drawerEl).value.trim();
      if (text.length < 2) { toast('Write a short update first.', 'error'); return; }
      act(report, { action: 'comment', text, internal: $('#op-internal', drawerEl).checked }, 'Update posted.');
    });
    $$('[data-link]', drawerEl).forEach(btn => {
      btn.addEventListener('click', () => {
        const target = btn.dataset.link;
        act(report, { action: 'linkDuplicate', targetId: target }, `Linked to ${target}. The canonical report keeps the queue position.`);
      });
    });
    $$('[data-compare]', drawerEl).forEach(btn => {
      btn.addEventListener('click', async () => {
        try {
          const c = await api.compare(report.id, btn.dataset.compare);
          openModal({ title: 'Compare priority', body: compareBody(c), wide: true });
        } catch (err) { toast(err.message, 'error'); }
      });
    });
    $('[data-unlink]', drawerEl)?.addEventListener('click', () => {
      act(report, { action: 'unlinkDuplicate' }, 'Duplicate link removed.');
    });
  }

  // Toolbar wiring.
  $('#ops-search', root).addEventListener('input', debounce((e) => {
    filters.q = e.target.value.trim();
    renderQueue();
    renderMap();
  }, 180));
  $('#f-category', root).addEventListener('change', (e) => { filters.category = e.target.value; renderQueue(); renderMap(); });
  $('#f-priority', root).addEventListener('change', (e) => { filters.priority = e.target.value; renderQueue(); renderMap(); });
  $('#f-status', root).addEventListener('change', (e) => { filters.status = e.target.value; renderQueue(); renderMap(); });
  $('#f-area', root).addEventListener('change', (e) => { filters.area = e.target.value; renderQueue(); renderMap(); });
  $('#f-reset', root).addEventListener('click', () => {
    Object.assign(filters, { q: '', category: '', priority: '', status: '', area: '', clusterId: null });
    $('#ops-search', root).value = '';
    ['f-category', 'f-priority', 'f-status', 'f-area'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    syncClusterChips();
    renderQueue();
    renderMap();
    ctx.reload();
  });
  $$('.cluster-chip', root).forEach(chip => {
    chip.addEventListener('click', () => {
      viewState.clusterId = viewState.clusterId === chip.dataset.cluster ? null : chip.dataset.cluster;
      pendingSelect = null;
      ctx.reload();
    });
  });
  backdrop.addEventListener('click', closeDrawer);
  const escHandler = (e) => { if (e.key === 'Escape') closeDrawer(); };
  document.addEventListener('keydown', escHandler);

  $('#assign-cluster', root)?.addEventListener('click', () => {
    if (!cluster) return;
    const modal = openModal({
      title: `Assign ${cluster.area} cluster`,
      body: `<p class="hint" style="margin-bottom:14px">This assigns all ${cluster.count} open, non-duplicate reports in the hotspot to one team. The AI suggested ${esc(cluster.recommendedTeam)}.</p>
        <div class="field"><label for="cluster-team">Team</label><select class="select" id="cluster-team">
          ${config.teams.map(t => `<option value="${esc(t.id)}" ${t.name === cluster.recommendedTeam ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}
        </select></div>
        <p class="hint" style="margin-top:10px">Reports: <span class="mono">${cluster.reportIds.join(', ')}</span></p>`,
      footer: `<button class="btn ghost" data-close>Cancel</button><button class="btn primary" id="cluster-assign-go">Assign cluster</button>`,
    });
    $('#cluster-assign-go', modal.root).addEventListener('click', async () => {
      const teamId = $('#cluster-team', modal.root).value;
      try {
        const res = await api.action(cluster.reportIds[0], {
          action: 'assignCluster', reportIds: cluster.reportIds, teamId, actor: 'Ops desk (demo)',
        });
        modal.close();
        toast(`${res.updated} reports assigned to the cluster owner.`, 'success');
        pendingSelect = null;
        await ctx.reload();
      } catch (err) { toast(err.message, 'error'); }
    });
  });

  $('#surge-btn', root)?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      const res = await api.surge();
      toast(`${res.created.length} surge reports added — watch the Ejipura hotspot grow.`, 'success');
      pendingSelect = null;
      await ctx.reload();
    } catch (err) { toast(err.message, 'error'); btn.disabled = false; }
  });

  renderQueue();
  renderMap();
  setTimeout(() => map.invalidateSize(), 80);

  if (pendingSelect) {
    const id = pendingSelect;
    pendingSelect = null;
    setTimeout(() => openReport(id), 60);
  } else if (viewState.selectedId) {
    const id = viewState.selectedId;
    setTimeout(() => openReport(id), 60);
  }

  return () => {
    document.removeEventListener('keydown', escHandler);
    document.body.classList.remove('no-scroll');
    try { map.remove(); } catch { /* noop */ }
    if (drawerApi) { drawerApi = null; }
  };
}
