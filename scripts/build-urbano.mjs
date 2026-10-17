// Genera src/data/urbano.json: discos, canciones, años, colaboraciones y datos de los artistas urbanos.
// Uso: npm run urbano   (la primera vez tarda ~20 min; guarda las respuestas en scripts/.cache)
// Correcciones a mano en scripts/urbano-overrides.json.
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cacheDir = join(root, 'scripts', '.cache');
const outPath = join(root, 'src', 'data', 'urbano.json');
const catalog = JSON.parse(await readFile(join(root, 'src', 'data', 'catalog.json'), 'utf8'));
const overrides = JSON.parse(await readFile(join(root, 'scripts', 'urbano-overrides.json'), 'utf8').catch(() => '{}'));

const URBANO_GENRES = ['reggaeton', 'trap-es'];
const NOW = new Date().getFullYear();
/** Canciones por artista como máximo (las más escuchadas). */
const MAX_TRACKS = 150;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const norm = (s) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');

// ---------- Peticiones con caché en disco ----------

async function cached(url, fetcher, maxAgeDays = 30) {
  const file = join(cacheDir, createHash('md5').update(url).digest('hex') + '.json');
  try {
    const { at, data } = JSON.parse(await readFile(file, 'utf8'));
    if (Date.now() - at < maxAgeDays * 864e5) return data;
  } catch {}
  const data = await fetcher(url);
  if (data != null) await writeFile(file, JSON.stringify({ at: Date.now(), url, data }));
  return data;
}

function limiter(maxActive, gapMs) {
  let active = 0;
  let last = 0;
  const queue = [];
  const pump = () => {
    if (!queue.length || active >= maxActive) return;
    const wait = last + gapMs - Date.now();
    if (wait > 0) return void setTimeout(pump, wait);
    active++;
    last = Date.now();
    queue.shift()();
    pump();
  };
  return async (fn) => {
    await new Promise((r) => {
      queue.push(r);
      pump();
    });
    try {
      return await fn();
    } finally {
      active--;
      pump();
    }
  };
}

const dzSlot = limiter(4, 120);
const mbSlot = limiter(1, 1100);

function dz(path) {
  return cached(`https://api.deezer.com${path}`, async (url) => {
    for (let i = 0; i < 5; i++) {
      try {
        const r = await dzSlot(() => fetch(url));
        if (r.ok) {
          const d = await r.json();
          if (!d.error) return d;
          if (d.error.code === 800) return null; // no existe
        }
      } catch {}
      await sleep(1500 * (i + 1));
    }
    return null;
  });
}

function mb(path) {
  return cached(`https://musicbrainz.org/ws/2${path}`, async (url) => {
    for (let i = 0; i < 6; i++) {
      try {
        const r = await mbSlot(() => fetch(url, { headers: { 'User-Agent': 'MusicGuesser/0.2 (github.com/orodriguez8/musicguesser)' } }));
        if (r.ok) return await r.json();
        if (r.status === 404) return null;
      } catch {}
      await sleep(2500 * (i + 1));
    }
    return null;
  });
}

async function mapLimit(items, n, fn) {
  const out = Array.from({ length: items.length });
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i], i);
      }
    }),
  );
  return out;
}

// ---------- Limpieza de títulos ----------

const JUNK = /\b(live|en vivo|en directo|sped ?up|slowed|reverb|acoustic|ac[uú]stic[oa]?|instrumental|karaoke|8d|nightcore|demo|a ?cappella|rehearsal|mashup|bootleg|version mix|reggaeton mix|clean|radio edit|mixed)\b/i;
const LEADING_JUNK = /^(intro|outro|interlude|interludio|skit|prelude|preludio)\b/i;
const REMIX = /\b(remix|rmx)\b/i;
const BAD_ALBUM =
  /\b(greatest|best of|hits|collection|anthology|essentials?|live|en vivo|en directo|gold|platinum|soundtrack|b\.?s\.?o|compilation|recopilatorio|karaoke|instrumentals?|sped up|slowed)\b/i;

/** "Tu No Vive Asi (feat. Mambo Kingz & DJ Luian) - Remix" → { base: "Tu No Vive Asi", feats: [...], remix: true } */
function parseTitle(t) {
  const raw = t.title_short || t.title;
  const full = [t.title, t.title_version ?? ''].join(' ');
  const feats = [];
  for (const m of full.matchAll(/[([](?:feat|ft|with|con)\.?\s([^)\]]+)[)\]]/gi)) feats.push(...splitNames(m[1]));
  let base = raw
    .replace(/\s*[([](?:feat|ft|with|con)\.?\s[^)\]]*[)\]]/gi, '')
    .replace(/\s*[([][^)\]]*\b(remix|rmx)\b[^)\]]*[)\]]/gi, '')
    .replace(/\s+-\s+.*\b(remix|rmx)\b.*$/i, '')
    .replace(/\s+\b(remix|rmx)\b\s*$/i, '')
    .replace(/\s*[([](?:remaster(?:ed)?|explicit|original mix)[^)\]]*[)\]]/gi, '')
    .trim();
  if (!base) base = raw.trim();
  return { base, feats, remix: REMIX.test(full) };
}

function splitNames(s) {
  return s
    .split(/\s*(?:,|&|\by\b|\band\b|\bx\b)\s*/i)
    .map((x) => x.trim())
    .filter((x) => x.length > 1);
}

function cleanAlbum(title) {
  return (
    title
      .replace(/\s*[([][^)\]]*\b(deluxe|edition|edici[oó]n|version|versi[oó]n|bonus|remaster(ed)?|expanded|special|explicit|reloaded)\b[^)\]]*[)\]]/gi, '')
      .replace(/\s+-\s+.*\b(deluxe|edition|version|bonus|remaster(ed)?)\b.*$/i, '')
      .trim() || title
  );
}

const yearOf = (date) => {
  const y = Number(String(date ?? '').slice(0, 4));
  return y >= 1985 && y <= NOW ? y : null;
};
const minYear = (...ys) => {
  const v = ys.filter((y) => y != null);
  return v.length ? Math.min(...v) : null;
};

// ---------- MusicBrainz: fechas originales y datos del artista ----------

const LATIN = new Set(['PR', 'CO', 'ES', 'AR', 'PA', 'VE', 'DO', 'MX', 'CL', 'US', 'CU', 'PE', 'EC', 'UY', 'MA', 'FR']);

async function releaseGroups(mbid) {
  const out = [];
  for (let offset = 0; offset < 1000; offset += 100) {
    const d = await mb(`/release-group?artist=${mbid}&limit=100&offset=${offset}&fmt=json`);
    const rgs = d?.['release-groups'] ?? [];
    out.push(...rgs);
    if (rgs.length < 100) break;
  }
  return out
    .filter((rg) => !(rg['secondary-types'] ?? []).some((s) => ['Compilation', 'Live', 'Remix', 'DJ-mix'].includes(s)))
    .map((rg) => ({ key: norm(parseTitle({ title: cleanAlbum(rg.title) }).base), type: rg['primary-type'], year: yearOf(rg['first-release-date']) }))
    .filter((rg) => rg.key && rg.year);
}

/** "Angel y Khriz" = "Angel & Khriz" = "Angel and Khriz" */
const normName = (s) => norm(s.replace(/\s+(?:&|y|and|e)\s+/gi, ' '));

/**
 * Primer lanzamiento de cada canción del artista (por título). Deezer pone a muchas canciones
 * antiguas la fecha de una reedición; MusicBrainz sabe cuándo salió de verdad.
 */
async function recordingYears(mbid) {
  const years = new Map();
  for (let offset = 0; offset < 3000; offset += 100) {
    const d = await mb(`/recording?query=${encodeURIComponent(`arid:${mbid}`)}&limit=100&offset=${offset}&fmt=json`);
    const recs = d?.recordings ?? [];
    for (const r of recs) {
      const y = yearOf(r['first-release-date']);
      const key = norm(parseTitle({ title: r.title }).base);
      if (y && key) years.set(key, Math.min(years.get(key) ?? 9999, y));
    }
    if (recs.length < 100 || offset + 100 >= (d?.count ?? 0)) break;
  }
  return years;
}

/** Busca al artista en MusicBrainz y lo da por bueno si sus discos coinciden con los de Deezer. */
async function mbArtist(name, deezerKeys) {
  const query = name.replace(/"/g, '').replace(/\s+(?:&|y)\s+/gi, ' ');
  const d = await mb(`/artist?query=${encodeURIComponent(`artist:(${query})`)}&fmt=json&limit=15`);
  const cands = (d?.artists ?? [])
    .filter((a) => a.score >= 60 && normName(a.name) === normName(name))
    .sort((a, b) => Number(LATIN.has(b.country)) - Number(LATIN.has(a.country)) || b.score - a.score)
    .slice(0, 3);
  for (const a of cands) {
    const rgs = await releaseGroups(a.id);
    const hits = rgs.filter((rg) => deezerKeys.has(rg.key)).length;
    if (hits >= Math.min(3, deezerKeys.size)) {
      return {
        id: a.id,
        rgs,
        country: a.country ?? a.area?.['iso-3166-1-codes']?.[0] ?? null,
        area: a.area?.name ?? null,
        gender: a.gender ? a.gender.toLowerCase() : null,
        born: yearOf(a['life-span']?.begin),
      };
    }
  }
  return null;
}

// ---------- Por artista ----------

const people = new Map(); // id → nombre de todos los que aparecen (también colaboradores de fuera)
const catalogIds = new Set();
const stats = { mbMiss: [], noEra: [] };
const eraOverrides = new Map(Object.entries(overrides.eras ?? {}).map(([name, eras]) => [norm(name), eras]));

async function buildArtist(a, genreId) {
  // Algunos artistas tienen el catálogo repartido en varios perfiles de Deezer (overrides.aliases)
  const ids = [a.id, ...(overrides.aliases?.[a.id] ?? [])];
  const [top, ...albumLists] = await Promise.all([
    dz(`/artist/${a.id}/top?limit=100`),
    ...ids.map((id) => dz(`/artist/${id}/albums?limit=500`)),
  ]);
  const releases = albumLists
    .flatMap((l) => l?.data ?? [])
    .filter((al) => al.record_type !== 'compile' && !BAD_ALBUM.test(al.title));
  const fulls = (
    await mapLimit(releases, 4, async (al) => {
      const full = await dz(`/album/${al.id}`);
      if (!full) return null;
      if ((full.tracks?.data?.length ?? 0) < full.nb_tracks) {
        const more = await dz(`/album/${al.id}/tracks?limit=300`);
        if (more?.data) full.tracks.data = more.data;
      }
      return full;
    })
  ).filter(Boolean);

  // Colaboraciones exactas de las canciones más escuchadas
  const topContrib = new Map();
  for (const t of top?.data ?? []) {
    topContrib.set(t.id, (t.contributors ?? []).map((c) => (people.set(c.id, c.name), c.id)));
    people.set(t.artist.id, t.artist.name);
  }

  // Canciones agrupadas por título base (original + remix + reediciones = una sola canción)
  const groups = new Map();
  const addTrack = (t, album, kind) => {
    if (t.readable === false || !t.preview || !ids.includes(t.artist?.id)) return;
    if (JUNK.test([t.title, t.title_version ?? ''].join(' '))) return;
    const { base, feats, remix } = parseTitle(t);
    if (!base || LEADING_JUNK.test(base)) return;
    const key = norm(base);
    if (!key) return;
    let g = groups.get(key);
    if (!g) groups.set(key, (g = { key, title: base, versions: [], dzYears: [], feats: new Set(), featNames: new Set() }));
    g.versions.push({ id: t.id, rank: t.rank ?? 0, remix, albumId: album?.id ?? t.album?.id, kind });
    const y = yearOf(album?.release_date ?? t.album?.release_date);
    if (y) g.dzYears.push(y);
    for (const id of topContrib.get(t.id) ?? []) if (!ids.includes(id)) g.feats.add(id);
    for (const n of feats) g.featNames.add(n);
  };
  for (const al of fulls) for (const t of al.tracks?.data ?? []) addTrack(t, al, al.record_type);
  for (const t of top?.data ?? []) addTrack(t, null, 'top');

  // Discos (sin ediciones repetidas: nos quedamos con la que más fans tiene)
  const albumGroups = new Map();
  for (const al of fulls) {
    if (al.record_type !== 'album' && al.record_type !== 'ep') continue;
    const title = cleanAlbum(al.title);
    const key = norm(parseTitle({ title }).base);
    const prev = albumGroups.get(key);
    const y = yearOf(al.release_date);
    if (!prev || (al.fans ?? 0) > (prev.al.fans ?? 0)) albumGroups.set(key, { key, title, al, years: [...(prev?.years ?? []), y] });
    else prev.years.push(y);
  }

  // Fechas originales (MusicBrainz) para corregir las reediciones de Deezer
  const deezerKeys = new Set([...albumGroups.keys(), ...groups.keys()]);
  const mbInfo = await mbArtist(a.name, deezerKeys);
  if (!mbInfo) stats.mbMiss.push(a.name);
  const mbYear = new Map();
  for (const rg of mbInfo?.rgs ?? []) mbYear.set(rg.key, Math.min(mbYear.get(rg.key) ?? 9999, rg.year));
  // Veteranos: además, el año de cada canción (las reediciones les cambian la fecha en Deezer)
  const firstYear = Math.min(...(mbInfo?.rgs ?? []).map((rg) => rg.year));
  if (mbInfo && firstYear <= 2014) {
    for (const [key, y] of await recordingYears(mbInfo.id)) mbYear.set(key, Math.min(mbYear.get(key) ?? 9999, y));
  }

  const albums = [...albumGroups.values()]
    .map(({ key, title, al, years }) => {
      const tracks = (al.tracks?.data ?? []).filter((t) => !JUNK.test(t.title)).map((t) => parseTitle(t).base);
      const feats = new Map();
      for (const c of al.contributors ?? []) if (c.id !== a.id) {
        people.set(c.id, c.name);
        feats.set(norm(c.name), c.name);
      }
      for (const t of al.tracks?.data ?? []) {
        for (const id of topContrib.get(t.id) ?? []) if (id !== a.id) feats.set(norm(people.get(id)), people.get(id));
        for (const n of parseTitle(t).feats) feats.set(norm(n), feats.get(norm(n)) ?? n);
      }
      feats.delete(norm(a.name));
      const year = overrides.albums?.[`${a.id}:${title}`] ?? minYear(mbYear.get(key), ...years);
      return {
        id: al.id,
        a: a.id,
        t: title,
        y: year,
        k: al.record_type,
        m: al.md5_image,
        f: al.fans ?? 0,
        tr: [...new Set(tracks)],
        ft: [...feats.values()],
        _keys: new Set(tracks.map(norm)),
      };
    })
    .filter((al) => al.tr.length >= 3);

  const tracks = [...groups.values()]
    .map((g) => {
      // Versión que suena en el juego: la original más escuchada (el remix solo si es mucho más famoso)
      const orig = g.versions.filter((v) => !v.remix).sort((x, y) => y.rank - x.rank)[0];
      const remix = g.versions.filter((v) => v.remix).sort((x, y) => y.rank - x.rank)[0];
      const pick = !orig || (remix && remix.rank > orig.rank * 2) ? remix : orig;
      const rank = Math.max(...g.versions.map((v) => v.rank));
      const albumYears = albums.filter((al) => al._keys.has(g.key)).map((al) => al.y);
      const year =
        overrides.tracks?.[`${a.id}:${g.title}`] ?? minYear(mbYear.get(g.key), ...albumYears, ...g.dzYears);
      const album = albums.find((al) => al._keys.has(g.key) && al.y === minYear(...albumYears));
      return {
        id: pick.id,
        a: a.id,
        t: g.title,
        y: year,
        r: rank,
        ...(album ? { al: album.id } : {}),
        ...(g.feats.size ? { ft: [...g.feats] } : {}),
        ...(!g.feats.size && g.featNames.size ? { fn: [...g.featNames] } : {}),
      };
    })
    .filter((t) => t.y)
    .sort((x, y) => y.r - x.r)
    .slice(0, MAX_TRACKS);

  for (const al of albums) delete al._keys;
  const years = [...albums.map((al) => al.y), ...tracks.map((t) => t.y)].filter(Boolean);
  const artistInfo = {
    id: a.id,
    n: a.name,
    p: a.picture.match(/artist\/([0-9a-f]+)\//)?.[1] ?? '',
    g: genreId,
    f: a.fans ?? 0,
    ...(a.type ? { ty: a.type } : {}),
    ...(mbInfo?.country ? { c: mbInfo.country } : {}),
    ...(mbInfo?.gender && mbInfo.gender !== 'not applicable' ? { s: mbInfo.gender } : {}),
    ...(mbInfo?.born ? { b: mbInfo.born } : {}),
    d: overrides.debut?.[a.id] ?? (years.length ? Math.min(...years) : null),
    na: albums.filter((al) => al.k === 'album').length,
    // Época(s) del artista, puestas a mano en urbano-overrides.json
    ...(eraOverrides.get(norm(a.name)) ? { e: eraOverrides.get(norm(a.name)) } : {}),
  };
  if (!artistInfo.e) stats.noEra.push(a.name);
  return { artist: artistInfo, albums, tracks };
}

// ---------- Principal ----------

await mkdir(cacheDir, { recursive: true });
const out = { generatedAt: new Date().toISOString(), artists: [], albums: [], tracks: [], people: {} };
const seenTracks = new Set();
const allUrban = catalog.genres.filter((g) => URBANO_GENRES.includes(g.id)).flatMap((g) => g.artists.map((a) => ({ a, genreId: g.id })));
allUrban.forEach(({ a }) => catalogIds.add(a.id));
// Prueba rápida: node scripts/build-urbano.mjs "Daddy Yankee" "Feid"  (no guarda nada en src/)
const only = process.argv.slice(2).map(norm);
const urbanArtists = only.length ? allUrban.filter(({ a }) => only.includes(norm(a.name))) : allUrban;

for (const [i, { a, genreId }] of urbanArtists.entries()) {
  const t0 = Date.now();
  const r = await buildArtist(a, genreId);
  out.artists.push(r.artist);
  out.albums.push(...r.albums);
  for (const t of r.tracks) if (!seenTracks.has(t.id)) {
      seenTracks.add(t.id);
      out.tracks.push(t);
    }
  const eras = { v: 0, i: 0, n: 0 };
  for (const t of r.tracks) eras[t.y <= 2012 ? 'v' : t.y <= 2020 ? 'i' : 'n']++;
  console.log(
    `${String(i + 1).padStart(3)}/${urbanArtists.length} ${a.name.padEnd(24)} ${String(r.tracks.length).padStart(3)} canciones ${String(r.albums.length).padStart(3)} discos  ` +
      `vieja ${eras.v} · intermedia ${eras.i} · nueva ${eras.n}  ${r.artist.c ?? '¿?'} debut ${r.artist.d}  (${((Date.now() - t0) / 1000).toFixed(0)} s)`,
  );
}

// Solo guardamos nombres de los colaboradores que salen en alguna canción
const usedPeople = new Set(out.tracks.flatMap((t) => t.ft ?? []));
for (const id of usedPeople) if (!catalogIds.has(id) && people.has(id)) out.people[id] = people.get(id);

if (only.length) {
  await writeFile(join(cacheDir, 'preview.json'), JSON.stringify(out, null, 1));
  console.log(`\nPrueba guardada en ${join(cacheDir, 'preview.json')}`);
  process.exit(0);
}
await writeFile(outPath, JSON.stringify(out) + '\n', 'utf8');
const kb = (JSON.stringify(out).length / 1024).toFixed(0);
console.log(`\nGuardado en ${outPath}: ${out.artists.length} artistas, ${out.albums.length} discos, ${out.tracks.length} canciones (${kb} KB)`);
if (stats.noEra.length) console.log(`\nSin época asignada (añádelos en urbano-overrides.json): ${stats.noEra.join(', ')}`);
if (stats.mbMiss.length) console.log(`\nSin datos de MusicBrainz (años solo de Deezer): ${stats.mbMiss.join(', ')}`);

// Revisión de calidad: avisa de duplicados, recopilatorios, homónimos...
const { checkUrbano, printReport } = await import('./check-urbano.mjs');
printReport(checkUrbano(out));
