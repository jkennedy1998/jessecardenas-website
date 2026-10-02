#!/usr/bin/env node
// Root builder: runs every source/<page>/build-entries.mjs it finds.
import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const sourceDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'source');
const builders = (await readdir(sourceDir, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => path.join(sourceDir, entry.name, 'build-entries.mjs'))
  .filter(existsSync)
  .sort();

for (const builder of builders) {
  await import(`${pathToFileURL(builder).href}?t=${Date.now()}`);
}
