import { api } from '../api.js';
import {
  icon, esc, catMeta, categoryTag, priorityPill, statusPill, pct, toast,
  fmtDateTime, debounce, scoreBar, openModal, $, $$,
} from '../ui.js';
import { createMap, pinMarker, DEMO_CENTER } from '../map.js';

const DEFAULT_POINT = { lat: 12.9306, lng: 77.6212 };

const QUICK = [
  'Knee-deep water on the road',
  'Deep pothole damaging vehicles',
  'Garbage bin overflowing for days',
  'Streetlight not working, road is dark',
  'Open manhole with no barricade',
  'Drain blocked and overflowing',
  'No water supply since yesterday',
  'Live wire hanging near the footpath',
];

function compressImage(file) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) { reject(new Error('Please choose an image file.')); return; }
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const max = 1280;
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const c = canvas.getContext('2d');
      c.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.72);
      resolve({ dataUrl, width: canvas.width, height: canvas.height, bytes: Math.round((dataUrl.length * 3) / 4) });
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That image could not be read.')); };
    img.src = url;
  });
}

function aiPreviewMarkup(ai, category) {
  if (!ai) {
    return `<div class="ai-empty">
      <div class="big">${icon('sparkles', 22)}</div>
      <b>Your triage card appears here</b>
      <p style="margin-top:6px">Start typing. CivicPulse will suggest a category, a summary and a priority — and show its reasoning.</p>
    </div>`;
  }
  const dupes = (ai.duplicates || []).filter(d => d.decision === 'likely-duplicate');
  const related = (ai.duplicates || []).filter(d => d.decision === 'related').slice(0, 2);
  return `<div class="ai-body">
    <div class="spread" style="align-items:flex-start">
      <div>
        <div class="label">Suggested category</div>
        <div style="margin-top:5px">${categoryTag(ai.prediction.label)}</div>
      </div>
      <div class="center">
        <div class="label">Confidence</div>
        <div style="font-weight:800;font-size:18px">${pct(ai.prediction.confidence)}</div>
      </div>
    </div>
    ${scoreBar(ai.prediction.confidence * 100)}
    <div class="hint" style="margin-top:8px">${esc(ai.prediction.method)}</div>

    <div class="divider" style="margin:16px 0"></div>

    <div class="spread">
      <div class="label">Priority</div>
      ${priorityPill(ai.priority.level)}
    </div>
    <div class="row" style="gap:10px;margin-top:6px;align-items:baseline">
      <span style="font-family:var(--display);font-size:2.1rem;line-height:1">${ai.priority.score}</span>
      <span class="muted tiny">/ 100 · ${ai.priority.slaHours}h response target</span>
    </div>
    ${scoreBar(ai.priority.score, ai.priority.level === 'Critical' ? 'var(--red)' : ai.priority.level === 'High' ? 'var(--amber)' : 'var(--green-3)')}
    <p class="tiny" style="color:var(--ink-2);margin-top:9px">${esc(ai.priority.explanation)}</p>

    <div class="divider" style="margin:16px 0"></div>
    <div class="label">Plain-language summary</div>
    <p style="font-size:13px;margin-top:5px">${esc(ai.summary.text)}</p>

    ${dupes.length ? `<div class="divider" style="margin:16px 0"></div>
      <div class="spread">
        <div class="label" style="color:var(--amber)">${icon('link', 12)} Possible duplicate</div>
        <span class="pill amber">${dupes.length} match${dupes.length > 1 ? 'es' : ''}</span>
      </div>
      ${dupes.slice(0, 2).map(d => `<div class="dup-mini">
        <div class="row"><b class="mono">${esc(d.id)}</b><span class="pill amber">${Math.round(d.score * 100)}% match</span></div>
        <p>${esc(d.preview || '')}</p>
        <div class="hint" style="margin-top:4px">${esc(d.reason)}</div>
      </div>`).join('')}
      <p class="hint" style="margin-top:8px">Ops will confirm before merging. Your report is never discarded automatically.</p>` : `<div class="divider" style="margin:16px 0"></div>
      <div class="spread">
        <div class="label">Duplicate check</div>
        <span class="pill green">clear</span>
      </div>
      <p class="hint" style="margin-top:6px">No likely duplicate nearby. Compared against ${ai.comparedAgainst || 0} reports by meaning, distance and time.</p>`}

    ${!dupes.length && related.length ? `<div class="divider" style="margin:16px 0"></div>
      <div class="label">Nearby related reports</div>
      ${related.map(d => `<div class="dup-mini"><div class="row"><b class="mono">${esc(d.id)}</b><span class="pill neutral">${Math.round(d.score * 100)}%</span></div><p>${esc(d.preview || '')}</p></div>`).join('')}` : ''}

    <p class="hint" style="margin-top:14px">${icon('info', 12)} ${category ? 'You chose a category; the AI suggestion is shown for comparison.' : 'You can override the suggested category before submitting.'}</p>
  </div>`;
}

export function reportView(root, ctx) {
  const { config } = ctx.data;
  const draft = {
    text: '', category: null, location: { ...DEFAULT_POINT },
    address: '', photo: null, photoMeta: null, reporterName: '', step: 1,
  };
  let ai = null;
  let analyzing = false;
  let analyzeSeq = 0;
  let map = null;
  let pin = null;
  let submitting = false;

  const categories = config.categories;

  root.innerHTML = `
    <div class="page">
      <div class="shell">
        <div class="page-head">
          <div>
            <span class="eyebrow">Report an issue</span>
            <h1 class="display">Tell us what you see.</h1>
            <p class="lede">Three short steps. CivicPulse does the categorising, checking and prioritising, so you don't have to.</p>
          </div>
          <a class="btn ghost" href="#/track">${icon('search', 15)} Track an existing report</a>
        </div>

        <div class="report-layout">
          <form class="card report-card" id="report-form" novalidate>
            <div class="stepper" id="stepper">
              <div class="step-node active" data-step-node="1"><span class="n">1</span><span class="lbl">Describe</span></div>
              <div class="step-line"></div>
              <div class="step-node" data-step-node="2"><span class="n">2</span><span class="lbl">Locate</span></div>
              <div class="step-line"></div>
              <div class="step-node" data-step-node="3"><span class="n">3</span><span class="lbl">Review</span></div>
            </div>

            <section class="form-step active" data-step="1">
              <div class="step-title">What's happening?</div>
              <div class="step-sub">Describe it the way you'd tell a neighbour. More detail means better triage.</div>
              <div class="field">
                <label for="report-text">Description</label>
                <textarea class="textarea" id="report-text" maxlength="4000" placeholder="e.g. Knee-deep water at the Ejipura signal after last night's rain. Bikes are stalling and traffic is backed up for 500 metres."></textarea>
                <div class="counter"><span id="char-count">0</span> / 4000</div>
              </div>
              <div class="quick-chips" id="quick-chips">
                ${QUICK.map(q => `<button type="button" class="chip" data-quick="${esc(q)}">${esc(q)}</button>`).join('')}
              </div>

              <div class="field" style="margin-top:22px">
                <label>Category <span style="text-transform:none;letter-spacing:0;font-weight:500;color:var(--muted-2)">(optional — AI can detect it)</span></label>
                <div class="row wrap" id="category-chips">
                  <button type="button" class="chip active" data-cat=""><span class="dot" style="background:var(--green)"></span> Let AI detect</button>
                  ${categories.map(c => `<button type="button" class="chip" data-cat="${esc(c.id)}"><span class="dot" style="background:${c.color}"></span>${esc(c.label)}</button>`).join('')}
                </div>
              </div>

              <div class="field" style="margin-top:22px">
                <label>Photo <span style="text-transform:none;letter-spacing:0;font-weight:500;color:var(--muted-2)">(optional)</span></label>
                <div id="photo-slot">
                  <label class="photo-drop" for="photo-input">
                    <span class="ico">${icon('camera', 20)}</span>
                    <span><b>Add a photo</b><span>JPEG or PNG. Compressed in your browser before upload.</span></span>
                    <input type="file" id="photo-input" accept="image/*" class="sr-only">
                  </label>
                </div>
              </div>

              <div class="step-actions">
                <span></span>
                <button type="button" class="btn primary" data-next="2">Continue ${icon('arrow-right', 15)}</button>
              </div>
            </section>

            <section class="form-step" data-step="2">
              <div class="step-title">Where is it?</div>
              <div class="step-sub">Drag the pin to the exact spot. Reports snap to the nearest demo locality for grouping.</div>
              <div class="report-map" id="report-map"></div>
              <div class="map-tools">
                <button type="button" class="btn small" id="use-location">${icon('locate', 14)} Use my location</button>
                <button type="button" class="btn small" id="reset-location">${icon('refresh', 14)} Centre on Ejipura</button>
                <span class="hint" id="coords" style="align-self:center"></span>
              </div>
              <div class="field" style="margin-top:18px">
                <label for="report-address">Landmark or street <span style="text-transform:none;letter-spacing:0;font-weight:500;color:var(--muted-2)">(optional)</span></label>
                <input class="input" id="report-address" maxlength="240" placeholder="e.g. Near Ejipura signal, 5th cross">
              </div>
              <div class="field" style="margin-top:18px">
                <label for="report-name">Your name <span style="text-transform:none;letter-spacing:0;font-weight:500;color:var(--muted-2)">(optional — anonymous is fine)</span></label>
                <input class="input" id="report-name" maxlength="60" placeholder="Anonymous citizen">
              </div>
              <div class="step-actions">
                <button type="button" class="btn ghost" data-back="1">${icon('arrow-left', 15)} Back</button>
                <button type="button" class="btn primary" data-next="3">Review ${icon('arrow-right', 15)}</button>
              </div>
            </section>

            <section class="form-step" data-step="3">
              <div class="step-title">Check and submit</div>
              <div class="step-sub">This is exactly what goes to the operations desk. Nothing is published publicly.</div>
              <div class="review-list" id="review-list"></div>
              <label class="checkline" style="margin-top:16px">
                <input type="checkbox" id="consent" checked>
                <span>I understand this is a demo using synthetic data, and that the AI triage is a suggestion reviewed by a human.</span>
              </label>
              <div class="step-actions">
                <button type="button" class="btn ghost" data-back="2">${icon('arrow-left', 15)} Back</button>
                <button type="submit" class="btn primary" id="submit-report">${icon('send', 15)} Submit report</button>
              </div>
            </section>
          </form>

          <aside class="ai-preview card">
            <div class="head">
              <span class="sparkle">${icon('sparkles', 16)}</span>
              <div class="grow"><b>CivicPulse triage</b><span>Updates as you type · runs locally</span></div>
              <span class="pill neutral" id="ai-state">idle</span>
            </div>
            <div id="ai-preview-body">${aiPreviewMarkup(null)}</div>
          </aside>
        </div>
      </div>
    </div>
  `;

  const form = $('#report-form', root);
  const textEl = $('#report-text', root);
  const countEl = $('#char-count', root);
  const aiBody = $('#ai-preview-body', root);
  const aiState = $('#ai-state', root);

  function goStep(n) {
    draft.step = n;
    $$('.form-step', root).forEach(s => s.classList.toggle('active', Number(s.dataset.step) === n));
    $$('.step-node', root).forEach(node => {
      const k = Number(node.dataset.stepNode);
      node.classList.toggle('active', k === n);
      node.classList.toggle('done', k < n);
    });
    if (n === 2) {
      setTimeout(() => {
        if (!map) initMap();
        map.invalidateSize();
      }, 30);
    }
    if (n === 3) renderReview();
  }

  function initMap() {
    map = createMap($('#report-map', root), { center: [draft.location.lat, draft.location.lng], zoom: 15 });
    pin = pinMarker(draft.location.lat, draft.location.lng, {
      onMove: (lat, lng) => {
        draft.location.lat = +lat.toFixed(6);
        draft.location.lng = +lng.toFixed(6);
        updateCoords();
        analyzeSoon();
      },
    }).addTo(map);
    updateCoords();
    map.on('click', (e) => {
      draft.location.lat = +e.latlng.lat.toFixed(6);
      draft.location.lng = +e.latlng.lng.toFixed(6);
      pin.setLatLng([draft.location.lat, draft.location.lng]);
      updateCoords();
      analyzeSoon();
    });
  }

  function updateCoords() {
    const el = $('#coords', root);
    if (el) el.textContent = `${draft.location.lat.toFixed(5)}, ${draft.location.lng.toFixed(5)}`;
  }

  function renderReview() {
    const el = $('#review-list', root);
    if (!el) return;
    const cat = draft.category || (ai ? ai.prediction.label : 'Auto-detect');
    const prio = ai ? `${ai.priority.level} · ${ai.priority.score}/100` : 'Calculated on submit';
    el.innerHTML = `
      <div class="review-row"><div class="k">Issue</div><div>${esc(draft.text)}</div></div>
      <div class="review-row"><div class="k">Category</div><div>${esc(cat)}${!draft.category && ai ? ' <span class="hint">(AI suggested)</span>' : ''}</div></div>
      <div class="review-row"><div class="k">Location</div><div>${esc(draft.address || 'Pinned location')}<br><span class="mono hint">${draft.location.lat.toFixed(5)}, ${draft.location.lng.toFixed(5)}</span></div></div>
      <div class="review-row"><div class="k">Priority</div><div>${esc(prio)}</div></div>
      <div class="review-row"><div class="k">Photo</div><div>${draft.photo ? '1 photo attached' : 'None'}</div></div>
      <div class="review-row"><div class="k">Reporter</div><div>${esc(draft.reporterName || 'Anonymous citizen')}</div></div>`;
  }

  async function runAnalysis() {
    const text = textEl.value.trim();
    if (text.length < 8) {
      analyzeSeq += 1;
      ai = null;
      aiBody.innerHTML = aiPreviewMarkup(null);
      aiState.textContent = 'idle';
      return;
    }
    const seq = ++analyzeSeq;
    analyzing = true;
    aiState.textContent = 'thinking…';
    try {
      const res = await api.analyze(text, { location: { ...draft.location }, category: draft.category });
      if (seq !== analyzeSeq) return;
      ai = res;
      aiBody.innerHTML = aiPreviewMarkup(ai, draft.category);
      aiState.textContent = 'live';
      if (draft.step === 3) renderReview();
    } catch (err) {
      if (seq !== analyzeSeq) return;
      aiState.textContent = 'offline';
      aiBody.innerHTML = `<div class="ai-empty">${icon('alert-circle', 20)}<br><b>AI preview unavailable</b><p>${esc(err.message)}</p></div>`;
    } finally { if (seq === analyzeSeq) analyzing = false; }
  }

  const analyzeSoon = debounce(runAnalysis, 420);

  textEl.addEventListener('input', () => {
    draft.text = textEl.value;
    countEl.textContent = textEl.value.length;
    aiState.textContent = textEl.value.trim().length >= 8 ? 'reading…' : 'idle';
    analyzeSoon();
  });

  $('#quick-chips', root).addEventListener('click', (e) => {
    const chip = e.target.closest('[data-quick]');
    if (!chip) return;
    textEl.value = chip.dataset.quick;
    draft.text = textEl.value;
    countEl.textContent = textEl.value.length;
    textEl.focus();
    runAnalysis();
  });

  $('#category-chips', root).addEventListener('click', (e) => {
    const chip = e.target.closest('[data-cat]');
    if (!chip) return;
    $$('#category-chips .chip', root).forEach(c => c.classList.toggle('active', c === chip));
    draft.category = chip.dataset.cat || null;
    if (ai) aiBody.innerHTML = aiPreviewMarkup(ai, draft.category);
    analyzeSoon();
    if (draft.step === 3) renderReview();
  });

  $('#photo-input', root).addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const out = await compressImage(file);
      draft.photo = out.dataUrl;
      draft.photoMeta = { width: out.width, height: out.height, bytes: out.bytes, name: file.name };
      $('#photo-slot', root).innerHTML = `<div class="photo-preview">
        <img src="${out.dataUrl}" alt="Attached photo preview">
        <button type="button" class="remove" id="remove-photo" aria-label="Remove photo">${icon('x', 15)}</button>
      </div>
      <div class="hint" style="margin-top:6px">${esc(file.name)} · ${out.width}×${out.height} · ${(out.bytes / 1024).toFixed(0)} KB after compression</div>`;
      $('#remove-photo', root).addEventListener('click', () => {
        draft.photo = null; draft.photoMeta = null;
        $('#photo-slot', root).innerHTML = `<label class="photo-drop" for="photo-input"><span class="ico">${icon('camera', 20)}</span><span><b>Add a photo</b><span>JPEG or PNG. Compressed in your browser before upload.</span></span></label>`;
      });
    } catch (err) { toast(err.message, 'error'); }
  });

  form.addEventListener('click', (e) => {
    const next = e.target.closest('[data-next]');
    const back = e.target.closest('[data-back]');
    if (next) {
      if (Number(next.dataset.next) === 2 && textEl.value.trim().length < 8) {
        toast('Add a little more detail first (at least 8 characters).', 'error');
        textEl.focus();
        return;
      }
      if (Number(next.dataset.next) === 3 && !ai) runAnalysis();
      goStep(Number(next.dataset.next));
    }
    if (back) goStep(Number(back.dataset.back));
  });

  $('#use-location', root).addEventListener('click', () => {
    if (!navigator.geolocation) { toast('Geolocation is not available in this browser.', 'error'); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        draft.location.lat = +pos.coords.latitude.toFixed(6);
        draft.location.lng = +pos.coords.longitude.toFixed(6);
        if (pin) pin.setLatLng([draft.location.lat, draft.location.lng]);
        if (map) map.setView([draft.location.lat, draft.location.lng], 16);
        updateCoords();
        analyzeSoon();
        toast('Using your current location. Drag the pin to adjust.', 'success');
      },
      () => toast('Could not get your location. Drag the pin instead.', 'error'),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  });

  $('#reset-location', root).addEventListener('click', () => {
    draft.location = { ...DEMO_CENTER };
    if (pin) pin.setLatLng([DEMO_CENTER[0], DEMO_CENTER[1]]);
    if (map) map.setView(DEMO_CENTER, 15);
    updateCoords();
    analyzeSoon();
  });

  $('#report-address', root).addEventListener('input', (e) => { draft.address = e.target.value; });
  $('#report-name', root).addEventListener('input', (e) => { draft.reporterName = e.target.value; });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (submitting) return;
    if (textEl.value.trim().length < 8) { goStep(1); toast('Please describe the issue first.', 'error'); return; }
    if (!$('#consent', root).checked) { toast('Please acknowledge the demo note.', 'error'); return; }
    submitting = true;
    const overlay = showProcessing();
    const started = Date.now();
    try {
      const res = await api.create({
        text: draft.text.trim(),
        category: draft.category,
        location: { ...draft.location, address: draft.address.trim() || undefined },
        photo: draft.photo || undefined,
        photoMeta: draft.photoMeta || undefined,
        reporterName: draft.reporterName.trim() || undefined,
        channel: 'Citizen app',
      });
      const wait = Math.max(0, 1900 - (Date.now() - started));
      await new Promise(r => setTimeout(r, wait));
      overlay.finish();
      ctx.state.data.reports.unshift(res.report);
      ctx.state.data.insights = res.insights;
      setTimeout(() => {
        overlay.remove();
        renderResult(res, ctx, root);
      }, 320);
    } catch (err) {
      overlay.remove();
      toast(err.message, 'error');
      submitting = false;
    }
  });

  if (textEl.value.length) runAnalysis();
  return () => { if (map) { try { map.remove(); } catch { /* noop */ } } };
}

function showProcessing() {
  const el = document.createElement('div');
  el.className = 'processing';
  el.innerHTML = `<div class="processing-card">
    <div class="radar"><span class="ring"></span><span class="ring"></span><span class="ring"></span><span class="core">${icon('sparkles', 20)}</span></div>
    <div class="display" style="font-size:1.9rem">Reading your report…</div>
    <p class="muted" style="font-size:13px;margin-top:6px">Local AI · no text leaves this machine</p>
    <div class="proc-steps">
      <div class="proc-step active" data-p="0"><span class="dot">1</span> Cleaning text and detecting language signals</div>
      <div class="proc-step" data-p="1"><span class="dot">2</span> Classifying the issue and scoring urgency</div>
      <div class="proc-step" data-p="2"><span class="dot">3</span> Comparing against nearby reports</div>
      <div class="proc-step" data-p="3"><span class="dot">4</span> Building the explainable triage card</div>
    </div>
  </div>`;
  document.body.appendChild(el);
  document.body.classList.add('no-scroll');
  const steps = Array.from(el.querySelectorAll('.proc-step'));
  let i = 0;
  const timer = setInterval(() => {
    i = Math.min(steps.length - 1, i + 1);
    steps.forEach((s, k) => {
      s.classList.toggle('done', k < i);
      s.classList.toggle('active', k === i);
    });
  }, 420);
  return {
    finish: () => {
      clearInterval(timer);
      steps.forEach(s => { s.classList.add('done'); s.classList.remove('active'); });
    },
    remove: () => {
      clearInterval(timer);
      el.remove();
      document.body.classList.remove('no-scroll');
    },
  };
}

function renderResult(res, ctx, root) {
  const { report, ai } = res;
  const dupes = (ai.duplicates || []).filter(d => d.decision === 'likely-duplicate');
  const team = ctx.data.config.teams.find(t => t.name === report.team);
  root.innerHTML = `
    <div class="page">
      <div class="shell" style="max-width:1000px">
        <div class="result-hero">
          <span class="eyebrow" style="color:var(--mint)">Report received</span>
          <div class="result-id">${esc(report.id)}</div>
          <p style="color:rgba(242,248,244,.78);max-width:60ch">Save this tracking ID. Your report is already in the operations queue, with an AI triage card attached for a human to review.</p>
          <div class="result-actions">
            <a class="btn" href="#/track/${esc(report.id)}">${icon('clock', 15)} Track this report</a>
            <button class="btn ghost" style="color:#f2f8f4" id="report-another">${icon('plus', 15)} Report another</button>
          </div>
        </div>

        <div class="result-grid">
          <div class="stack">
            <div class="card pad">
              <div class="spread">
                <div>
                  <div class="label">AI triage</div>
                  <div class="row" style="gap:8px;margin-top:7px">${categoryTag(report.category)} ${priorityPill(report.priority.level)}</div>
                </div>
                <div class="center">
                  <div style="font-family:var(--display);font-size:2rem;line-height:1">${report.priority.score}</div>
                  <div class="label" style="font-size:9px">priority score</div>
                </div>
              </div>
              <p style="margin-top:14px;font-size:14px">${esc(report.summary)}</p>
              <p class="hint" style="margin-top:8px">${esc(report.priority.explanation)}</p>
              <div class="divider" style="margin:16px 0"></div>
              <div class="row wrap" style="gap:8px">
                <span class="pill neutral">${icon('building', 12)} ${esc(report.team || 'Unassigned')}</span>
                <span class="pill neutral">${icon('clock', 12)} ${report.priority.slaHours}h target</span>
                <span class="pill neutral">${icon('pin', 12)} ${esc(report.area)}</span>
                <span class="pill neutral">${pct(ai.categoryPrediction.confidence)} category confidence</span>
              </div>
              ${team ? `<p class="hint" style="margin-top:10px">Suggested owner: ${esc(team.name)} · ${esc(team.lead)}. A dispatcher still has to assign it.</p>` : ''}
            </div>

            <div class="card pad">
              <div class="card-title">Why this priority?</div>
              <div style="margin-top:10px">
                ${report.priority.factors.map(f => `
                  <div class="factor-row ${f.points < 0 ? 'neg' : ''}">
                    <div class="lbl">${esc(f.label)}<small>${esc(f.detail)}</small></div>
                    <b style="color:${f.points < 0 ? 'var(--red)' : 'var(--green)'}">${f.points > 0 ? '+' : ''}${f.points}</b>
                    <div class="bar"><i style="width:${Math.min(100, Math.abs(f.points) * 3)}%"></i></div>
                  </div>`).join('')}
              </div>
            </div>
          </div>

          <div class="stack">
            <div class="card pad">
              <div class="card-title">Duplicate check</div>
              ${dupes.length ? `
                <p class="hint" style="margin-top:4px">${dupes.length} likely duplicate${dupes.length > 1 ? 's' : ''} found. Ops will confirm before merging — your report stays visible either way.</p>
                ${dupes.map(d => `<div class="dup-mini">
                  <div class="row"><b class="mono">${esc(d.id)}</b><span class="pill amber">${Math.round(d.score * 100)}% match</span></div>
                  <p>${esc(d.preview || '')}</p>
                  <div class="hint" style="margin-top:4px">${esc(d.reason)}</div>
                </div>`).join('')}
                <a class="btn small block" style="margin-top:10px" href="#/ops">${icon('scale', 14)} Open in ops desk</a>
              ` : `<p class="hint" style="margin-top:4px">No likely duplicate found. Your report was compared against ${ctx.state.data.reports.length} reports using semantic similarity, distance and time.</p>
                <div class="empty" style="padding:18px 0 6px"><div class="ico">${icon('check-circle', 20)}</div><b style="font-size:13px">Looks like a new issue</b><span class="tiny">This is a suggestion, not a guarantee.</span></div>`}
            </div>

            <div class="card pad">
              <div class="card-title">What happens next</div>
              <ol class="stack" style="margin-top:10px;gap:12px">
                <li class="row" style="align-items:flex-start"><span class="pill green">1</span><span class="tiny">A dispatcher reviews the AI card and confirms or rejects the duplicate suggestion.</span></li>
                <li class="row" style="align-items:flex-start"><span class="pill green">2</span><span class="tiny">The report is assigned to ${esc(report.team || 'a field team')} with a ${report.priority.slaHours}-hour target.</span></li>
                <li class="row" style="align-items:flex-start"><span class="pill green">3</span><span class="tiny">You can follow every status change on the tracking page and add a public update.</span></li>
              </ol>
            </div>
          </div>
        </div>
      </div>
    </div>`;

  $('#report-another', root).addEventListener('click', () => {
    location.hash = '#/report';
    setTimeout(() => ctx.reload(), 30);
  });
}
