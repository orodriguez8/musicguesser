import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { cancion, track } from '../test/helpers';

const build = vi.hoisted(() => ({ result: [] as unknown[], error: null as Error | null }));
vi.mock('../game/build', async (orig) => {
  const real = await orig<typeof import('../game/build')>();
  return {
    ...real,
    buildQuestions: vi.fn(async () => {
      if (build.error) throw build.error;
      return build.result;
    }),
  };
});
vi.mock('../lib/supabase', () => ({ supabase: null, onlineEnabled: false }));

const { Game } = await import('./Game');
const { GameError } = await import('../game/build');
const settings = { volume: 0.5, showOptions: false };
const filter = { kind: 'genres', genres: ['reggaeton'] } as { kind: 'genres'; genres: string[] };

describe('Game', () => {
  it('avisa si la partida ha salido más corta (y que no puntuará)', async () => {
    build.error = null;
    build.result = Array.from({ length: 7 }, () => cancion(track()));
    render(<Game mode="cancion" filter={filter} settings={settings} onExit={() => {}} onFinish={() => {}} />);
    expect(await screen.findByText(/solo hemos podido preparar 7 pruebas/)).toBeTruthy();
  });

  it('con 10 pruebas no hay aviso', async () => {
    build.error = null;
    build.result = Array.from({ length: 10 }, () => cancion(track()));
    render(<Game mode="cancion" filter={filter} settings={settings} onExit={() => {}} onFinish={() => {}} />);
    expect(await screen.findByText('pruebas listas')).toBeTruthy();
    expect(screen.queryByText(/solo hemos podido preparar/)).toBeNull();
  });

  it('los errores para el jugador se enseñan tal cual, con Reintentar', async () => {
    build.error = new GameError('Deezer no responde ahora mismo.');
    render(<Game mode="cancion" filter={filter} settings={settings} onExit={() => {}} onFinish={() => {}} />);
    expect(await screen.findByText('Deezer no responde ahora mismo.')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Reintentar/ })).toBeTruthy();
  });

  it('un fallo inesperado da un mensaje genérico', async () => {
    build.error = new TypeError('x is undefined');
    render(<Game mode="cancion" filter={filter} settings={settings} onExit={() => {}} onFinish={() => {}} />);
    expect(await screen.findByText(/Algo ha fallado preparando la partida/)).toBeTruthy();
  });
});
