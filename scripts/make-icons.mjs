// Genera los PNG de public/icons/ a partir de pwa/icon.svg y pwa/icon-maskable.svg.
// Usa Chrome o Edge en modo headless: node scripts/make-icons.mjs
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const browsers = [
  process.env.CHROME,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean);
const browser = browsers.find((b) => existsSync(b));
if (!browser) throw new Error('No encuentro Chrome ni Edge (define CHROME=<ruta>)');

const out = resolve('public/icons');
const tmp = mkdtempSync(join(tmpdir(), 'mg-icons-'));
const jobs = [
  ['pwa/icon.svg', 'icon-192.png', 192],
  ['pwa/icon.svg', 'icon-512.png', 512],
  ['pwa/icon-maskable.svg', 'icon-maskable-512.png', 512],
  ['pwa/icon-maskable.svg', 'apple-touch-icon.png', 180],
];

for (const [src, name, size] of jobs) {
  const svg = readFileSync(src, 'utf8');
  const html = join(tmp, `${name}.html`);
  writeFileSync(
    html,
    `<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`,
  );
  execFileSync(browser, [
    '--headless',
    '--disable-gpu',
    '--hide-scrollbars',
    '--default-background-color=00000000',
    `--window-size=${size},${size}`,
    `--screenshot=${join(out, name)}`,
    pathToFileURL(html).href,
  ]);
  console.log(`✓ ${name}`);
}
