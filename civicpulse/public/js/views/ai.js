import { api } from '../api.js';
import {
  icon, esc, categoryTag, priorityPill, pct, scoreBar, toast, catMeta, $, $$,
} from '../ui.js';

const SAMPLES = [
  {
    label: 'Waterlogging',
    text: 'Knee-deep water at the Ejipura signal after last night rain. Bikes are stalling and traffic is backed up for 500 metres.',
  },
  {
    label: 'Streetlight',
    text: 'Streetlight not working on our lane for three nights. Women avoid walking past after 8pm and it is completely dark.',
  },
  {
    label: 'Waste',
    text: 'Garbage has not been collected for a week near the school. Stray dogs are tearing the bags and the smell is terrible.',
  },
  {
    label: 'Safety hazard',
    text: 'Open manhole outside the primary school gate. There is no barricade and children walk past it every morning.',
  },
];

function pct1(value) {
  return `${(Math.round(value * 1000) / 10).toFixed(1)}%`;
}

function metric(label, value) {
  return `<div class="metric"><span class="muted">${esc(label)}</span><b>${value}</b></div>`;
}

function sweepChart(lexical, semantic, operating) {
  const width = 760;
  const height = 220;
  const left = 38;
  const right = 16;
  const top = 16;
  const bottom = 34;
  const plotW = width - left - right;
  const plotH = height - top - bottom;
  const minT = 0.3;
  const maxT = 0.9;
  const x = t => left + ((t - minT) / (maxT - minT)) * plotW;
  const y = f => top + plotH - f * plotH;

  const grid = [0, 0.25, 0.5, 0.75, 1].map(f => `
    <line x1="${left}" y1="${y(f).toFixed(1)}" x2="${width - right}" y2="${y(f).toFixed(1)}" stroke="var(--line)" stroke-dasharray="2 4" />
    <text x="${left - 8}" y="${(y(f) + 3).toFixed(1)}" text-anchor="end">${f.toFixed(2)}</text>`).join('');

  const ticks = [0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9].map(t => `
    <text x="${x(t).toFixed(1)}" y="${height - 12}" text-anchor="middle">${t.toFixed(1)}</text>`).join('');

  const line = (sweep, color, dash = '') => {
    const points = sweep.map(p => `${x(p.threshold).toFixed(1)},${y(p.f1).toFixed(1)}`).join(' ');
    return `<polyline points="${points}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" ${dash ? `stroke-dasharray="${dash}"` : ''} />`;
  };
  const best = (sweep, color) => {
    const p = sweep.reduce((a, b) => (b.f1 > a.f1 ? b : a), sweep[0]);
    return `<circle cx="${x(p.threshold).toFixed(1)}" cy="${y(p.f1).toFixed(1)}" r="4" fill="${color}" />
      <text x="${x(p.threshold).toFixed(1)}" y="${(y(p.f1) - 9).toFixed(1)}" text-anchor="middle" style="fill:${color};font-weight:700">F1 ${p.f1.toFixed(2)} @ ${p.threshold.toFixed(2)}</text>`;
  };

  return `
    <svg class="bar-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="F1 score against duplicate threshold for lexical and semantic scoring" style="height:auto">
      ${grid}${ticks}
      <line x1="${x(operating).toFixed(1)}" y1="${top}" x2="${x(operating).toFixed(1)}" y2="${top + plotH}" stroke="var(--ink-2)" stroke-dasharray="3 4" opacity=".55" />
      <text x="${(x(operating) + 5).toFixed(1)}" y="${top + 10}" style="fill:var(--ink-2);font-weight:700">operating ${operating.toFixed(2)}</text>
      ${line(lexical, 'var(--amber)', '5 4')}
      ${line(semantic, 'var(--green-3)')}
      ${best(lexical, 'var(--amber)')}
      ${best(semantic, 'var(--green-3)')}
      <text x="${left + 8}" y="${top + 14}" style="fill:var(--green-3);font-weight:700">BGE-small embeddings</text>
      <text x="${left + 8}" y="${top + 30}" style="fill:var(--amber);font-weight:700">TF-IDF fallback</text>
    </svg>`;
}

function benchCard(name, data, operating, color) {
  const fixed = data.fixedThreshold;
  const best = data.bestF1;
  return `
    <div class="card model-card">
      <div class="spread" style="align-items:flex-start">
        <div>
          <h3>${esc(name)}</h3>
          <div class="hint">${data.pairs} hand-labelled synthetic pairs · ${data.positives} true duplicates</div>
        </div>
        <span class="pill ${color === 'green' ? 'green' : 'amber'}">${operating === data.threshold ? 'operating' : 'fallback'}</span>
      </div>
      <div style="margin-top:12px">
        ${metric(`At operating threshold ${operating.toFixed(2)}`, `${pct1(fixed.precision)} precision · ${pct1(fixed.recall)} recall`)}
        ${metric('F1 at operating threshold', best && operating === fixed.threshold ? fixed.f1.toFixed(3) : fixed.f1.toFixed(3))}
        ${metric('Best F1 on this set', `${best.f1.toFixed(3)} @ ${best.threshold.toFixed(2)}`)}
        ${metric('Confusion at operating point', `${fixed.tp} TP · ${fixed.fp} FP · ${fixed.fn} FN · ${fixed.tn} TN`)}
      </div>
      <div style="margin-top:12px">
        <div class="spread tiny"><span class="muted">F1 at operating threshold</span><b>${pct1(fixed.f1)}</b></div>
        <div class="bench-bar"><i style="width:${fixed.f1 * 100}%;background:${color === 'green' ? 'var(--green-3)' : 'var(--amber)'}"></i></div>
      </div>
      <p class="hint" style="margin-top:12px">${esc(data.note)}</p>
    </div>`;
}

function renderAnalysis(a) {
  const p = a.prediction;
  const s = a.summary;
  const pr = a.priority;
  const evidence = (p.evidence || []).slice(0, 8);
  return `
    <div class="row wrap" style="gap:6px">
      ${categoryTag(p.label)}
      <span class="pill neutral">${pct(p.confidence)} confidence</span>
      ${p.usedLexicon ? `<span class="pill green">${icon('sparkles', 12)} lexicon matched</span>` : `<span class="pill neutral">model only</span>`}
    </div>
    <div class="divider" style="margin:14px 0"></div>
    <div class="label">Category alternatives</div>
    <div class="stack" style="gap:8px;margin-top:8px">
      ${[p, ...(p.alternatives || [])].slice(0, 4).map((alt, i) => `
        <div>
          <div class="spread tiny" style="margin-bottom:3px"><span style="${i === 0 ? 'font-weight:700' : ''}">${esc(alt.label)}</span><span class="muted">${pct(alt.confidence)}</span></div>
          ${scoreBar(alt.confidence * 100, i === 0 ? catMeta(alt.label).color : 'var(--line-strong)')}
        </div>`).join('')}
    </div>
    <div class="label" style="margin-top:16px">Evidence tokens</div>
    <div class="row wrap" style="gap:5px;margin-top:8px">
      ${evidence.length ? evidence.map(e => `<span class="pill neutral" title="${esc(e.source)}">${esc(e.token)} <b style="color:var(--green)">+${Number(e.weight).toFixed(1)}</b></span>`).join('') : '<span class="hint">No strong tokens found.</span>'}
    </div>
    <div class="label" style="margin-top:16px">Extractive summary</div>
    <p style="font-size:13px;margin-top:6px">${esc(s.text)}</p>
    <div class="label" style="margin-top:16px">Priority</div>
    <div class="row" style="gap:10px;align-items:baseline;margin-top:6px">
      <span style="font-family:var(--display);font-size:2rem;line-height:1">${pr.score}</span>
      <span class="tiny muted">/100 · ${esc(pr.level)} · ${pr.slaHours}h target</span>
    </div>
    ${scoreBar(pr.score, pr.level === 'Critical' ? 'var(--red)' : 'var(--green-3)')}
    <div class="stack" style="gap:5px;margin-top:10px">
      ${pr.factors.slice(0, 5).map(f => `<div class="spread tiny"><span class="muted">${esc(f.label)}</span><b style="color:${f.points < 0 ? 'var(--red)' : 'var(--green)'}">${f.points > 0 ? '+' : ''}${f.points}</b></div>`).join('')}
    </div>
    <p class="hint" style="margin-top:12px">Same pipeline as a citizen submission. Nothing is sent to a third party.</p>`;
}

export function aiView(root, ctx) {
  const model = ctx.data.config.model;
  const embeddings = ctx.data.config.embeddings;
  const cls = model.classifier;
  const dup = model.duplicates;
  const lex = dup.benchmark;
  const sem = dup.semanticBenchmark;
  const operating = dup.threshold;

  root.innerHTML = `
    <div class="page">
      <div class="shell">
        <div class="page-head">
          <div>
            <span class="eyebrow">AI & limits</span>
            <h1 class="display">A small, inspectable model. <em>Not a black box.</em></h1>
            <p class="lede">CivicPulse uses a hybrid classifier, local sentence embeddings, a deterministic priority rubric and DBSCAN. Every score below can be traced to a factor, a token or a distance. This page is the model card and the honesty note.</p>
          </div>
          <div class="row" style="gap:8px">
            <a class="btn small" href="#/ai" onclick="return false" style="pointer-events:none">${icon('activity', 14)} ${embeddings.ready ? 'Embeddings ready' : 'Lexical fallback'}</a>
            <a class="btn small primary" href="#/report">${icon('plus', 14)} Try a report</a>
          </div>
        </div>

        <div class="pipeline">
          <div class="pipe-step">
            <div class="n">01 · CAPTURE</div>
            <h4>One short report</h4>
            <p>Text, optional photo, category hint and a map pin. No account and no category quiz.</p>
            <div class="tag"><span class="pill neutral">mobile-first</span></div>
          </div>
          <div class="pipe-step">
            <div class="n">02 · UNDERSTAND</div>
            <h4>Classify, summarise, deduplicate</h4>
            <p>Naive Bayes plus a civic lexicon; local BGE-small embeddings for paraphrases; a weighted rubric for priority.</p>
            <div class="tag"><span class="pill green">runs locally</span></div>
          </div>
          <div class="pipe-step">
            <div class="n">03 · REVEAL</div>
            <h4>Find the pattern</h4>
            <p>DBSCAN groups open reports within 220 m. Trend and category movement are computed from the same data.</p>
            <div class="tag"><span class="pill neutral">DBSCAN</span></div>
          </div>
          <div class="pipe-step">
            <div class="n">04 · ACT</div>
            <h4>Human confirms</h4>
            <p>AI suggests duplicate links, categories and teams. A staff member confirms before anything changes.</p>
            <div class="tag"><span class="pill amber">human-in-the-loop</span></div>
          </div>
        </div>

        <section class="section">
          <div class="section-head">
            <div>
              <span class="eyebrow">Model card</span>
              <h2 class="display" style="margin-top:10px">What is actually running.</h2>
              <p>Deterministic pipeline. The optional LLM adapter is disabled in this demo.</p>
            </div>
            <span class="pill neutral">${esc(ctx.data.config.app.aiMode)}</span>
          </div>

          <div class="model-grid">
            <div class="card model-card">
              <div class="spread" style="align-items:flex-start">
                <div><h3>Category classifier</h3><div class="hint">${esc(cls.name)} · ${cls.classes} classes</div></div>
                <span class="pill green">${icon('check', 12)} ${pct(cls.metrics.accuracy)} CV accuracy</span>
              </div>
              <div style="margin-top:12px">
                ${metric('5-fold CV accuracy', pct(cls.metrics.accuracy))}
                ${metric('Macro F1', cls.metrics.macroF1.toFixed(3))}
                ${metric('Baseline Naive Bayes', pct(cls.metrics.baselineNaiveBayes.accuracy))}
                ${metric('Training documents', `${cls.trainingDocuments} synthetic`)}
                ${metric('Features', esc(cls.features))}
              </div>
              <div style="margin-top:12px">
                <div class="spread tiny"><span class="muted">Hybrid vs baseline</span><b>${pct(cls.metrics.accuracy)} vs ${pct(cls.metrics.baselineNaiveBayes.accuracy)}</b></div>
                <div class="bench-bar"><i style="width:${cls.metrics.accuracy * 100}%"></i></div>
              </div>
              <p class="hint" style="margin-top:12px">${esc(cls.metrics.note)}</p>
            </div>

            <div class="card model-card">
              <div class="spread" style="align-items:flex-start">
                <div><h3>Duplicate detector</h3><div class="hint">${esc(dup.name)}</div></div>
                <span class="pill ${dup.activeMode === 'semantic' ? 'green' : 'amber'}">${esc(dup.activeMode)} active</span>
              </div>
              <div style="margin-top:12px">
                ${metric('Operating threshold', operating.toFixed(2))}
                ${metric('Related threshold', dup.relatedThreshold.toFixed(2))}
                ${metric('Text similarity weight', pct(dup.weights.textSimilarity))}
                ${metric('Distance / category / time', `${pct(dup.weights.geoProximity)} / ${pct(dup.weights.categoryMatch)} / ${pct(dup.weights.timeDecay)}`)}
                ${metric('Embedding model', dup.embeddingModel.id)}
                ${metric('Dimensions · runtime', `${dup.embeddingModel.dimensions} · ONNX CPU`)}
              </div>
              <p class="hint" style="margin-top:12px">${esc(dup.embeddingModel.note)}</p>
            </div>

            <div class="card model-card">
              <div class="spread" style="align-items:flex-start">
                <div><h3>Priority rubric</h3><div class="hint">${esc(model.priority.name)} · ${esc(model.priority.version)}</div></div>
                <span class="pill neutral">explainable</span>
              </div>
              <div style="margin-top:12px">
                ${Object.entries(model.priority.levels).map(([level, min]) => metric(`${level} from`, `${min}/100 · ${model.priority.slaHours[level]}h target`)).join('')}
              </div>
              <p class="hint" style="margin-top:12px">Weights are hand-tuned for this demo, not learned from outcomes. Every report shows the exact factors and points that produced its score.</p>
            </div>

            <div class="card model-card">
              <div class="spread" style="align-items:flex-start">
                <div><h3>Hotspots, summaries & language</h3><div class="hint">${esc(model.clusters.name)}</div></div>
                <span class="pill neutral">${model.clusters.epsMeters} m · min ${model.clusters.minPoints}</span>
              </div>
              <div style="margin-top:12px">
                ${metric('Clustering', `eps ${model.clusters.epsMeters} m · minPts ${model.clusters.minPoints}`)}
                ${metric('Scope', model.clusters.scope)}
                ${metric('Summaries', model.summaries.name)}
                ${metric('Generative text', model.summaries.generative ? 'yes' : 'no')}
                ${metric('LLM adapter', model.llm.enabled ? model.llm.model : 'disabled')}
                ${metric('Embedding cache', `${embeddings.cachedTexts} texts`)}
              </div>
              <p class="hint" style="margin-top:12px">${esc(model.llm.note)}</p>
            </div>
          </div>
        </section>

        <section class="section">
          <div class="section-head">
            <div>
              <span class="eyebrow">Duplicate benchmark</span>
              <h2 class="display" style="margin-top:10px">Why the threshold is 0.78.</h2>
              <p>The same 31 hand-labelled synthetic pairs scored two ways. We chose a high threshold to favour precision, because a wrong merge hides a real report.</p>
            </div>
            <span class="pill neutral">${dup.benchmark.pairs} pairs</span>
          </div>
          <div class="card chart-card" style="margin-bottom:16px">
            <div class="chart-legend" style="margin-bottom:8px">
              <span><i style="background:var(--green-3)"></i>BGE-small embeddings</span>
              <span><i style="background:var(--amber)"></i>TF-IDF fallback</span>
              <span><i style="background:var(--ink-2)"></i>Operating threshold</span>
            </div>
            ${sweepChart(lex.sweep, sem.sweep, operating)}
            <p class="hint" style="margin-top:8px">F1 against threshold. The semantic model has a higher ceiling; the operating point sits above the best-F1 point on purpose. This is a small synthetic set, not a production evaluation.</p>
          </div>
          <div class="model-grid">
            ${benchCard('TF-IDF fallback', lex, operating, 'amber')}
            ${benchCard('BGE-small embeddings', sem, operating, 'green')}
          </div>
        </section>

        <section class="section">
          <div class="section-head">
            <div>
              <span class="eyebrow">Live playground</span>
              <h2 class="display" style="margin-top:10px">Put a sentence through the pipeline.</h2>
              <p>This calls the same <span class="mono">/api/analyze</span> endpoint used by the report form. It does not create a report.</p>
            </div>
          </div>
          <div class="playground">
            <div class="card pad">
              <div class="field">
                <label for="pg-text">Citizen description</label>
                <textarea class="textarea" id="pg-text" maxlength="1200" placeholder="Describe what you see, where, and who it affects…"></textarea>
              </div>
              <div class="row wrap" style="gap:6px;margin-top:10px">
                ${SAMPLES.map(s => `<button class="chip" data-sample="${esc(s.text)}">${esc(s.label)}</button>`).join('')}
              </div>
              <div class="spread" style="margin-top:14px">
                <span class="hint">Ctrl + Enter to run</span>
                <button class="btn primary" id="pg-run">${icon('sparkles', 15)} Analyze text</button>
              </div>
            </div>
            <div class="pg-result" id="pg-result" aria-live="polite">
              <div class="empty" style="padding:26px 12px">
                <div class="ico">${icon('sparkles', 22)}</div>
                <b>Nothing analyzed yet</b>
                <span>Pick a sample or write a report to see the classifier, evidence and priority rubric.</span>
              </div>
            </div>
          </div>
        </section>

        <section class="section">
          <div class="section-head">
            <div>
              <span class="eyebrow">Honesty note</span>
              <h2 class="display" style="margin-top:10px">What is real, what is simulated.</h2>
              <p>This is a hackathon prototype, not a municipal system. The distinction matters.</p>
            </div>
          </div>
          <div class="honesty">
            <div class="card honesty-card real">
              <h3>${icon('check-circle', 16)} Real, running here</h3>
              <ul>
                <li>Hybrid Naive Bayes + civic lexicon classifier, trained on the bundled corpus.</li>
                <li>Local BGE-small sentence embeddings (quantized ONNX, CPU) with TF-IDF fallback.</li>
                <li>Duplicate scoring, thresholds and pair comparisons computed server-side.</li>
                <li>Deterministic priority rubric with visible factors and points.</li>
                <li>DBSCAN hotspots, 14-day trends and area aggregation from the current queue.</li>
                <li>Create, action, compare, analyze and CSV export APIs; JSON-file persistence.</li>
                <li>Human confirmation for duplicate links and category overrides.</li>
              </ul>
            </div>
            <div class="card honesty-card sim">
              <h3>${icon('alert-circle', 16)} Simulated or absent</h3>
              <ul>
                <li>All 63 seed reports, names, addresses and events are synthetic.</li>
                <li>The “monsoon surge” adds synthetic reports; it is a demo control, not a forecast.</li>
                <li>No login, roles, audit trail or municipal work-order integration.</li>
                <li>No SMS, email or push notifications. Status is visible only in this app.</li>
                <li>Photos are stored locally but not analyzed by any vision model.</li>
                <li>Map tiles are a local subset around Bengaluru; not a live basemap service.</li>
                <li>No generative LLM is used by default; the adapter is optional and disabled.</li>
                <li>SLA clocks are illustrative; nothing enforces them.</li>
              </ul>
            </div>
          </div>
        </section>

        <section class="section">
          <div class="section-head">
            <div>
              <span class="eyebrow">Limitations & FAQ</span>
              <h2 class="display" style="margin-top:10px">Where this breaks.</h2>
              <p>The short version: strong demo, small evidence base, real production would need real labels and governance.</p>
            </div>
          </div>
          <div class="stack" style="gap:8px">
            <details class="faq" open>
              <summary>How accurate is the classifier, really?</summary>
              <p>${pct(cls.metrics.accuracy)} accuracy and ${cls.metrics.macroF1.toFixed(3)} macro F1 from 5-fold cross-validation on ${cls.trainingDocuments} synthetic examples. The hybrid includes a hand-written civic lexicon, so this is a sanity check, not independent validation. Confidence scores are softmax-like and are not calibrated; a 24% top score can still be correct. Real deployments need labelled reports from the actual city and a held-out test set.</p>
            </details>
            <details class="faq">
              <summary>How does duplicate detection avoid merging different problems?</summary>
              <p>Text similarity is 60% of the score; distance is 22%, category match 10% and time decay 8%. A pair must clear ${operating.toFixed(2)} to be a likely duplicate. The benchmark’s best F1 is ${sem.bestF1.f1.toFixed(3)} at ${sem.bestF1.threshold.toFixed(2)}, but that point has ${sem.bestF1.fp} false positives. We deliberately operate higher, at ${operating.toFixed(2)}, where precision is ${pct1(sem.fixedThreshold.precision)} and recall ${pct1(sem.fixedThreshold.recall)}. A staff member still confirms every link. False negatives are possible, especially for very short reports.</p>
            </details>
            <details class="faq">
              <summary>Is the priority score objective?</summary>
              <p>No. It is a transparent, hand-tuned policy rubric: category risk, hazard language, vulnerable places, impact, duplicates, hotspot size, confirmations and age. The weights reflect the demo’s values, not a validated municipal policy. They have not been audited for equity, and missing context (for example, a report that does not mention children) can under-score a real risk. Staff can override category and status.</p>
            </details>
            <details class="faq">
              <summary>What about privacy and personal data?</summary>
              <p>This demo uses synthetic reports and does not require an account. Photos are written to local disk under <span class="mono">data/uploads</span>. A production system would need consent, PII detection and redaction, retention limits, access control and an audit log. None of those are implemented here.</p>
            </details>
            <details class="faq">
              <summary>What are the known rough edges in this seed data?</summary>
              <p>Two seed reports are classified into a neighbouring category: <span class="mono">CP-1029</span> (a damaged streetlight pole with exposed wires) is predicted as Streetlight rather than Safety Hazard, and <span class="mono">CP-1056</span> (a pipeline burst flooding a street) is predicted as Waterlogging rather than Water Supply. Both remain in the queue with their submitted category and can be overridden in the ops desk. This is exactly why the product keeps a human in the loop.</p>
            </details>
            <details class="faq">
              <summary>What would you build next?</summary>
              <p>Collect real labelled reports and a proper test set; add multilingual input; add image triage with a vision model; add authentication, roles and an audit trail; connect to a work-order system; add SMS/USSD channels; and run an equity audit on priority and response times. The current architecture is deliberately small so those pieces can be added without hiding the reasoning.</p>
            </details>
          </div>
        </section>

        <section class="section">
          <div class="cta-band">
            <div>
              <span class="eyebrow" style="color:var(--mint)">See it end to end</span>
              <h2 class="display" style="margin-top:10px">Report something.<br>Watch the queue reason about it.</h2>
              <p>Submit a synthetic report, then open the ops desk to confirm a duplicate, assign a team and move it through the workflow.</p>
            </div>
            <div class="row wrap" style="gap:8px">
              <a class="btn primary large" href="#/report">${icon('plus', 16)} Report an issue</a>
              <a class="btn large" href="#/ops" style="background:rgba(255,255,255,.08);border-color:rgba(255,255,255,.2);color:var(--paper)">${icon('list', 16)} Ops desk</a>
            </div>
          </div>
        </section>
      </div>
    </div>`;

  const input = $('#pg-text', root);
  const run = $('#pg-run', root);
  const result = $('#pg-result', root);

  async function analyze() {
    const text = input.value.trim();
    if (text.length < 8) {
      toast('Write at least a few words first.', 'error');
      input.focus();
      return;
    }
    run.disabled = true;
    run.innerHTML = `${icon('refresh', 15)} Analyzing…`;
    try {
      const res = await api.analyze(text);
      result.innerHTML = renderAnalysis(res);
    } catch (err) {
      toast(err.message, 'error');
      result.innerHTML = `<div class="empty" style="padding:26px 12px"><div class="ico">${icon('alert', 22)}</div><b>Analysis failed</b><span>${esc(err.message)}</span></div>`;
    } finally {
      run.disabled = false;
      run.innerHTML = `${icon('sparkles', 15)} Analyze text`;
    }
  }

  run.addEventListener('click', analyze);
  input.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); analyze(); }
  });
  $$('[data-sample]', root).forEach(btn => {
    btn.addEventListener('click', () => {
      input.value = btn.dataset.sample;
      input.focus();
      analyze();
    });
  });
}
