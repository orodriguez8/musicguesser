export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function shuffle<T>(arr: readonly T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function sample<T>(arr: readonly T[]): T | undefined {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function uniqueBy<T>(arr: readonly T[], key: (x: T) => string | number): T[] {
  const seen = new Set<string | number>();
  return arr.filter((x) => {
    const k = key(x);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export function range(from: number, to: number): number[] {
  const out: number[] = [];
  for (let i = from; i < to; i++) out.push(i);
  return out;
}

export function nonNull<T>(x: T | null | undefined): x is T {
  return x != null;
}

/** 8420 → "8.420" (Intl en español no agrupa números de 4 cifras). */
export function fmtInt(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

export function fmtFans(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace('.', ',')} M fans`;
  if (n >= 1_000) return `${Math.round(n / 1_000)} mil fans`;
  return `${n} fans`;
}

export function fmtDecimal(n: number, digits = 1): string {
  return n.toFixed(digits).replace('.', ',');
}

export function abortError(): Error {
  return new DOMException('Cancelado', 'AbortError');
}

export function isAbort(e: unknown): boolean {
  return e instanceof DOMException && e.name === 'AbortError';
}

/** Ejecuta `fn` sobre todos los elementos con `limit` en paralelo, conservando el orden. */
export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, i: number) => Promise<R>,
): Promise<R[]> {
  const out: R[] = Array.from({ length: items.length });
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

/** Recorre `items` en paralelo hasta reunir `need` resultados no nulos. */
export async function collect<T, R>(
  items: readonly T[],
  limit: number,
  need: number,
  fn: (item: T) => Promise<R | null>,
  signal?: AbortSignal,
): Promise<R[]> {
  const out: R[] = [];
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length && out.length < need) {
      if (signal?.aborted) return;
      const item = items[next++];
      try {
        const r = await fn(item);
        if (r != null && out.length < need) out.push(r);
      } catch {
        /* se salta ese elemento */
      }
    }
  });
  await Promise.all(workers);
  if (signal?.aborted) throw abortError();
  return out;
}
