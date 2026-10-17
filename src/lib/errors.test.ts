import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeFakeSupabase } from '../test/fakeSupabase';

const fake = vi.hoisted(() => ({ current: null as ReturnType<typeof makeFakeSupabase> | null }));
vi.mock('./supabase', () => ({
  get supabase() {
    return fake.current!.client;
  },
  onlineEnabled: true,
}));

const { installGlobalErrorHandlers, isNetworkError, reportError, resetErrorReporting } = await import('./errors');
const { abortError } = await import('./util');

let sb: ReturnType<typeof makeFakeSupabase>;
beforeEach(() => {
  sb = makeFakeSupabase();
  fake.current = sb;
  resetErrorReporting();
});

const sent = () => sb.inserts.filter((i) => i.table === 'client_errors').map((i) => i.row);

describe('reportError', () => {
  it('envía mensaje, pila, sitio, versión y contexto', () => {
    reportError(new TypeError('x is undefined'), 'render:game', { mode: 'cancion' });
    const [row] = sent();
    expect(row).toMatchObject({ place: 'render:game', message: 'TypeError: x is undefined', extra: { mode: 'cancion' }, app_version: 'test' });
    expect(String(row.stack)).toContain('x is undefined');
    expect(String(row.device)).toMatch(/^[a-z0-9-]{8,40}$/);
  });

  it('el mismo error no se repite y hay un tope por visita', () => {
    reportError(new Error('a'), 'p');
    reportError(new Error('a'), 'p');
    expect(sent()).toHaveLength(1);
    for (let i = 0; i < 30; i++) reportError(new Error(`e${i}`), 'p');
    expect(sent()).toHaveLength(10);
  });

  it('ignora cancelaciones y ruido de navegadores', () => {
    reportError(abortError(), 'p');
    reportError(new Error('ResizeObserver loop limit exceeded'), 'p');
    reportError('Script error.', 'p');
    expect(sent()).toHaveLength(0);
  });

  it('sin conexión no intenta enviar', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    reportError(new Error('a'), 'p');
    expect(sent()).toHaveLength(0);
  });

  it('acepta cualquier cosa como error y recorta lo largo', () => {
    reportError({ raro: true }, 'p');
    reportError('x'.repeat(2000), 'q');
    expect(sent()[0].message).toBe('{"raro":true}');
    expect(String(sent()[1].message)).toHaveLength(500);
  });

  it('el contexto enorme se sustituye por una marca', () => {
    reportError(new Error('a'), 'p', { big: 'x'.repeat(5000) });
    expect(sent()[0].extra).toEqual({ truncated: true });
  });
});

describe('isNetworkError', () => {
  it('reconoce los fallos de red típicos', () => {
    expect(isNetworkError(new TypeError('Failed to fetch'))).toBe(true);
    expect(isNetworkError(new Error('Tiempo de espera agotado'))).toBe(true);
    expect(isNetworkError('Load failed')).toBe(true);
    expect(isNetworkError(new Error('x is undefined'))).toBe(false);
  });
});

describe('errores sin capturar', () => {
  it('window.onerror y promesas sin catch llegan al aviso', () => {
    installGlobalErrorHandlers();
    window.dispatchEvent(new ErrorEvent('error', { error: new Error('boom'), message: 'boom' }));
    const rej = new Event('unhandledrejection') as Event & { reason?: unknown };
    rej.reason = new Error('promesa rota');
    window.dispatchEvent(rej);
    // Los fallos de red en promesas no son errores de la app
    const net = new Event('unhandledrejection') as Event & { reason?: unknown };
    net.reason = new TypeError('Failed to fetch');
    window.dispatchEvent(net);
    expect(sent().map((r) => r.place)).toEqual(['global', 'promesa']);
  });
});
