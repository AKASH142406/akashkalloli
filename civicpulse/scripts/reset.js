// Reset the demo to the 63 synthetic seed reports without starting the server.
// Run: npm run reset
import fs from 'node:fs';
import path from 'node:path';
import { initStore, flush } from '../lib/store.js';

const uploads = path.resolve('uploads');
let removed = 0;
try {
  for (const name of fs.readdirSync(uploads)) {
    if (/^CP-\d+\.(png|jpe?g|webp)$/i.test(name)) {
      fs.rmSync(path.join(uploads, name), { force: true });
      removed += 1;
    }
  }
} catch {
  // No uploads directory yet.
}

const result = await initStore({ forceReset: true });
flush();
console.log(`\nDemo reset: ${result.count} synthetic reports.${removed ? ` Removed ${removed} uploaded photo(s).` : ''}`);
console.log('Start the app with: npm start\n');
