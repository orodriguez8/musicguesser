import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

type SubscribeCb = (status: string) => void;
const chan = vi.hoisted(() => ({
  cb: null as SubscribeCb | null,
  state: 'joining',
  presence: {} as Record<string, unknown[]>,
  syncHandler: null as (() => void) | null,
}));

vi.mock('../lib/supabase', () => {
  const channel = {
    on: vi.fn((type: string, _filter: unknown, fn: () => void) => {
      if (type === 'presence') chan.syncHandler = fn;
      return channel;
    }),
    subscribe: vi.fn((cb: SubscribeCb) => {
      chan.cb = cb;
      return channel;
    }),
    track: vi.fn(async () => 'ok'),
    untrack: vi.fn(async () => 'ok'),
    send: vi.fn(),
    presenceState: () => chan.presence,
    get state() {
      return chan.state;
    },
  };
  return { supabase: { channel: vi.fn(() => channel), removeChannel: vi.fn() }, onlineEnabled: true };
});

const { useRoom, MAX_PLAYERS } = await import('./room');
const me = { id: 'me', username: 'pepe', avatar: 'note' };

describe('useRoom', () => {
  it('entra, se corta, avisa y vuelve a entrar', async () => {
    const { result } = renderHook(() => useRoom('ABCDE', me, true));
    expect(result.current.status).toBe('connecting');
    await act(async () => chan.cb!('SUBSCRIBED'));
    expect(result.current.status).toBe('joined');
    await act(async () => chan.cb!('CHANNEL_ERROR'));
    expect(result.current.status).toBe('reconnecting');
    await act(async () => chan.cb!('SUBSCRIBED'));
    expect(result.current.status).toBe('joined');
  });

  it('si no consigue entrar nunca, es un error', async () => {
    const { result } = renderHook(() => useRoom('ABCDE', me, true));
    await act(async () => chan.cb!('TIMED_OUT'));
    expect(result.current.status).toBe('error');
  });

  it('el móvil sin red pasa a "reconectando" al momento', async () => {
    const { result } = renderHook(() => useRoom('ABCDE', me, true));
    await act(async () => chan.cb!('SUBSCRIBED'));
    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    expect(result.current.status).toBe('reconnecting');
    chan.state = 'joined';
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    expect(result.current.status).toBe('joined');
  });

  it('si la sala está llena, los que sobran se quedan fuera', async () => {
    const { result } = renderHook(() => useRoom('ABCDE', me, false));
    chan.presence = Object.fromEntries(
      [...Array.from({ length: MAX_PLAYERS }, (_, i) => ({ id: `p${i}`, at: i })), { id: 'me', at: 99 }].map((p) => [p.id, [p]]),
    );
    await act(async () => chan.syncHandler!());
    expect(result.current.status).toBe('full');
    expect(result.current.players).toHaveLength(MAX_PLAYERS + 1);
  });
});
