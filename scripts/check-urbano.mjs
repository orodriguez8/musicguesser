// Revisa la base de datos del urbano (src/data/urbano.json) y avisa de lo que huele mal:
// referencias rotas, canciones repetidas, recopilatorios, ediciones duplicadas, posibles
// homónimos... Lo llama `npm run urbano` al terminar; también se puede lanzar solo con
// `npm run check:data`. Sale con error solo si hay fallos graves (datos rotos).
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const norm = (s) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[([][^)\]]*[)\]]/g, ' ')
    .split(' - ')[0]
    .replace(/\s(feat|ft)\.?\s.*$/, '')
    .replace(/[^a-z0-9]/g, '');

const COMPILATION =
  /\b(exitos|éxitos|greatest|hits|best of|lo mejor|remix|remixes|remixpilation|en vivo|live|unplugged|symphonic|instrumental|karaoke|track by track|commentary|collection|anniversary)\b/i;

/** Devuelve { errors, warnings } con mensajes listos para imprimir. */
export function checkUrbano(db) {
  const errors = [];
  const warnings = {};
  const warn = (kind, msg) => (warnings[kind] ??= []).push(msg);
  const artist = new Map(db.artists.map((a) => [a.id, a]));
  const album = new Map(db.albums.map((a) => [a.id, a]));
  const name = (id) => artist.get(id)?.n ?? `#${id}`;
  const thisYear = new Date().getFullYear();

  // ---- Fallos graves: referencias rotas y datos vacíos
  for (const a of db.artists) {
    if (!a.n?.trim()) errors.push(`Artista ${a.id} sin nombre`);
    if (!a.g) errors.push(`${a.n}: sin género`);
  }
  for (const al of db.albums) {
    if (!artist.has(al.a)) errors.push(`Disco "${al.t}" (${al.id}) de un artista que no existe (${al.a})`);
    if (!al.t?.trim()) errors.push(`Disco ${al.id} sin título`);
  }
  const ids = new Set();
  for (const t of db.tracks) {
    if (ids.has(t.id)) errors.push(`Canción repetida con el mismo id: ${t.id} "${t.t}"`);
    ids.add(t.id);
    if (!artist.has(t.a)) errors.push(`Canción "${t.t}" (${t.id}) de un artista que no existe (${t.a})`);
    if (!t.t?.trim()) errors.push(`Canción ${t.id} sin título`);
    if (t.al && !album.has(t.al)) warn('Canciones con disco desconocido', `${name(t.a)}: "${t.t}" → disco ${t.al}`);
    if (typeof t.y !== 'number' || t.y < 1985 || t.y > thisYear + 1) warn('Años raros', `${name(t.a)}: "${t.t}" (${t.y})`);
  }

  // ---- Avisos: cosas que conviene revisar a mano
  for (const a of db.artists) if (!a.e?.length) warn('Artistas sin época', a.n);

  const songs = new Map();
  for (const t of db.tracks) {
    const k = `${t.a}|${norm(t.t)}`;
    songs.set(k, [...(songs.get(k) ?? []), t]);
  }
  for (const list of songs.values())
    if (list.length > 1) warn('Canciones repetidas (mismo artista y título)', `${name(list[0].a)}: ${list.map((t) => `"${t.t}"`).join(' / ')}`);

  const perArtist = new Map();
  for (const t of db.tracks) perArtist.set(t.a, (perArtist.get(t.a) ?? 0) + 1);
  for (const a of db.artists) if ((perArtist.get(a.id) ?? 0) < 10) warn('Artistas con menos de 10 canciones', `${a.n} (${perArtist.get(a.id) ?? 0})`);

  // Sin tildes: \b no ve la "É" de "Éxitos" como letra
  const plain = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
  for (const al of db.albums) if (COMPILATION.test(plain(al.t))) warn('Recopilatorios, remixes o directos', `${name(al.a)}: ${al.t}`);

  const byTitle = new Map();
  for (const al of db.albums) {
    const k = `${al.a}|${norm(al.t.replace(/\b(deluxe|edition|edición|expanded|reloaded)\b/gi, ''))}`;
    if (!k.endsWith('|')) byTitle.set(k, [...(byTitle.get(k) ?? []), al]);
  }
  for (const list of byTitle.values())
    if (list.length > 1) warn('Ediciones del mismo disco', `${name(list[0].a)}: ${list.map((a) => a.t).join(' / ')}`);

  // Posibles homónimos: discos muy poco escuchados sin ninguna canción conocida del artista
  const titles = new Map();
  for (const t of db.tracks) titles.set(t.a, (titles.get(t.a) ?? new Set()).add(norm(t.t)));
  const top = new Map();
  for (const al of db.albums) top.set(al.a, Math.max(top.get(al.a) ?? 0, al.f));
  for (const al of db.albums) {
    const known = al.tr.some((t) => titles.get(al.a)?.has(norm(t)));
    if (!known && al.f < 200 && al.f < (top.get(al.a) ?? 0) * 0.01)
      warn('¿Homónimos? (discos sin canciones conocidas y casi sin fans)', `${name(al.a)}: ${al.t} (${al.y}, ${al.f} fans, id ${al.id})`);
  }

  return { errors, warnings };
}

export function printReport({ errors, warnings }, max = 12) {
  console.log('\n===== Revisión de la base de datos del urbano =====');
  for (const [kind, list] of Object.entries(warnings)) {
    console.log(`\n⚠ ${kind}: ${list.length}`);
    for (const m of list.slice(0, max)) console.log(`   · ${m}`);
    if (list.length > max) console.log(`   … y ${list.length - max} más`);
  }
  if (errors.length) {
    console.log(`\n✖ Fallos graves: ${errors.length}`);
    for (const m of errors.slice(0, 50)) console.log(`   · ${m}`);
  } else console.log('\n✔ Sin fallos graves.');
}

// Ejecutado directamente: node scripts/check-urbano.mjs [--all]
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const db = JSON.parse(await readFile(join(root, 'src', 'data', 'urbano.json'), 'utf8'));
  const report = checkUrbano(db);
  printReport(report, process.argv.includes('--all') ? Infinity : 12);
  process.exit(report.errors.length ? 1 : 0);
}
