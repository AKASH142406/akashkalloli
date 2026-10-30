// Fast, dependency-free checks for the deterministic AI pipeline.
// Run: npm test
import assert from 'node:assert/strict';
import {
  classifier, classifierMetrics, buildIdf, duplicateScore, scorePriority,
  summarize, buildInsights, analyzeReport, buildReportIdf, modelCard,
  DUP_THRESHOLD, RELATED_THRESHOLD,
} from '../lib/ai.js';
import { buildSeedReports } from '../lib/seed.js';

let passed = 0;
function check(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ok  ${name}`);
  } catch (err) {
    console.error(`  FAIL  ${name}`);
    console.error(`        ${err.message}`);
    process.exitCode = 1;
  }
}

console.log('\nCivicPulse AI checks\n');

check('classifier handles one clear example per category', () => {
  const samples = [
    ['Waterlogging', 'Knee-deep water on the road after heavy rain'],
    ['Drainage', 'Storm water drain is blocked and overflowing'],
    ['Road Damage', 'Deep pothole damaging vehicles near the junction'],
    ['Waste Overflow', 'Garbage bin overflowing for days with foul smell'],
    ['Streetlight', 'Streetlight not working, the road is dark at night'],
    ['Safety Hazard', 'Live electric wire hanging near the school gate'],
    ['Water Supply', 'No water supply since yesterday in our apartment'],
    ['Public Property', 'Broken bench and damaged railing in the park'],
  ];
  for (const [expected, text] of samples) {
    const got = classifier.predict(text).label;
    assert.equal(got, expected, `"${text}" -> ${got}, expected ${expected}`);
  }
});

check('cross-validation beats the plain Naive Bayes baseline', () => {
  assert.ok(classifierMetrics.accuracy >= 0.85, `hybrid accuracy ${classifierMetrics.accuracy}`);
  assert.ok(classifierMetrics.accuracy > classifierMetrics.baselineNaiveBayes.accuracy);
});

check('near-identical reports score as duplicates; unrelated reports do not', () => {
  const at = new Date().toISOString();
  const a = {
    text: 'Knee-deep water at Ejipura signal after last night rain. Bikes stalling and traffic backed up.',
    category: 'Waterlogging', location: { lat: 12.9306, lng: 77.6212 }, createdAt: at,
  };
  const b = {
    text: 'Knee-deep water at Ejipura signal after last night rain. Bikes stalling, traffic backed up for 500 metres.',
    category: 'Waterlogging', location: { lat: 12.9309, lng: 77.6215 }, createdAt: at,
  };
  const c = {
    text: 'Streetlight not working near the park, road is dark at night.',
    category: 'Streetlight', location: { lat: 12.9784, lng: 77.6408 }, createdAt: at,
  };
  const idf = buildIdf([a.text, b.text, c.text]);
  const dup = duplicateScore(a, b, idf);
  const different = duplicateScore(a, c, idf);
  assert.ok(dup.score >= DUP_THRESHOLD, `duplicate score ${dup.score} < ${DUP_THRESHOLD}`);
  assert.ok(different.score < RELATED_THRESHOLD, `unrelated score ${different.score} >= ${RELATED_THRESHOLD}`);
});

check('priority rubric ranks a live wire above cosmetic damage', () => {
  const critical = scorePriority(
    { text: 'Live electric wire hanging near the school gate, sparking', category: 'Safety Hazard', status: 'new' },
    { categoryConfidence: 0.6 },
  );
  const minor = scorePriority(
    { text: 'Minor paint fade on the park bench', category: 'Public Property', status: 'new' },
    { categoryConfidence: 0.4 },
  );
  assert.equal(critical.level, 'Critical');
  assert.equal(minor.level, 'Low');
  assert.ok(critical.explanation.includes('because'));
});

check('summary is extractive and names the area', () => {
  const summary = summarize('Knee-deep water at the Ejipura signal. Bikes are stalling and traffic is backed up.', 'Waterlogging', 'Ejipura');
  assert.ok(summary.text.length > 20);
  assert.ok(summary.text.includes('Ejipura'));
  assert.ok(!summary.text.includes('undefined'));
  assert.equal(summary.method, 'extractive + template (no generative model)');
});

check('seed dataset produces hotspots, duplicate groups and a complete brief', () => {
  const now = Date.parse('2026-06-15T12:00:00Z');
  const reports = buildSeedReports(now);
  const idf = buildReportIdf(reports);
  for (const r of reports) {
    const ai = analyzeReport(r, reports, { now, idfModel: idf });
    r.summary = ai.summary.text;
    r.ai = ai;
    r.priority = ai.priority;
  }
  const insights = buildInsights(reports, { now, idfModel: idf });
  assert.ok(reports.length >= 50, `only ${reports.length} seed reports`);
  assert.ok(insights.clusters.length >= 1, 'expected at least one hotspot');
  assert.ok(insights.duplicateGroups.length >= 1, 'expected at least one duplicate group');
  assert.ok(insights.brief.headline.length > 10);
  assert.ok(insights.brief.action.length > 20);
  assert.ok(!insights.brief.action.includes('undefined'), 'brief action contains undefined');
  assert.ok(insights.stats.critical >= 1, 'expected at least one critical seed report');
});

check('model card exposes the real operating configuration', () => {
  const card = modelCard();
  assert.equal(card.classifier.trainingDocuments, 193);
  assert.ok(card.duplicates.threshold > 0);
  assert.ok(card.duplicates.benchmark);
  assert.equal(card.summaries.generative, false);
  assert.equal(card.llm.enabled, false);
});

console.log(`\n${passed} checks passed${process.exitCode ? ' — with failures' : ''}\n`);
