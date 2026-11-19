// Regenerates index.html and work/<slug>/index.html from content/site.json.
// The admin panel does this automatically on publish; run this only when editing site.json by hand:
//   node tools/build.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { allShells } from '../assets/shell.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const site = JSON.parse(readFileSync(join(root, 'content/site.json'), 'utf8'));
for (const [path, html] of Object.entries(allShells(site))) {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), html);
  console.log('wrote', path);
}
