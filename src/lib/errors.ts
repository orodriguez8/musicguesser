// Errores inesperados: se apuntan en Supabase (tabla client_errors) para verlos en el panel de
// administración. Anónimo: solo el id aleatorio del dispositivo, nunca datos de la cuenta.
import { deviceId } from './device';
import { supabase } from './supabase';
import { isAbort } from './util';

/** Como mucho estos avisos por visita (un bucle de errores no debe inundar la tabla). */
const MAX_PER_SESSION = 10;
let sent = 0;
const seen = new Set<string>();

/** Ruido conocido de navegadores y extensiones: no dice nada de la app. */
const NOISE = [/ResizeObserver loop/i, /^Script error\.?$/i, /Non-Error promise rejection captured/i, /chrome-extension:|moz-extension:/i];

/** Errores de red esperables (sin conexión, Deezer caído...): no son fallos de la app. */
export function isNetworkError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /failed to fetch|networkerror|network request failed|load failed|error de red|tiempo de espera|timeout|fetch failed/i.test(msg);
}

function describe(e: unknown): { message: string; stack?: string } {
  if (e instanceof Error) return { message: `${e.name}: ${e.message}`.slice(0, 500), stack: e.stack?.slice(0, 4000) };
  if (typeof e === 'string') return { message: e.slice(0, 500) };
  try {
    return { message: JSON.stringify(e).slice(0, 500) };
  } catch {
    return { message: String(e).slice(0, 500) };
  }
}

/**
 * Apunta un error. `place` dice dónde pasó (p. ej. "render", "partida:cancion") y `extra`
 * añade contexto pequeño (modo, filtro, id de canción...). Nunca lanza.
 */
export function reportError(e: unknown, place: string, extra?: Record<string, unknown>): void {
  if (isAbort(e)) return;
  const { message, stack } = describe(e);
  if (NOISE.some((re) => re.test(message) || (stack && re.test(stack)))) return;
  if (import.meta.env.DEV && import.meta.env.MODE !== 'test') console.error(`[MusicGuesser] ${place}`, e, extra ?? '');
  const key = `${place}|${message}`;
  if (seen.has(key) || sent >= MAX_PER_SESSION || !supabase) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  seen.add(key);
  sent++;
  let extraJson: Record<string, unknown> | null = null;
  try {
    extraJson = extra && JSON.stringify(extra).length <= 3500 ? extra : extra ? { truncated: true } : null;
  } catch {
    extraJson = { unserializable: true };
  }
  void supabase
    .from('client_errors')
    .insert({
      device: deviceId(),
      place: place.slice(0, 60),
      message,
      stack: stack ?? null,
      extra: extraJson,
      path: typeof location !== 'undefined' ? location.pathname.slice(0, 200) : null,
      user_agent: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 300) : null,
      app_version: __APP_VERSION__,
    })
    .then(
      () => {},
      () => {},
    );
}

/** Errores que nadie captura (fuera de React o en promesas sin catch). */
export function installGlobalErrorHandlers(): void {
  window.addEventListener('error', (ev) => {
    // Los fallos al cargar imágenes o audio también llegan aquí, sin "error": no son de la app
    if (!ev.error && !ev.message) return;
    reportError(ev.error ?? ev.message, 'global', { file: ev.filename?.slice(-120), line: ev.lineno });
  });
  window.addEventListener('unhandledrejection', (ev) => {
    if (isNetworkError(ev.reason)) return;
    reportError(ev.reason, 'promesa');
  });
}

/** Solo para los tests. */
export function resetErrorReporting(): void {
  sent = 0;
  seen.clear();
}
