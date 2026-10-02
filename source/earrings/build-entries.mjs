#!/usr/bin/env node
// Compiles source/earrings/<slug>/entry.md folders into source/earrings/entries.js
// Same intake idea as jartanddesign: folder + file becomes a listing.
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const palettePath = path.join(rootDir, "palette.json");
const mediaName = /^image-(\d+)\.(png|jpe?g|webp|gif|svg)$/i;
const pieceName = /^(top|bottom)\.(png|jpe?g|webp|svg)$/i;

function parseEntryMarkdown(sourceText) {
  const lines = sourceText.replace(/\r\n/g, "\n").split("\n");
  const entry = {};
  let section = null;
  for (const line of lines) {
    const heading = line.match(/^##\s+(.+)$/);
    if (heading) {
      section = heading[1].trim().toLowerCase();
      if (!(section in entry)) entry[section] = "";
      continue;
    }
    if (!section) continue;
    entry[section] = entry[section] ? `${entry[section]}\n${line}` : line;
  }
  return Object.fromEntries(Object.entries(entry).map(([key, value]) => [key, value.trim()]));
}

function parseColorConfig(sourceText) {
  const config = {};
  if (!sourceText) return config;
  for (const line of sourceText.split("\n")) {
    const match = line.match(/^\s*[-*]\s*([^:]+):\s*(.*?)\s*$/);
    if (!match) continue;
    config[match[1].trim().toLowerCase()] = match[2].trim();
  }
  return config;
}

const REQUIRED = ["title", "price", "quantity", "description"];
// Accent is the earring's canonical interaction color. The selected-outline
// and selection-averaged shop color both derive from these entry values.
const REQUIRED_COLORS = ["title", "subtitle", "description", "background", "brightness", "accent"];
const PALETTE_TONES = ["light", "mid", "dark"];
const palette = JSON.parse(await readFile(palettePath, "utf8"));
for (const [family, tones] of Object.entries(palette)) {
  const missingTones = PALETTE_TONES.filter((tone) => !tones[tone]);
  const invalidTones = PALETTE_TONES.filter((tone) =>
    tones[tone] && !/^#[\da-f]{6}$/i.test(tones[tone]));
  if (missingTones.length || invalidTones.length) {
    throw new Error(`palette.json: ${family} must declare valid light, mid, and dark hex colors`);
  }
}

const dirEntries = await readdir(rootDir, { withFileTypes: true });
const entries = [];
for (const dirEntry of dirEntries) {
  if (!dirEntry.isDirectory() || dirEntry.name.startsWith('.')) continue;
  const slug = dirEntry.name;
  const folderPath = path.join(rootDir, slug);
  let sourceText;
  try {
    sourceText = await readFile(path.join(folderPath, 'entry.md'), 'utf8');
  } catch {
    continue;
  }
  const parsed = parseEntryMarkdown(sourceText);
  const missing = REQUIRED.filter((key) => !parsed[key]);
  if (missing.length) {
    throw new Error(`${slug}/entry.md: missing required sections: ${missing.join(", ")}`);
  }
  const colors = parseColorConfig(parsed.colors || "");
  const missingColors = REQUIRED_COLORS.filter((key) => !colors[key]);
  if (missingColors.length) {
    throw new Error(`${slug}/entry.md: ## colors missing keys: ${missingColors.join(", ")}`);
  }
  colors.accent = colors.accent.toLowerCase();
  if (!palette[colors.accent]) {
    throw new Error(`${slug}/entry.md: ## colors accent must name a family from palette.json`);
  }
  const price = Number(parsed.price);
  const quantity = Number(parsed.quantity);
  if (!Number.isFinite(price) || price <= 0) throw new Error(`${slug}/entry.md: ## price must be a positive number`);
  if (!Number.isInteger(quantity) || quantity < 0) throw new Error(`${slug}/entry.md: ## quantity must be a whole number of singles`);

  const folderFiles = await readdir(folderPath);
  const mediaFiles = folderFiles
    .filter((name) => mediaName.test(name))
    .sort((a, b) => Number(a.match(mediaName)[1]) - Number(b.match(mediaName)[1]))
    .map((name) => `source/earrings/${slug}/${name}`);
  const pieces = {};
  for (const name of folderFiles) {
    const match = name.match(pieceName);
    if (match) pieces[match[1].toLowerCase()] = `source/earrings/${slug}/${name}`;
  }
  let frames = null;
  if (folderFiles.includes('frames.json')) {
    try {
      frames = JSON.parse(await readFile(path.join(folderPath, 'frames.json'), 'utf8'));
      frames.sheet = `source/earrings/${slug}/${frames.sheet}`;
    } catch (error) {
      throw new Error(`${slug}/frames.json: ${error.message}`);
    }
  }

  entries.push({
    slug,
    title: parsed.title,
    price,
    quantity,
    materials: parsed.materials || "",
    made: parsed.made || "",
    description: parsed.description,
    preset: (parsed.preset || "single-media").trim().toLowerCase(),
    node: parsed.node && Number.isInteger(Number(parsed.node)) ? Number(parsed.node) : null,
    colors,
    mediaFiles: { images: mediaFiles, videos: [] },
    mediaTop: pieces.top || null,
    mediaBottom: pieces.bottom || null,
    frames,
  });
}

if (!entries.length) console.log("warning: no earring entries found under source/earrings/");

const escapeTemplate = (text) => text.replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
const content = `window.EARRING_COLOR_PALETTE = ${JSON.stringify(palette)};\n\nwindow.EARRINGS_PAGE_SOURCE = [\n${entries.map((entry) => `  {\n    slug: ${JSON.stringify(entry.slug)},\n    title: ${JSON.stringify(entry.title)},\n    price: ${entry.price},\n    quantity: ${entry.quantity},\n    materials: ${JSON.stringify(entry.materials)},\n    made: ${JSON.stringify(entry.made)},\n    description: \`${escapeTemplate(entry.description)}\`,\n    preset: ${JSON.stringify(entry.preset)},\n    node: ${JSON.stringify(entry.node)},\n    colors: ${JSON.stringify(entry.colors)},\n    mediaFiles: ${JSON.stringify(entry.mediaFiles)},\n    mediaTop: ${JSON.stringify(entry.mediaTop)},\n    mediaBottom: ${JSON.stringify(entry.mediaBottom)},\n    frames: ${JSON.stringify(entry.frames)}\n  }`).join(',\n')}\n];\n`;

await writeFile(path.join(rootDir, 'entries.js'), content);
console.log(`built ${entries.length} earring entr${entries.length === 1 ? "y" : "ies"} -> source/earrings/entries.js`);
