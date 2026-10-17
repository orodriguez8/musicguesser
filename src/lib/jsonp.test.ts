import { afterEach, describe, expect, it, vi } from 'vitest';
import { jsonp } from './jsonp';

afterEach(() => vi.useRealTimers());

const lastScript = () => [...document.head.querySelectorAll('script')].at(-1)!;
const callbackName = (s: HTMLScriptElement) => new URL(s.src).searchParams.get('callback')!;

describe('jsonp', () => {
  it('añade output=jsonp y resuelve con lo que llega al callback', async () => {
    const p = jsonp<{ ok: boolean }>('https://api.example/x?a=1');
    const s = lastScript();
    expect(s.src).toContain('a=1&output=jsonp&callback=');
    (window as unknown as Record<string, (d: unknown) => void>)[callbackName(s)]({ ok: true });
    await expect(p).resolves.toEqual({ ok: true });
    expect(s.isConnected).toBe(false);
  });

  it('falla si el script no carga', async () => {
    const p = jsonp('https://api.example/y');
    lastScript().onerror?.(new Event('error'));
    await expect(p).rejects.toThrow('Error de red');
  });

  it('falla por tiempo y no revienta si la respuesta llega tarde', async () => {
    vi.useFakeTimers();
    const p = jsonp('https://api.example/z', 1000);
    const name = callbackName(lastScript());
    vi.advanceTimersByTime(1001);
    await expect(p).rejects.toThrow('Tiempo de espera');
    expect(() => (window as unknown as Record<string, () => void>)[name]()).not.toThrow();
  });
});
