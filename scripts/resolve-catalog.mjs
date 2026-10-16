// Resuelve cada artista de catalog-source.json a su ID de Deezer y genera src/data/catalog.json.
// Uso: npm run catalog
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = join(root, 'scripts', 'catalog-source.json');
const outPath = join(root, 'src', 'data', 'catalog.json');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const norm = (s) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l').replace(/[^a-z0-9]/g, '');

async function getJson(url, tries = 4) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) {
        const data = await r.json();
        if (!data.error) return data;
      }
    } catch {}
    await sleep(1200 * (i + 1));
  }
  return null;
}

async function resolve(entry) {
  const [name, forcedId] = entry.split('#');
  if (forcedId) {
    const a = await getJson(`https://api.deezer.com/artist/${forcedId}`);
    return a ? { id: a.id, name: a.name, picture: a.picture_medium, fans: a.nb_fan } : null;
  }
  const s = await getJson(`https://api.deezer.com/search/artist?q=${encodeURIComponent(name)}&limit=15`);
  const cands = (s?.data ?? []).filter((a) => norm(a.name) === norm(name));
  if (!cands.length) return null;
  const a = cands.sort((x, y) => y.nb_fan - x.nb_fan)[0];
  return { id: a.id, name: a.name, picture: a.picture_medium, fans: a.nb_fan };
}

const source = JSON.parse(await readFile(sourcePath, 'utf8'));
const out = { generatedAt: new Date().toISOString(), genres: [] };
const problems = [];

for (const g of source.genres) {
  console.log(`\n### ${g.label}`);
  const artists = [];
  for (const entry of g.artists) {
    const a = await resolve(entry);
    if (!a) {
      problems.push(`${g.label}: "${entry}" no encontrado`);
      console.log(`  ✗ ${entry}`);
      continue;
    }
    const top = await getJson(`https://api.deezer.com/artist/${a.id}/top?limit=3`);
    const sample = (top?.data ?? []).map((t) => t.title).join(' | ');
    console.log(`  ✓ ${a.name.padEnd(26)} id=${String(a.id).padEnd(10)} fans=${String(a.fans).padEnd(8)} ${sample}`);
    artists.push(a);
    await sleep(150);
  }
  out.genres.push({ id: g.id, label: g.label, family: g.family, artists });
}

await mkdir(dirname(outPath), { recursive: true });
await writeFile(outPath, JSON.stringify(out, null, 1) + '\n', 'utf8');
console.log(`\nGuardado en ${outPath}`);
if (problems.length) console.log('\nRevisar:\n' + problems.join('\n'));
