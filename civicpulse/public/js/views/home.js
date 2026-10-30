import { icon, esc, categoryIcon, priorityPill, timeAgo, pct, emptyState } from '../ui.js';
import { createMap, reportMarker, hotspotLayer } from '../map.js';

function sparkline(values, { width = 68, height = 30, stroke = '#0d5c4d' } = {}) {
  if (!values.length) return '';
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const pts = values.map((v, i) => {
    const x = (i / Math.max(1, values.length - 1)) * width;
    const y = height - ((v - min) / span) * (height - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return `<svg class="spark" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" aria-hidden="true"><polyline points="${pts.join(' ')}" fill="none" stroke="${stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

function heroFloat(insights) {
  const cluster = insights.clusters?.[0];
  if (!cluster) {
    return `<div><div class="tiny">No active hotspot</div><b>City looks quiet</b></div>${sparkline(insights.trends.days.map(d => d.total))}`;
  }
  return `<div>
      <div class="tiny">Top hotspot · ${esc(cluster.area)}</div>
      <b>${esc(cluster.hypothesis)}</b>
    </div>
    <div class="row" style="gap:12px">
      <span class="pill ${cluster.critical ? 'critical' : 'high'}">${cluster.count} open</span>
      ${sparkline(insights.trends.days.map(d => d.total))}
    </div>`;
}

export function homeView(root, ctx) {
  const { reports, insights, config } = ctx.data;
  const s = insights.stats;
  const open = reports.filter(r => !r.duplicateOf && ['new', 'review', 'assigned', 'in_progress'].includes(r.status));
  const emerging = insights.emerging || [];
  const cluster = insights.clusters?.[0];

  root.innerHTML = `
    <section class="hero">
      <div class="shell hero-inner">
        <div class="hero-copy">
          <span class="eyebrow">Civic intelligence, grounded</span>
          <h1 class="display">Scattered reports.<br><em>One clear next action.</em></h1>
          <p class="lede">Citizens report what they see. CivicPulse reads every message, finds the duplicates and the hotspots, and tells a stretched field team what to fix first — with the reasoning shown.</p>
          <div class="hero-actions">
            <a class="btn primary large" href="#/report">${icon('plus', 17)} Report an issue</a>
            <a class="btn large" href="#/ops">${icon('map', 17)} Open the ops desk</a>
          </div>
          <div class="hero-note">${icon('shield', 15)} AI runs locally on this machine. No report text is sent to a third party.</div>
        </div>
        <div class="hero-visual">
          <div class="hero-map-card">
            <div class="hero-tag"><span class="live-dot"></span> Synthetic live map</div>
            <div class="hero-map" id="home-map" aria-label="Map of open civic reports"></div>
            <div class="map-fade"></div>
            <div class="hero-float">${heroFloat(insights)}</div>
          </div>
        </div>
      </div>
    </section>

    <div class="shell">
      <div class="stat-strip" style="margin-top:-26px;position:relative;z-index:5">
        <div class="stat-cell">
          <div class="k">Open reports</div>
          <div class="v">${s.open}</div>
          <div class="d">${s.unassigned} waiting for a first review</div>
        </div>
        <div class="stat-cell">
          <div class="k">Critical now</div>
          <div class="v" style="color:var(--red)">${s.critical}</div>
          <div class="d">${s.high} high · 4-hour response target</div>
        </div>
        <div class="stat-cell">
          <div class="k">Hotspots detected</div>
          <div class="v">${s.hotspots}</div>
          <div class="d">3+ open reports within 220 m</div>
        </div>
        <div class="stat-cell">
          <div class="k">Duplicates merged</div>
          <div class="v">${s.duplicatesLinked}<small>/ ${s.duplicateGroups} groups</small></div>
          <div class="d">AI suggests · humans confirm</div>
        </div>
      </div>

      <section class="section">
        <div class="section-head">
          <div>
            <span class="eyebrow">How it works</span>
            <h2 class="display" style="margin-top:10px">From a 40-word complaint to a work order.</h2>
          </div>
          <a class="btn ghost" href="#/ai">See the model card ${icon('arrow-right', 15)}</a>
        </div>
        <div class="how-grid">
          <article class="card how-card">
            <div class="ico">${icon('camera', 19)}</div>
            <div class="num">01 · Capture</div>
            <h3>Report in under a minute</h3>
            <p>Text, a photo and a map pin. No account, no category quiz, no long form.</p>
          </article>
          <article class="card how-card">
            <div class="ico">${icon('sparkles', 19)}</div>
            <div class="num">02 · Understand</div>
            <h3>Classify, summarise, deduplicate</h3>
            <p>A hybrid classifier labels the issue. Sentence embeddings catch paraphrased duplicates. A rubric explains priority.</p>
          </article>
          <article class="card how-card">
            <div class="ico">${icon('layers', 19)}</div>
            <div class="num">03 · Reveal</div>
            <h3>Turn pins into patterns</h3>
            <p>DBSCAN finds spatial hotspots. The dashboard writes a brief with a hypothesis, evidence and unknowns.</p>
          </article>
          <article class="card how-card">
            <div class="ico">${icon('check-circle', 19)}</div>
            <div class="num">04 · Act</div>
            <h3>Assign, track, close the loop</h3>
            <p>Staff confirm links and assign teams. Citizens see a plain-language timeline, not an internal ticket state.</p>
          </article>
        </div>
      </section>

      <section class="section">
        <div class="split">
          <div class="card pad">
            <div class="spread" style="margin-bottom:6px">
              <div>
                <div class="card-title">Newest reports</div>
                <div class="hint">The last 48 hours, ranked by urgency.</div>
              </div>
              <a class="btn ghost small" href="#/ops">View queue ${icon('arrow-right', 14)}</a>
            </div>
            <div class="latest-list">
              ${emerging.length ? emerging.map(r => `
                <a class="latest-item" href="#/track/${esc(r.id)}">
                  ${categoryIcon(r.category)}
                  <div>
                    <p>${esc(r.summary || '')}</p>
                    <div class="meta"><span>${esc(r.area)}</span><span>·</span><span>${timeAgo(r.createdAt)}</span><span>·</span><span class="mono">${esc(r.id)}</span></div>
                  </div>
                  <div class="row" style="gap:6px">${priorityPill(r.priority)}${icon('chevron-right', 15)}</div>
                </a>`).join('') : emptyState('No recent reports', 'Submit one from the report page to see it here.', 'activity')}
            </div>
          </div>

          <aside class="card insight-teaser pad">
            <span class="eyebrow">This week's pattern</span>
            <h3>${cluster ? esc(cluster.hypothesis) : 'No hotspot right now'}</h3>
            <p>${cluster ? esc(cluster.brief.situation) : 'The city has no spatial cluster of three or more open reports at the moment.'}</p>
            ${cluster ? `<div class="mini-bars">${insights.trends.days.map((d, i) => `<i class="${i >= 10 ? 'hot' : ''}" style="height:${Math.max(8, Math.round((d.total / Math.max(1, ...insights.trends.days.map(x => x.total))) * 46))}px"></i>`).join('')}</div>
            <div class="row" style="gap:8px;flex-wrap:wrap">
              <span class="pill" style="background:rgba(191,227,212,.16);color:var(--mint)">${cluster.count} reports</span>
              <span class="pill" style="background:rgba(191,227,212,.16);color:var(--mint)">severity ${cluster.severity}/100</span>
              <span class="pill" style="background:rgba(191,227,212,.16);color:var(--mint)">${cluster.trend}</span>
            </div>
            <a href="#/insights">Read the full brief ${icon('arrow-right', 14)}</a>` : `<a href="#/insights">Open insights ${icon('arrow-right', 14)}</a>`}
          </aside>
        </div>
      </section>

      <section class="section">
        <div class="cta-band">
          <div>
            <span class="eyebrow" style="color:var(--mint)">Try the full journey</span>
            <h2 class="display" style="margin-top:10px">See something broken?<br>Tell us in under a minute.</h2>
            <p>Your report is triaged instantly, checked against nearby reports, and placed in a queue a human can actually work through.</p>
          </div>
          <a class="btn primary large" href="#/report">${icon('plus', 17)} Report an issue</a>
        </div>
      </section>
    </div>
  `;

  const map = createMap(document.getElementById('home-map'), { zoom: 13, interactive: true });
  const openForMap = open.slice(0, 60);
  openForMap.forEach(r => {
    reportMarker(r, { onClick: (rep) => ctx.navigate(`track/${rep.id}`) }).addTo(map);
  });
  (insights.clusters || []).slice(0, 5).forEach(c => hotspotLayer(c).addTo(map));
  setTimeout(() => map.invalidateSize(), 80);

  return () => { try { map.remove(); } catch { /* noop */ } };
}
