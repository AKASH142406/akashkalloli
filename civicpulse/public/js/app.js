import { api } from './api.js';
import { icon, toast, openModal, esc, $ } from './ui.js';
import { homeView } from './views/home.js';
import { reportView } from './views/report.js';
import { trackView } from './views/track.js';
import { opsView } from './views/ops.js';
import { insightsView } from './views/insights.js';
import { aiView } from './views/ai.js';

const ROUTES = {
  home: homeView,
  report: reportView,
  track: trackView,
  ops: opsView,
  insights: insightsView,
  ai: aiView,
};

const state = {
  data: null,
  route: { name: 'home', param: null },
  busy: false,
};

let cleanup = null;
let booted = false;

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [name, param] = raw.split('/');
  return { name: ROUTES[name] ? name : 'home', param: param ? decodeURIComponent(param) : null };
}

function navMarkup(active) {
  const items = [
    ['home', 'Home'],
    ['report', 'Report'],
    ['track', 'Track'],
    ['ops', 'Ops desk'],
    ['insights', 'Insights'],
    ['ai', 'AI & limits'],
  ];
  return items.map(([name, label]) => `<a href="#/${name === 'home' ? '' : name}" class="${active === name ? 'active' : ''}">${label}</a>`).join('');
}

function shellMarkup(active) {
  return `
    <div class="app-shell">
      <header class="topbar">
        <div class="shell topbar-inner">
          <a class="brand" href="#/" aria-label="CivicPulse home">
            <span class="brand-mark">${icon('pulse', 21)}</span>
            <span><b>CivicPulse</b><small>Reports → action</small></span>
          </a>
          <nav class="nav" id="nav">${navMarkup(active)}</nav>
          <div class="nav-actions">
            <span class="demo-pill" title="All data is synthetic">Synthetic demo</span>
            <button class="btn ghost small" id="demo-controls">${icon('play', 14)} Demo</button>
            <a class="btn primary small" href="#/report">${icon('plus', 15)} Report issue</a>
            <button class="icon-btn nav-toggle" id="nav-toggle" aria-label="Menu" aria-expanded="false">${icon('menu', 18)}</button>
          </div>
        </div>
      </header>
      <main id="main" tabindex="-1"></main>
      <footer class="site-footer">
        <div class="shell footer-inner">
          <div><b>CivicPulse</b> · an 8-hour hackathon prototype. Synthetic data only. Not an official municipal service.</div>
          <div class="footer-links">
            <a href="#/ai">How the AI works</a>
            <a href="#/ai">Limitations</a>
            <a href="/api/export.csv">Download CSV</a>
            <a href="/api/health" target="_blank" rel="noopener">API health</a>
          </div>
        </div>
      </footer>
    </div>`;
}

function setActiveNav(name) {
  const nav = $('#nav');
  if (!nav) return;
  nav.innerHTML = navMarkup(name);
  nav.classList.remove('open');
}

function renderRoute({ restoreScroll = true } = {}) {
  const y = window.scrollY;
  const view = ROUTES[state.route.name] || homeView;
  if (typeof cleanup === 'function') { try { cleanup(); } catch { /* noop */ } cleanup = null; }
  const main = $('#main');
  if (!main) return;
  main.innerHTML = '';
  const ctx = {
    state,
    data: state.data,
    param: state.route.param,
    navigate: (path) => { location.hash = path.startsWith('#') ? path : `#/${path}`; },
    reload: () => refresh({ restoreScroll: true }),
    setBusy: (v) => { state.busy = v; },
  };
  try {
    cleanup = view(main, ctx) || null;
  } catch (err) {
    console.error(err);
    main.innerHTML = `<div class="shell page"><div class="empty"><div class="ico">${icon('alert', 22)}</div><b>Something went wrong</b><span>${esc(err.message)}</span><br><br><button class="btn" onclick="location.reload()">Reload</button></div></div>`;
  }
  setActiveNav(state.route.name);
  if (restoreScroll) window.scrollTo({ top: y, behavior: 'instant' });
}

export async function refresh({ restoreScroll = true, silent = false } = {}) {
  if (!silent) document.body.classList.add('is-loading');
  try {
    state.data = await api.bootstrap();
    if (!booted) {
      document.getElementById('app').innerHTML = shellMarkup(state.route.name);
      booted = true;
      bindChrome();
    }
    renderRoute({ restoreScroll });
  } catch (err) {
    console.error(err);
    const app = document.getElementById('app');
    if (!booted) {
      app.innerHTML = `<div class="shell page"><div class="empty"><div class="ico">${icon('alert', 22)}</div><b>CivicPulse could not start</b><span>${esc(err.message)}</span><br><br><button class="btn" onclick="location.reload()">Try again</button></div></div>`;
    } else {
      toast(err.message, 'error');
    }
  } finally {
    document.body.classList.remove('is-loading');
  }
}

function bindChrome() {
  const toggle = $('#nav-toggle');
  if (toggle) {
    toggle.addEventListener('click', () => {
      const nav = $('#nav');
      const open = nav.classList.toggle('open');
      toggle.setAttribute('aria-expanded', String(open));
    });
  }
  const demo = $('#demo-controls');
  if (demo) demo.addEventListener('click', openDemoControls);
  document.querySelectorAll('.nav a').forEach(a => a.addEventListener('click', () => $('#nav')?.classList.remove('open')));
}

function openDemoControls() {
  const modal = openModal({
    title: 'Demo controls',
    body: `
      <p class="muted" style="font-size:13px;margin-bottom:16px">This prototype runs on a synthetic dataset. Nothing here is a real municipal record.</p>
      <div class="stack">
        <div class="card flat pad" style="padding:14px">
          <div class="spread"><div><b style="font-size:13.5px">Simulate a monsoon surge</b><div class="hint">Adds 8 fresh reports around Ejipura so the hotspot and duplicate logic visibly react.</div></div><button class="btn small" id="do-surge">${icon('zap', 14)} Surge</button></div>
        </div>
        <div class="card flat pad" style="padding:14px">
          <div class="spread"><div><b style="font-size:13.5px">Reset the demo</b><div class="hint">Restores the original 63 synthetic reports and clears any actions you took.</div></div><button class="btn small danger" id="do-reset">${icon('refresh', 14)} Reset</button></div>
        </div>
        <div class="card flat pad" style="padding:14px">
          <div class="spread"><div><b style="font-size:13.5px">Export the queue</b><div class="hint">Every report with priority, team, location and status as CSV.</div></div><a class="btn small" href="/api/export.csv" download>${icon('download', 14)} CSV</a></div>
        </div>
      </div>`,
  });
  $('#do-surge', modal.root)?.addEventListener('click', async (e) => {
    e.target.closest('button').disabled = true;
    try {
      const res = await api.surge();
      modal.close();
      toast(`${res.created.length} surge reports added`, 'success');
      await refresh({ restoreScroll: false });
    } catch (err) { toast(err.message, 'error'); }
  });
  $('#do-reset', modal.root)?.addEventListener('click', async (e) => {
    const btn = e.target.closest('button');
    btn.disabled = true;
    try {
      await api.reset();
      modal.close();
      toast('Demo reset to the synthetic seed', 'success');
      location.hash = '#/';
      await refresh({ restoreScroll: false });
    } catch (err) { toast(err.message, 'error'); btn.disabled = false; }
  });
}

function onRouteChange() {
  const next = parseHash();
  const changed = next.name !== state.route.name || next.param !== state.route.param;
  state.route = next;
  if (!booted) return;
  if (changed) renderRoute({ restoreScroll: false });
  else setActiveNav(next.name);
  window.scrollTo({ top: 0, behavior: 'instant' });
}

window.addEventListener('hashchange', onRouteChange);

state.route = parseHash();
refresh({ restoreScroll: false }).then(() => {
  if (!location.hash) history.replaceState(null, '', '#/');
});
