import { api } from '../api.js';
import {
  icon, esc, categoryTag, priorityPill, statusPill, timeAgo, fmtDateTime, pct,
  toast, emptyState, catMeta, openModal, $, $$, fmtHours,
} from '../ui.js';
import { createMap, reportMarker, hotspotLayer, mapLegend } from '../map.js';

function isOpen(report) {
  return !report.duplicateOf && ['new', 'review', 'assigned', 'in_progress'].includes(report.status);
}

function trendChart(trends, categories) {
  const days = trends.days || [];
  if (!days.length) return emptyState('No trend data', 'Reports will appear here once the queue has history.', 'activity');
  const width = 760;
  const height = 220;
  const left = 38;
  const right = 12;
  const top = 16;
  const bottom = 32;
  const plotW = width - left - right;
  const plotH = height - top - bottom;
  const max = Math.max(1, ...days.map(d => d.total));
  const step = plotW / days.length;
  const barW = Math.max(8, step * 0.62);

  const grid = [0, 0.25, 0.5, 0.75, 1].map(f => {
    const y = top + plotH - f * plotH;
    return `<line x1="${left}" y1="${y.toFixed(1)}" x2="${width - right}" y2="${y.toFixed(1)}" stroke="var(--line)" stroke-dasharray="2 4" />
      <text x="${left - 8}" y="${(y + 3).toFixed(1)}" text-anchor="end">${Math.round(f * max)}</text>`;
  }).join('');

  const bars = days.map((d, i) => {
    const x = left + i * step + (step - barW) / 2;
    let y = top + plotH;
    const segments = Object.entries(d.byCategory || {}).map(([category, count]) => {
      const h = (count / max) * plotH;
      y -= h;
      const color = catMeta(category).color;
      return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(1, h).toFixed(1)}" rx="2" fill="${color}" />`;
    }).join('');
    const label = i % 3 === 0 || i === days.length - 1
      ? `<text x="${(x + barW / 2).toFixed(1)}" y="${height - 10}" text-anchor="middle">${esc(d.label)}</text>`
      : '';
    const total = d.total > 0
      ? `<text x="${(x + barW / 2).toFixed(1)}" y="${(top + plotH - (d.total / max) * plotH - 6).toFixed(1)}" text-anchor="middle" style="fill:var(--ink-2);font-weight:700">${d.total}</text>`
      : '';
    return `${segments}${label}${total}`;
  }).join('');

  const legend = categories.map(c => `<span><i style="background:${catMeta(c.id).color}"></i>${esc(c.label)}</span>`).join('');
  return `
    <div class="chart-legend" style="margin-bottom:10px">${legend}</div>
    <svg class="bar-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Reports per day by category, last 14 days" style="height:auto">
      ${grid}${bars}
    </svg>`;
}

function hotspotCard(cluster, config) {
  const total = Math.max(1, cluster.categories.reduce((n, c) => n + c.count, 0));
  return `
    <article class="card hotspot-card" data-cluster="${esc(cluster.id)}">
      <div class="top">
        <div>
          <div class="tiny muted" style="display:flex;align-items:center;gap:5px">${icon('pin', 12)} ${esc(cluster.area)} · ${cluster.count} open</div>
          <h3>${esc(cluster.hypothesis)}</h3>
        </div>
        <div style="text-align:right;flex:none">
          <div class="sev-badge" style="color:${cluster.critical ? 'var(--red)' : 'var(--amber)'}">${cluster.severity}</div>
          <div class="tiny muted">severity / 100</div>
        </div>
      </div>
      <p>${esc(cluster.brief.situation)}</p>
      <div class="cat-bars" aria-label="Category mix">
        ${cluster.categories.map(c => `<i title="${esc(c.name)}: ${c.count}" style="width:${Math.max(3, (c.count / total) * 100)}%;background:${catMeta(c.name).color}"></i>`).join('')}
      </div>
      <div class="hotspot-meta">
        <span><b>${cluster.count}</b> reports</span>
        <span><b>${cluster.radiusMeters}</b> m radius</span>
        <span><b>${cluster.critical}</b> critical</span>
        <span class="trend-${cluster.trend === 'falling' ? 'down' : 'up'}">${esc(cluster.trend)}</span>
      </div>
      <div class="hotspot-actions">
        <button class="btn small primary" data-assign-cluster="${esc(cluster.id)}">${icon('users', 13)} Assign cluster</button>
        <a class="btn small" href="#/ops/cluster:${encodeURIComponent(cluster.id)}">${icon('list', 13)} Open queue</a>
        <a class="btn small ghost" href="#/ai">${icon('sparkles', 13)} How it works</a>
      </div>
    </article>`;
}

function duplicateGroupCard(group) {
  const canonical = group.reports.find(r => !r.duplicateOf) || group.reports[0];
  const linked = group.reports.filter(r => r.duplicateOf);
  const unlinked = group.reports.filter(r => !r.duplicateOf && r.id !== canonical.id);
  return `
    <article class="card pad">
      <div class="spread" style="align-items:flex-start;gap:12px">
        <div>
          <div class="card-title">${esc(canonical.area || 'Unassigned area')}</div>
          <div class="hint">Canonical report <span class="mono">${esc(canonical.id)}</span> · average pair score ${pct(group.avgScore)}</div>
        </div>
        <span class="pill ${group.confirmed ? 'green' : 'amber'}">${group.confirmed ? icon('check', 12) + ' linked' : icon('link', 12) + ' suggested'}</span>
      </div>
      <div class="reports" style="margin-top:12px;display:flex;flex-direction:column;gap:8px">
        ${group.reports.map(r => `
          <div style="display:flex;gap:9px;align-items:flex-start;padding:9px 10px;border:1px solid var(--line);border-radius:10px;background:var(--surface-2)">
            <span class="mono tiny muted" style="padding-top:2px;flex:none">${esc(r.id)}</span>
            <div class="grow" style="min-width:0">
              <div style="font-size:12.5px">${esc(r.summary)}</div>
              <div class="hint" style="margin-top:3px">${esc(r.category)} · ${priorityPill(r.priority)} ${r.duplicateOf ? `<span class="pill amber" style="height:20px;font-size:10px;margin-left:4px">duplicate of ${esc(r.duplicateOf)}</span>` : '<span class="pill neutral" style="height:20px;font-size:10px;margin-left:4px">canonical</span>'}</div>
            </div>
            <a class="btn small ghost" href="#/track/${encodeURIComponent(r.id)}" style="flex:none">View</a>
          </div>`).join('')}
      </div>
      <div class="row wrap" style="margin-top:12px;gap:7px">
        ${unlinked.map(r => `<button class="btn small primary" data-link-source="${esc(r.id)}" data-link-target="${esc(canonical.id)}">${icon('link', 12)} Link ${esc(r.id)} → ${esc(canonical.id)}</button>`).join('')}
        ${linked.map(r => `<button class="btn small" data-unlink="${esc(r.id)}">${icon('x', 12)} Unlink ${esc(r.id)}</button>`).join('')}
        ${!unlinked.length && !linked.length ? `<span class="hint">No action available.</span>` : ''}
      </div>
      <p class="hint" style="margin-top:8px">AI suggests; a staff member confirms. Linking keeps the canonical report's queue position and adds a confirmation to it.</p>
    </article>`;
}

export function insightsView(root, ctx) {
  const { reports, insights, config } = ctx.data;
  const s = insights.stats;
  const clusters = insights.clusters || [];
  const brief = insights.brief || {};
  const groups = insights.duplicateGroups || [];
  const candidates = insights.duplicateCandidates || [];
  const open = reports.filter(isOpen);

  const top = clusters[0];
  const briefTitle = top ? top.brief.headline : (brief.headline || 'The city, in one page');
  const briefSituation = top ? top.brief.situation : (brief.situation || 'No spatial hotspot is active right now. The queue below still shows what needs attention.');
  const briefEvidence = top ? top.brief.evidence : (brief.evidence || []);
  const briefAction = top ? top.brief.action : (brief.action || 'Keep reviewing the highest-priority reports.');
  const briefOwner = top ? top.recommendedTeam : (brief.owner || 'Operations');
  const briefConfidence = top ? top.brief.confidence : (brief.confidence || '—');
  const briefUnknowns = top ? top.brief.unknowns : (brief.unknowns || 'No cluster-level unknowns to report.');

  root.innerHTML = `
    <div class="page">
      <div class="shell">
        <div class="page-head">
          <div>
            <span class="eyebrow">Insights</span>
            <h1 class="display">The pattern behind the pins.</h1>
            <p class="lede">Hotspots, movement and duplicate clusters computed from the current queue. Every number below is reproducible from the synthetic dataset in this demo.</p>
          </div>
          <div class="row" style="gap:8px">
            <a class="btn small" href="/api/export.csv" download>${icon('download', 14)} Export data</a>
            <a class="btn small primary" href="#/ops">${icon('list', 14)} Open ops desk</a>
          </div>
        </div>

        <div class="stat-strip">
          <div class="stat-cell"><div class="k">Open reports</div><div class="v">${s.open}</div><div class="d">${s.unassigned} still unassigned</div></div>
          <div class="stat-cell"><div class="k">Critical now</div><div class="v" style="color:var(--red)">${s.critical}</div><div class="d">${s.overdue} overdue against SLA</div></div>
          <div class="stat-cell"><div class="k">Hotspots</div><div class="v">${s.hotspots}</div><div class="d">3+ open reports within 220 m</div></div>
          <div class="stat-cell"><div class="k">Duplicate groups</div><div class="v">${s.duplicateGroups}</div><div class="d">${s.duplicatesLinked} linked · human-confirmed</div></div>
        </div>

        <section class="section">
          <div class="brief-card">
            <div class="brief-grid">
              <div>
                <span class="eyebrow">Action brief · generated from cluster statistics</span>
                <h2>${esc(briefTitle)}</h2>
                <p>${esc(briefSituation)}</p>
                <ul class="brief-evidence">
                  ${briefEvidence.map(e => `<li>${esc(e)}</li>`).join('')}
                </ul>
                <div class="row wrap" style="margin-top:20px;gap:8px">
                  <span class="pill" style="background:rgba(191,227,212,.14);color:var(--mint)">${icon('clock', 12)} ${esc(briefConfidence)} confidence</span>
                  <span class="pill" style="background:rgba(191,227,212,.14);color:var(--mint)">${icon('layers', 12)} DBSCAN · eps 220 m</span>
                  <span class="pill" style="background:rgba(191,227,212,.14);color:var(--mint)">${icon('sparkles', 12)} template, no LLM</span>
                </div>
              </div>
              <aside class="brief-side">
                <div>
                  <div class="k">Suggested owner</div>
                  <div class="v">${esc(briefOwner)}</div>
                </div>
                <div>
                  <div class="k">Suggested first step</div>
                  <div class="v">${esc(top ? top.firstStep : 'Triage the highest-priority reports in the queue.')}</div>
                </div>
                <div class="action">
                  <div class="k">Action</div>
                  <div class="v">${esc(briefAction)}</div>
                </div>
                <div>
                  <div class="k">What we do not know</div>
                  <div class="v" style="color:rgba(244,241,233,.62)">${esc(briefUnknowns)}</div>
                </div>
                <a class="btn small" href="#/ops${top ? `/cluster:${encodeURIComponent(top.id)}` : ''}" style="align-self:flex-start;background:rgba(255,255,255,.08);border-color:rgba(255,255,255,.2);color:var(--paper)">${icon('arrow-right', 13)} Review this work</a>
              </aside>
            </div>
          </div>
        </section>

        <section class="section">
          <div class="section-head">
            <div>
              <span class="eyebrow">Where it is happening</span>
              <h2 class="display" style="margin-top:10px">Hotspots, ranked by severity.</h2>
              <p>DBSCAN groups open, non-duplicate reports within 220 m. Severity combines average priority, cluster size and critical count.</p>
            </div>
            <span class="pill neutral">${icon('activity', 12)} ${clusters.length} active</span>
          </div>

          <div class="card" style="padding:0;overflow:hidden;position:relative;margin-bottom:16px">
            <div id="insight-map" style="height:360px;background:#e8ece7" aria-label="Map of hotspots and open reports"></div>
            ${mapLegend()}
          </div>

          ${clusters.length ? `<div class="insight-grid">${clusters.map(c => hotspotCard(c, config)).join('')}</div>` : emptyState('No active hotspots', 'A hotspot needs at least three open, non-duplicate reports within 220 m.', 'map')}
        </section>

        <section class="section">
          <div class="split">
            <div class="card chart-card">
              <div class="spread" style="margin-bottom:6px">
                <div>
                  <div class="card-title">14-day report volume</div>
                  <div class="hint">Stacked by AI-assigned category. Hover a segment for its category.</div>
                </div>
                <div class="row" style="gap:6px">
                  <span class="pill ${insights.trends.delta >= 0 ? 'red' : 'green'}">${insights.trends.delta >= 0 ? '+' : ''}${insights.trends.delta} vs prior 7 days</span>
                </div>
              </div>
              ${trendChart(insights.trends, config.categories)}
            </div>

            <div class="card pad">
              <div class="card-title">Category movement</div>
              <div class="hint" style="margin-bottom:14px">Last 7 days compared with the 7 before.</div>
              <div class="stack" style="gap:11px">
                ${insights.trends.byCategory.map(c => {
                  const max = Math.max(1, ...insights.trends.byCategory.map(x => Math.max(x.last7, x.prev7)));
                  return `<div>
                    <div class="spread tiny" style="margin-bottom:4px">
                      <span style="font-weight:600">${esc(c.category)}</span>
                      <span class="muted">${c.last7} <span style="color:${c.delta > 0 ? 'var(--red)' : c.delta < 0 ? 'var(--green)' : 'var(--muted)'}">(${c.delta >= 0 ? '+' : ''}${c.delta})</span></span>
                    </div>
                    <div class="bench-bar" title="${esc(c.category)}: ${c.last7} this week, ${c.prev7} prior week"><i style="width:${(c.last7 / max) * 100}%;background:${catMeta(c.category).color}"></i></div>
                  </div>`;
                }).join('')}
              </div>
            </div>
          </div>
        </section>

        <section class="section">
          <div class="section-head">
            <div>
              <span class="eyebrow">Area watchlist</span>
              <h2 class="display" style="margin-top:10px">Where the queue is concentrating.</h2>
              <p>Areas are ordered by open volume, then average priority. A hotspot link means the area has a spatial cluster.</p>
            </div>
            <a class="btn ghost" href="#/ops">Open the full queue ${icon('arrow-right', 15)}</a>
          </div>
          <div class="card" style="padding:6px 10px 4px;overflow-x:auto">
            <table class="area-table">
              <thead><tr><th>Area</th><th class="num">Open</th><th class="num">Critical</th><th class="num">Avg score</th><th>Dominant issue</th><th>7-day trend</th><th></th></tr></thead>
              <tbody>
                ${insights.areas.slice(0, 14).map(a => `
                  <tr>
                    <td><b>${esc(a.area)}</b>${a.clusterId ? ` <span class="pill red" style="height:20px;font-size:10px;margin-left:4px">hotspot</span>` : ''}<div class="hint">${esc(a.zone || '')}</div></td>
                    <td class="num">${a.open}</td>
                    <td class="num" style="color:${a.critical ? 'var(--red)' : 'inherit'}">${a.critical}</td>
                    <td class="num">${a.avgScore}</td>
                    <td>${categoryTag(a.dominantCategory, { small: true })}</td>
                    <td><span class="trend-${a.trend === 'falling' ? 'down' : 'up'}">${esc(a.trend)}</span><div class="hint">${a.last7} this week</div></td>
                    <td style="text-align:right"><a class="btn small ghost" href="#/ops/area:${encodeURIComponent(a.area)}">Review ${icon('chevron-right', 12)}</a></td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>
        </section>

        <section class="section">
          <div class="section-head">
            <div>
              <span class="eyebrow">Duplicates</span>
              <h2 class="display" style="margin-top:10px">The same problem, reported twice.</h2>
              <p>Groups above the 0.78 semantic threshold. The AI proposes a link; staff confirm it. ${candidates.length} pair-level suggestions are available in the ops desk.</p>
            </div>
            <span class="pill neutral">${icon('link', 12)} ${groups.length} groups</span>
          </div>
          ${groups.length ? `<div class="insight-grid">${groups.map(duplicateGroupCard).join('')}</div>` : emptyState('No duplicate groups', 'The current queue has no pair above the duplicate threshold.', 'link')}
          <p class="hint" style="margin-top:14px">Scoring uses 60% text similarity, 22% distance, 10% category match and 8% time decay. The operating threshold is deliberately above the F1-optimal point to favour precision. <a href="#/ai" style="color:var(--green);font-weight:650">See the benchmark</a>.</p>
        </section>
      </div>
    </div>`;

  // Map: open reports plus hotspot rings.
  let map = null;
  const mapEl = $('#insight-map', root);
  if (mapEl) {
    map = createMap(mapEl, { zoom: 12, interactive: true });
    open.forEach(r => reportMarker(r, { onClick: (rep) => ctx.navigate(`track/${rep.id}`) }).addTo(map));
    clusters.forEach(c => hotspotLayer(c, {
      onClick: () => {
        const card = root.querySelector(`[data-cluster="${c.id}"]`);
        if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      },
    }).addTo(map));
    if (clusters[0]) {
      const members = clusters[0].reportIds
        .map(id => reports.find(r => r.id === id))
        .filter(Boolean)
        .map(r => [r.location.lat, r.location.lng]);
      if (members.length) map.fitBounds(L.latLngBounds(members).pad(0.9), { maxZoom: 14 });
    }
    setTimeout(() => map.invalidateSize(), 80);
  }

  // Assign a whole hotspot to a team.
  $$('[data-assign-cluster]', root).forEach(btn => {
    btn.addEventListener('click', () => {
      const cluster = clusters.find(c => c.id === btn.dataset.assignCluster);
      if (!cluster) return;
      const modal = openModal({
        title: `Assign ${cluster.area} hotspot`,
        body: `<p class="hint" style="margin-bottom:14px">This assigns all ${cluster.count} open, non-duplicate reports in the hotspot to one team. The AI suggested <b>${esc(cluster.recommendedTeam)}</b>.</p>
          <div class="field"><label for="insight-team">Team</label><select class="select" id="insight-team">
            ${config.teams.map(t => `<option value="${esc(t.id)}" ${t.name === cluster.recommendedTeam ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}
          </select></div>
          <p class="hint" style="margin-top:10px">Reports: <span class="mono">${cluster.reportIds.join(', ')}</span></p>`,
        footer: `<button class="btn ghost" data-close>Cancel</button><button class="btn primary" id="insight-assign-go">Assign cluster</button>`,
      });
      $('#insight-assign-go', modal.root).addEventListener('click', async () => {
        const teamId = $('#insight-team', modal.root).value;
        try {
          const res = await api.action(cluster.reportIds[0], {
            action: 'assignCluster', reportIds: cluster.reportIds, teamId, actor: 'Ops desk (demo)',
          });
          modal.close();
          toast(`${res.updated} reports assigned to the hotspot owner.`, 'success');
          await ctx.reload();
        } catch (err) { toast(err.message, 'error'); }
      });
    });
  });

  // Confirm or remove a duplicate link.
  $$('[data-link-source]', root).forEach(btn => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        await api.action(btn.dataset.linkSource, {
          action: 'linkDuplicate', targetId: btn.dataset.linkTarget, actor: 'Ops desk (demo)',
        });
        toast(`Linked ${btn.dataset.linkSource} to ${btn.dataset.linkTarget}.`, 'success');
        await ctx.reload();
      } catch (err) { toast(err.message, 'error'); btn.disabled = false; }
    });
  });
  $$('[data-unlink]', root).forEach(btn => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        await api.action(btn.dataset.unlink, { action: 'unlinkDuplicate', actor: 'Ops desk (demo)' });
        toast(`Removed the duplicate link on ${btn.dataset.unlink}.`, 'success');
        await ctx.reload();
      } catch (err) { toast(err.message, 'error'); btn.disabled = false; }
    });
  });

  return () => { if (map) { try { map.remove(); } catch { /* noop */ } } };
}
