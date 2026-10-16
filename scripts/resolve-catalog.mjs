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

async function resolve(raw) {
  // Formato: "Nombre", "Nombre#idDeezer", y opcionalmente "|group" o "|person" para fijar el tipo
  const [entry, forcedType] = raw.split('|');
  const a = await resolveId(entry);
  if (a && (forcedType === 'group' || forcedType === 'person')) a.forcedType = forcedType;
  return a;
}

async function resolveId(entry) {
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

// ¿Grupo o solista? Deezer no lo sabe; MusicBrainz sí (1 petición por segundo como máximo).
const FAMILY_TAGS = {
  urbano: ['reggaeton', 'latin', 'trap', 'urbano', 'hip hop', 'rap', 'dembow'],
  metal: ['metal', 'core', 'grind', 'thrash', 'death', 'black', 'hardcore'],
  otros: ['pop', 'rock', 'hip hop', 'rap', 'alternative', 'grunge', 'punk'],
};

async function artistType(name, family) {
  await sleep(1150);
  const url = `https://musicbrainz.org/ws/2/artist?query=${encodeURIComponent(`artist:"${name.replace(/"/g, '')}"`)}&fmt=json&limit=8`;
  for (let i = 0; i < 4; i++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'MusicGuesser/0.1 (github.com/orodriguez8/musicguesser)' } });
      if (r.status === 503) {
        await sleep(2500);
        continue;
      }
      if (!r.ok) return null;
      const d = await r.json();
      const exact = (d.artists ?? []).filter((a) => a.score >= 85 && norm(a.name) === norm(name) && a.type);
      if (!exact.length) return null;
      const keywords = FAMILY_TAGS[family] ?? [];
      const ranked = exact
        .map((a) => ({ a, hits: (a.tags ?? []).filter((t) => keywords.some((k) => t.name.includes(k))).length }))
        .sort((x, y) => y.hits - x.hits || y.a.score - x.a.score);
      const t = ranked[0].a.type;
      return t === 'Person' ? 'person' : ['Group', 'Orchestra', 'Choir'].includes(t) ? 'group' : null;
    } catch {
      await sleep(2000);
    }
  }
  return null;
}

// Reutiliza los tipos ya conocidos para no repetir consultas
const previousTypes = new Map();
try {
  const prev = JSON.parse(await readFile(outPath, 'utf8'));
  for (const g of prev.genres) for (const a of g.artists) if (a.type) previousTypes.set(a.id, a.type);
} catch {}

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
    a.type = a.forcedType ?? previousTypes.get(a.id) ?? (await artistType(a.name, g.family));
    delete a.forcedType;
    if (!a.type) delete a.type;
    const kind = a.type === 'group' ? 'grupo' : a.type === 'person' ? 'solista' : '¿?';
    console.log(`  ✓ ${a.name.padEnd(26)} id=${String(a.id).padEnd(10)} ${kind.padEnd(8)} ${sample}`);
    artists.push(a);
    await sleep(150);
  }
  out.genres.push({ id: g.id, label: g.label, family: g.family, artists });
}

await mkdir(dirname(outPath), { recursive: true });
await writeFile(outPath, JSON.stringify(out, null, 1) + '\n', 'utf8');
console.log(`\nGuardado en ${outPath}`);
if (problems.length) console.log('\nRevisar:\n' + problems.join('\n'));
