import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Kpis } from '../api/admin';
import { makeFakeSupabase } from '../test/fakeSupabase';

const fake = vi.hoisted(() => ({ current: null as ReturnType<typeof makeFakeSupabase> | null }));
vi.mock('../lib/supabase', () => ({
  get supabase() {
    return fake.current!.client;
  },
  onlineEnabled: true,
}));

const { Admin } = await import('./Admin');
const { Account } = await import('./Account');
const { Puzzle } = await import('./Puzzle');

let sb: ReturnType<typeof makeFakeSupabase>;
beforeEach(() => {
  sb = makeFakeSupabase();
  fake.current = sb;
});

const kpis: Kpis = {
  generated_at: '2026-10-17T10:00:00Z',
  days: 30,
  users: { total: 12, new_24h: 1, new_7d: 4, new_period: 9, with_email: 5, google: 0, active_7d: 6, in_ranking: 7 },
  plays: { total: 500, period: 300, today: 42, devices_24h: 9, devices_7d: 30, devices_period: 80, devices_total: 120, logged_share: 25, returning_devices: 20, avg_per_device: 3.7 },
  daily: [
    { day: '2026-10-16', plays: 10, devices: 4, signups: 1 },
    { day: '2026-10-17', plays: 42, devices: 9, signups: 2 },
  ],
  hours: [{ hour: 21, plays: 30 }],
  by_mode: [{ kind: 'game', mode: 'cancion', plays: 100, devices: 20, avg_score: 5000, avg_correct: 6.5, win_rate: null }],
  by_genre: [{ genre: 'reggaeton', plays: 80 }],
  by_level: [{ difficulty: 'facil', era: 'vieja', plays: 12 }],
  puzzles: [{ mode: 'wordle', daily: true, plays: 15, devices: 10, win_rate: 60 }],
  top_players: [{ username: 'pepe', avatar: 'note', plays: 50, best: 9000, days: 5, last_at: '2026-10-17T09:00:00Z' }],
  recent_users: [{ username: 'pepe', avatar: 'note', created_at: '2026-10-10T09:00:00Z', plays: 50, ranked: 10, last_at: null }],
  challenges: {
    total: 3,
    period: 2,
    results: 4,
    plays: 9,
    list: [{ id: 'ABCDEF', mode: 'cancion', label: 'Reggaetón', created_at: '2026-10-15T10:00:00Z', creator_score: 6000, creator: 'pepe', results: 2, plays: 7, devices: 3 }],
  },
  rooms: { period: 5, players: 11 },
  ranking: { total: 70, period: 40 },
  errors: { h24: 2, period: 5, devices: 3, top: [{ place: 'render:game', message: 'TypeError: x', n: 4, devices: 2, last_at: '2026-10-17T08:00:00Z', version: 'abc1234', stack: 'at x', extra: { mode: 'cancion' } }] },
  reports: {
    open: 1,
    list: [{ id: 7, reason: 'audio', comment: 'suena otra', mode: 'cancion', track_id: 5, album_id: null, title: 'Gasolina', artist: 'Daddy Yankee', album: null, created_at: '2026-10-17T07:00:00Z', username: null }],
  },
};

describe('Panel de administración', () => {
  it('pide las cifras al servidor y enseña el resumen', async () => {
    sb.rpcResult = (fn) => (fn === 'admin_kpis' ? { data: kpis } : {});
    render(<Admin onBack={() => {}} />);
    expect(await screen.findByText('Partidas hoy')).toBeTruthy();
    expect(screen.getByText('42')).toBeTruthy();
    expect(sb.rpcCalls[0]).toEqual({ fn: 'admin_kpis', args: { p_days: 30 } });
    expect(screen.getByText('Partidas por día')).toBeTruthy();
  });

  it('cambia de periodo', async () => {
    sb.rpcResult = (fn) => (fn === 'admin_kpis' ? { data: kpis } : {});
    render(<Admin onBack={() => {}} />);
    await screen.findByText('Partidas hoy');
    await userEvent.click(screen.getByRole('tab', { name: '7 días' }));
    await waitFor(() => expect(sb.rpcCalls.at(-1)).toEqual({ fn: 'admin_kpis', args: { p_days: 7 } }));
  });

  it('retos: al tocar uno enseña quién lo ha jugado y cuántas veces', async () => {
    sb.rpcResult = (fn) =>
      fn === 'admin_kpis'
        ? { data: kpis }
        : fn === 'admin_challenge'
          ? { data: [{ player: 'lola', logged: true, plays: 3, best: 8000, best_correct: 8, first_at: '2026-10-15T11:00:00Z', last_at: '2026-10-16T11:00:00Z', saved: 6000 }] }
          : {};
    const user = userEvent.setup();
    render(<Admin onBack={() => {}} />);
    await screen.findByText('Partidas hoy');
    await user.click(screen.getByRole('button', { name: /^Retos/ }));
    await user.click(screen.getByRole('button', { name: /ABCDEF/ }));
    const row = (await screen.findByText('lola')).closest('tr')!;
    expect(within(row).getByText('3')).toBeTruthy();
    expect(sb.rpcCalls.at(-1)).toEqual({ fn: 'admin_challenge', args: { p_id: 'ABCDEF' } });
  });

  it('reportes: se marcan como revisados', async () => {
    sb.rpcResult = (fn) => (fn === 'admin_kpis' ? { data: kpis } : {});
    const user = userEvent.setup();
    render(<Admin onBack={() => {}} />);
    await screen.findByText('Partidas hoy');
    await user.click(screen.getByRole('button', { name: /^Reportes/ }));
    expect(screen.getByText(/Gasolina · Daddy Yankee/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Revisado' }));
    await waitFor(() => expect(sb.rpcCalls.some((c) => c.fn === 'admin_resolve_report' && c.args.p_id === 7)).toBe(true));
  });

  it('errores y usuarios', async () => {
    sb.rpcResult = (fn) => (fn === 'admin_kpis' ? { data: kpis } : {});
    const user = userEvent.setup();
    render(<Admin onBack={() => {}} />);
    await screen.findByText('Partidas hoy');
    await user.click(screen.getByRole('button', { name: /^Errores/ }));
    expect(screen.getByText('TypeError: x')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /^Usuarios/ }));
    expect(screen.getAllByText('pepe').length).toBeGreaterThan(0);
  });

  it('si no eres admin, el servidor lo impide y se dice', async () => {
    sb.rpcResult = () => ({ error: { message: 'forbidden' } });
    render(<Admin onBack={() => {}} />);
    expect(await screen.findByText('Esta cuenta no tiene acceso al panel.')).toBeTruthy();
  });
});

describe('Tu cuenta', () => {
  const profile = { id: 'u1', username: 'pepe', avatar: 'note' };

  it('el botón del panel solo sale si el servidor dice que eres admin', async () => {
    sb.rpcResult = (fn) => (fn === 'is_admin' ? { data: true } : {});
    const onAdmin = vi.fn();
    render(<Account profile={profile} onSaved={() => {}} onClose={() => {}} onAdmin={onAdmin} />);
    await userEvent.click(await screen.findByRole('button', { name: /Panel de administración/ }));
    expect(onAdmin).toHaveBeenCalled();
  });

  it('a los demás no les sale', async () => {
    sb.rpcResult = (fn) => (fn === 'is_admin' ? { data: false } : {});
    render(<Account profile={profile} onSaved={() => {}} onClose={() => {}} onAdmin={() => {}} />);
    await waitFor(() => expect(sb.rpcCalls.some((c) => c.fn === 'is_admin')).toBe(true));
    expect(screen.queryByRole('button', { name: /Panel de administración/ })).toBeNull();
  });
});

describe('Album Quiz', () => {
  it('libre: se puede jugar, rendirse, reportar el disco y se apunta la partida', async () => {
    const user = userEvent.setup();
    render(<Puzzle id="albumquiz" filter={{ kind: 'genres', genres: ['reggaeton', 'trap-es'] }} onBack={() => {}} />);
    await user.click(await screen.findByRole('tab', { name: 'Libre' }));
    expect(await screen.findByPlaceholderText('Escribe una canción del disco…')).toBeTruthy();
    // El disco queda apuntado para no repetirlo
    expect(JSON.parse(localStorage.getItem('mg:recent-albums:albumquiz') ?? '[]').length).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: 'Me rindo' }));
    expect(await screen.findByRole('button', { name: /Reportar este disco/ })).toBeTruthy();
    await waitFor(() => expect(sb.inserts.some((i) => i.table === 'plays' && i.row.mode === 'albumquiz' && i.row.daily === false)).toBe(true));
  });
});
