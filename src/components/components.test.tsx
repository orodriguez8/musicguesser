import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeFakeSupabase } from '../test/fakeSupabase';
import { summary } from '../test/helpers';
import type { Filter } from '../game/types';

const fake = vi.hoisted(() => ({ current: null as ReturnType<typeof makeFakeSupabase> | null }));
vi.mock('../lib/supabase', () => ({
  get supabase() {
    return fake.current!.client;
  },
  onlineEnabled: true,
}));

const { ErrorBoundary } = await import('./ErrorBoundary');
const { ReportButton } = await import('./ReportButton');
const { RankingStatus } = await import('./RankingStatus');
const { resetErrorReporting } = await import('../lib/errors');

let sb: ReturnType<typeof makeFakeSupabase>;
beforeEach(() => {
  sb = makeFakeSupabase();
  fake.current = sb;
  resetErrorReporting();
});

function Bomb({ explode }: { explode: boolean }) {
  if (explode) throw new Error('kaboom');
  return <p>Todo bien</p>;
}

describe('ErrorBoundary', () => {
  it('enseña el aviso en vez de una pantalla en blanco y apunta el error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ErrorBoundary place="game">
        <Bomb explode />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('alert').textContent).toContain('Algo ha fallado');
    await waitFor(() => expect(sb.inserts.find((i) => i.table === 'client_errors')?.row).toMatchObject({ place: 'render:game', message: 'Error: kaboom' }));
  });

  it('"Volver al inicio" recupera la app', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    function App() {
      const [broken, setBroken] = useState(true);
      return (
        <ErrorBoundary place="x" onReset={() => setBroken(false)}>
          <Bomb explode={broken} />
        </ErrorBoundary>
      );
    }
    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: /Volver al inicio/ }));
    expect(screen.getByText('Todo bien')).toBeTruthy();
  });

  it('al cambiar de pantalla se olvida el error', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { rerender } = render(
      <ErrorBoundary place="x" resetKey="a">
        <Bomb explode />
      </ErrorBoundary>,
    );
    rerender(
      <ErrorBoundary place="x" resetKey="b">
        <Bomb explode={false} />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Todo bien')).toBeTruthy();
  });
});

describe('ReportButton', () => {
  it('elige motivo, comenta y envía', async () => {
    const user = userEvent.setup();
    render(<ReportButton what={{ mode: 'cancion', trackId: 9, title: 'Gasolina', artist: 'Daddy Yankee' }} />);
    await user.click(screen.getByRole('button', { name: /Reportar/ }));
    const send = screen.getByRole('button', { name: 'Enviar' });
    expect((send as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByLabelText('El audio no suena o es otro'));
    await user.type(screen.getByLabelText('Comentario'), 'suena otra canción');
    await user.click(send);
    expect(await screen.findByText(/Gracias/)).toBeTruthy();
    expect(sb.inserts[0]).toMatchObject({
      table: 'question_reports',
      row: { reason: 'audio', comment: 'suena otra canción', track_id: 9, title: 'Gasolina' },
    });
  });

  it('solo los motivos pedidos', async () => {
    render(<ReportButton what={{ title: 'Disco' }} reasons={['disco', 'otro']} />);
    await userEvent.click(screen.getByRole('button', { name: /Reportar/ }));
    expect(screen.getAllByRole('radio')).toHaveLength(2);
  });

  it('si falla el envío, lo dice', async () => {
    sb.insertResult = () => ({ error: { message: 'rate_limited' } });
    const user = userEvent.setup();
    render(<ReportButton what={{ title: 'X' }} />);
    await user.click(screen.getByRole('button', { name: /Reportar/ }));
    await user.click(screen.getByLabelText('Otra cosa'));
    await user.click(screen.getByRole('button', { name: 'Enviar' }));
    expect(await screen.findByText(/No se ha podido enviar/)).toBeTruthy();
  });
});

describe('RankingStatus', () => {
  const filter: Filter = { kind: 'genres', genres: ['reggaeton'] };

  it('sube la partida y dice el puesto', async () => {
    sb.rpcResult = (fn) => (fn === 'my_rank' ? { data: [{ pos: 2, score: 1 }] } : {});
    render(<RankingStatus summary={summary()} filter={filter} loggedIn />);
    expect(await screen.findByText(/vas #2 esta semana/)).toBeTruthy();
    expect(sb.rpcCalls.filter((c) => c.fn === 'submit_score')).toHaveLength(1);
  });

  it('sin conexión avisa de que se subirá luego', async () => {
    sb.rpcResult = () => ({ error: { message: 'Failed to fetch' } });
    render(<RankingStatus summary={summary()} filter={filter} loggedIn />);
    expect(await screen.findByText(/en cuanto vuelvas a tener internet/)).toBeTruthy();
  });

  it('sin cuenta invita a entrar y no envía nada', () => {
    const onLogin = vi.fn();
    render(<RankingStatus summary={summary()} filter={filter} loggedIn={false} onLogin={onLogin} />);
    expect(screen.getByText(/Entra con tu cuenta/)).toBeTruthy();
    expect(sb.rpcCalls).toHaveLength(0);
  });

  it('partidas cortas no puntúan', () => {
    render(<RankingStatus summary={summary({}, 8)} filter={filter} loggedIn />);
    expect(screen.getByText(/Solo puntúan las partidas de 10/)).toBeTruthy();
  });
});
