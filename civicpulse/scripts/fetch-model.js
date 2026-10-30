#!/usr/bin/env node
// Downloads the local BGE-small embedding model used for duplicate scoring.
// Run once after `npm install`:  npm run setup:model
//
// The app works without this file: it falls back to TF-IDF cosine for duplicate
// scoring. Semantic duplicate detection is materially better, so the demo uses
// the local model when it is present.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MODEL_ID = process.env.CIVIC_EMBEDDING_MODEL || 'Xenova/bge-small-en-v1.5';
const BASE = `https://huggingface.co/${MODEL_ID}/resolve/main`;
const FILES = [
  'config.json',
  'tokenizer.json',
  'tokenizer_config.json',
  'onnx/model_quantized.onnx',
];
const DEST = path.join(ROOT, 'models', ...MODEL_ID.split('/'));

const human = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

console.log(`\nCivicPulse model setup`);
console.log(`  model: ${MODEL_ID}`);
console.log(`  into:  ${path.relative(ROOT, DEST)}\n`);

let failed = false;
for (const file of FILES) {
  const target = path.join(DEST, file);
  if (fs.existsSync(target) && fs.statSync(target).size > 0) {
    console.log(`  ok   ${file} (${human(fs.statSync(target).size)})`);
    continue;
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  process.stdout.write(`  get  ${file} ... `);
  try {
    const res = await fetch(`${BASE}/${file}`, { redirect: 'follow' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const tmp = `${target}.part`;
    fs.writeFileSync(tmp, buf);
    fs.renameSync(tmp, target);
    console.log(human(buf.length));
  } catch (err) {
    console.log(`failed (${err.message})`);
    failed = true;
    break;
  }
}

if (failed) {
  console.error('\nModel download failed. The app will still run with the TF-IDF fallback.');
  process.exitCode = 1;
} else {
  console.log('\nDone. Start the app with: npm start\n');
}
