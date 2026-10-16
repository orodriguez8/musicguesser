/** Minúsculas, sin tildes ni signos. Si el texto no es latino (cirílico…), se conserva tal cual. */
export function normText(s: string): string {
  const latin = s
    .toLowerCase()
    .replace(/я/g, 'r')
    .replace(/ł/g, 'l')
    .replace(/ø/g, 'o')
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');
  return latin || s.toLowerCase().replace(/\s+/g, '');
}

/** Quita "(feat. X)", "[Remastered]", " - Live at…" y similares. */
export function stripExtras(s: string): string {
  return s
    .replace(/[([][^)\]]*[)\]]/g, ' ')
    .split(' - ')[0]
    .replace(/\s(feat|ft)\.?\s.*$/i, '')
    .trim();
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

export function similarity(a: string, b: string): number {
  if (!a.length && !b.length) return 1;
  return 1 - levenshtein(a, b) / Math.max(a.length, b.length);
}

/** ¿Lo que ha escrito el jugador vale como respuesta? Tolera tildes, mayúsculas y erratas pequeñas. */
export function answerMatches(input: string, accepted: string[]): boolean {
  const n = normText(stripExtras(input)).replace(/^the/, '');
  if (!n) return false;
  return accepted.some((acc) =>
    [normText(stripExtras(acc)), normText(acc)].some((raw) => {
      const m = raw.replace(/^the/, '');
      if (!m) return false;
      if (n === m) return true;
      if (m.length <= 4) return false;
      return similarity(n, m) >= 0.8;
    }),
  );
}

/** Para "Completa la letra": basta con acercarse bastante a la frase. */
export function lineMatches(input: string, line: string): boolean {
  const a = normText(input);
  const b = normText(line);
  if (a.length < 4) return false;
  return similarity(a, b) >= 0.72;
}
