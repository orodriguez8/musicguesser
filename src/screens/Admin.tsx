import { useEffect, useState, type ReactNode } from 'react';
import {
  fetchChallengePlayers,
  fetchKpis,
  purgeErrors,
  resolveReport,
  type ChallengePlayer,
  type ChallengeRow,
  type Kpis,
} from '../api/admin';
import { REPORT_REASONS } from '../api/telemetry';
import { Avatar } from '../components/Avatar';
import { Icon } from '../components/Icon';
import { modeTitle } from '../game/modes';
import type { PlayMode } from '../game/types';
import { fmtDecimal, fmtInt } from '../lib/util';

type Tab = 'resumen' | 'juego' | 'usuarios' | 'retos' | 'errores' | 'reportes';

const TABS: { id: Tab; label: string }[] = [
  { id: 'resumen', label: 'Resumen' },
  { id: 'juego', label: 'Modos' },
  { id: 'usuarios', label: 'Usuarios' },
  { id: 'retos', label: 'Retos' },
  { id: 'errores', label: 'Errores' },
  { id: 'reportes', label: 'Reportes' },
];

const PERIODS = [7, 30, 90];

const PUZZLE_NAMES: Record<string, string> = {
  clasico: 'Clásico',
  wordle: 'Wordle',
  albumquiz: 'Album Quiz',
  top10: 'Top 10',
  piramide: 'Pirámide',
};
const KIND_NAMES: Record<string, string> = { game: 'Partida', challenge: 'Reto', room: 'Sala', puzzle: 'Puzle' };

const modeName = (kind: string, mode: string) =>
  kind === 'puzzle' ? (PUZZLE_NAMES[mode] ?? mode) : modeTitle(mode as PlayMode) || mode;

const dateTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
const pct = (n: number | null | undefined) => (n == null ? '—' : `${fmtDecimal(n)} %`);

interface Props {
  onBack: () => void;
}

export function Admin({ onBack }: Props) {
  const [tab, setTab] = useState<Tab>('resumen');
  const [days, setDays] = useState(30);
  const [data, setData] = useState<Kpis | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    setError('');
    fetchKpis(days)
      .then((k) => alive && setData(k))
      .catch((e) => alive && setError(e instanceof Error ? e.message : 'No se ha podido cargar.'));
    return () => {
      alive = false;
    };
  }, [days, attempt]);

  return (
    <main className="screen admin">
      <header className="game-head">
        <button className="btn-square" onClick={onBack} aria-label="Volver al inicio">
          <Icon name="back" size={20} />
        </button>
        <div className="game-title">
          <span className="game-mode">Administración</span>
          <span className="game-sub">{data ? `Actualizado ${dateTime(data.generated_at)}` : 'Cargando…'}</span>
        </div>
        <button className="btn-square" onClick={() => setAttempt((a) => a + 1)} aria-label="Actualizar">
          <Icon name="replay" size={18} />
        </button>
      </header>

      <div className="segmented seg-3" role="tablist" aria-label="Periodo">
        {PERIODS.map((d) => (
          <button key={d} role="tab" aria-selected={days === d} className={days === d ? 'on' : ''} onClick={() => setDays(d)}>
            {d} días
          </button>
        ))}
      </div>

      <div className="chips" role="tablist" aria-label="Sección">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'chip on' : 'chip'} aria-pressed={tab === t.id} onClick={() => setTab(t.id)}>
            {t.label}
            {t.id === 'reportes' && data?.reports.open ? ` · ${data.reports.open}` : ''}
            {t.id === 'errores' && data?.errors.h24 ? ` · ${data.errors.h24}` : ''}
          </button>
        ))}
      </div>

      {error && (
        <section className="stage state-card">
          <p className="state-title">No se ha podido cargar</p>
          <p className="muted center">{error}</p>
          <button className="btn-primary" onClick={() => setAttempt((a) => a + 1)}>
            <Icon name="replay" /> Reintentar
          </button>
        </section>
      )}

      {!error && !data && <p className="muted center">Cargando cifras…</p>}

      {!error && data && (
        <>
          {tab === 'resumen' && <Summary k={data} />}
          {tab === 'juego' && <Modes k={data} />}
          {tab === 'usuarios' && <Users k={data} />}
          {tab === 'retos' && <Challenges k={data} />}
          {tab === 'errores' && <Errors k={data} onChange={() => setAttempt((a) => a + 1)} />}
          {tab === 'reportes' && <Reports k={data} onChange={() => setAttempt((a) => a + 1)} />}
        </>
      )}
    </main>
  );
}

// ---------- Piezas ----------

function Tiles({ items }: { items: { label: string; value: string; hint?: string }[] }) {
  return (
    <div className="admin-tiles">
      {items.map((t) => (
        <div key={t.label} className="stat">
          <strong>{t.value}</strong>
          <span>{t.label}</span>
          {t.hint && <span className="admin-hint">{t.hint}</span>}
        </div>
      ))}
    </div>
  );
}

/** Barras de una sola serie con tooltip al pasar el ratón o tocar. */
function Bars({ data, label, format = fmtInt }: { data: { key: string; value: number; tip: string }[]; label: string; format?: (n: number) => string }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.value));
  const shown = hover != null ? data[hover] : null;
  return (
    <figure className="admin-chart">
      <figcaption>
        <span>{label}</span>
        <span className="muted small">{shown ? `${shown.tip}: ${format(shown.value)}` : `Máximo ${format(max)}`}</span>
      </figcaption>
      <div className="admin-bars" onMouseLeave={() => setHover(null)}>
        {data.map((d, i) => (
          <button
            key={d.key}
            className={hover === i ? 'admin-bar on' : 'admin-bar'}
            onMouseEnter={() => setHover(i)}
            onFocus={() => setHover(i)}
            onClick={() => setHover(i)}
            aria-label={`${d.tip}: ${format(d.value)}`}
          >
            <span style={{ height: `${(d.value / max) * 100}%` }} />
          </button>
        ))}
      </div>
      <div className="admin-axis muted small">
        <span>{data[0]?.tip}</span>
        <span>{data[data.length - 1]?.tip}</span>
      </div>
    </figure>
  );
}

function Table({ head, rows, empty = 'Sin datos todavía.' }: { head: string[]; rows: (string | number)[][]; empty?: string }) {
  if (!rows.length) return <p className="muted small">{empty}</p>;
  return (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <thead>
          <tr>
            {head.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j}>{typeof c === 'number' ? fmtInt(c) : c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Section({ title, children, note }: { title: string; children: ReactNode; note?: string }) {
  return (
    <section className="block">
      <div className="block-head">
        <h2>{title}</h2>
        {note && <span className="muted small">{note}</span>}
      </div>
      {children}
    </section>
  );
}

// ---------- Secciones ----------

function Summary({ k }: { k: Kpis }) {
  const day = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
  const returning = k.plays.devices_period ? (100 * k.plays.returning_devices) / k.plays.devices_period : 0;
  return (
    <>
      <Tiles
        items={[
          { label: 'Partidas hoy', value: fmtInt(k.plays.today) },
          { label: `Partidas (${k.days} d)`, value: fmtInt(k.plays.period), hint: `${fmtInt(k.plays.total)} en total` },
          { label: 'Jugadores hoy', value: fmtInt(k.plays.devices_24h), hint: 'dispositivos en 24 h' },
          { label: 'Jugadores 7 días', value: fmtInt(k.plays.devices_7d) },
          { label: `Jugadores (${k.days} d)`, value: fmtInt(k.plays.devices_period), hint: `${fmtInt(k.plays.devices_total)} desde el inicio` },
          { label: 'Vuelven otro día', value: pct(returning), hint: `${fmtInt(k.plays.returning_devices)} dispositivos` },
          { label: 'Partidas por jugador', value: fmtDecimal(k.plays.avg_per_device) },
          { label: 'Con sesión iniciada', value: pct(k.plays.logged_share), hint: 'de las partidas' },
          { label: 'Usuarios', value: fmtInt(k.users.total), hint: `+${fmtInt(k.users.new_7d)} esta semana` },
        ]}
      />
      <Bars label="Partidas por día" data={k.daily.map((d) => ({ key: d.day, value: d.plays, tip: day(d.day) }))} />
      <Bars label="Jugadores distintos por día" data={k.daily.map((d) => ({ key: d.day, value: d.devices, tip: day(d.day) }))} />
      <Bars label="Altas de usuarios por día" data={k.daily.map((d) => ({ key: d.day, value: d.signups, tip: day(d.day) }))} />
      <Bars
        label="Partidas por hora (España)"
        data={Array.from({ length: 24 }, (_, h) => ({
          key: String(h),
          value: k.hours.find((x) => x.hour === h)?.plays ?? 0,
          tip: `${String(h).padStart(2, '0')}:00`,
        }))}
      />
      <Tiles
        items={[
          { label: `Retos creados (${k.days} d)`, value: fmtInt(k.challenges.period), hint: `${fmtInt(k.challenges.total)} en total` },
          { label: 'Retos jugados', value: fmtInt(k.challenges.plays) },
          { label: `Partidas en salas (${k.days} d)`, value: fmtInt(k.rooms.period), hint: `${fmtInt(k.rooms.players)} jugadores` },
          { label: `Partidas al ranking (${k.days} d)`, value: fmtInt(k.ranking.period), hint: `${fmtInt(k.ranking.total)} en total` },
          { label: 'Errores 24 h', value: fmtInt(k.errors.h24), hint: `${fmtInt(k.errors.period)} en ${k.days} d` },
          { label: 'Reportes abiertos', value: fmtInt(k.reports.open) },
        ]}
      />
    </>
  );
}

function Modes({ k }: { k: Kpis }) {
  return (
    <>
      <Section title="Por modo" note={`Últimos ${k.days} días`}>
        <Table
          head={['Tipo', 'Modo', 'Partidas', 'Jugadores', 'Puntos medios', 'Aciertos medios']}
          rows={k.by_mode
            .filter((m) => m.kind !== 'puzzle')
            .map((m) => [
              KIND_NAMES[m.kind] ?? m.kind,
              modeName(m.kind, m.mode),
              m.plays,
              m.devices,
              m.avg_score ?? '—',
              m.avg_correct == null ? '—' : fmtDecimal(m.avg_correct),
            ])}
        />
      </Section>
      <Section title="Puzles">
        <Table
          head={['Puzle', 'Tipo', 'Partidas', 'Jugadores', 'Ganadas']}
          rows={k.puzzles.map((p) => [PUZZLE_NAMES[p.mode] ?? p.mode, p.daily ? 'Reto del día' : 'Libre', p.plays, p.devices, pct(p.win_rate)])}
        />
      </Section>
      <Section title="Por género">
        <Table head={['Género', 'Partidas']} rows={k.by_genre.map((g) => [g.genre === 'mix' ? 'Varios' : g.genre, g.plays])} />
      </Section>
      <Section title="Urbano: dificultad y época">
        <Table head={['Dificultad', 'Época', 'Partidas']} rows={k.by_level.map((l) => [l.difficulty, l.era, l.plays])} />
      </Section>
    </>
  );
}

function Users({ k }: { k: Kpis }) {
  return (
    <>
      <Tiles
        items={[
          { label: 'Usuarios', value: fmtInt(k.users.total) },
          { label: 'Altas 24 h', value: fmtInt(k.users.new_24h) },
          { label: `Altas (${k.days} d)`, value: fmtInt(k.users.new_period) },
          { label: 'Activos 7 días', value: fmtInt(k.users.active_7d) },
          { label: 'Con email real', value: fmtInt(k.users.with_email), hint: `${fmtInt(k.users.total - k.users.with_email)} solo usuario` },
          { label: 'En el ranking', value: fmtInt(k.users.in_ranking) },
        ]}
      />
      <Section title="Los que más juegan" note={`Últimos ${k.days} días`}>
        {k.top_players.length ? (
          <ol className="board">
            {k.top_players.map((p, i) => (
              <li key={p.username} className="board-row">
                <span className="board-pos">{i + 1}</span>
                <Avatar id={p.avatar} name={p.username} size={34} />
                <span className="board-name">
                  <strong>{p.username}</strong>
                  <span>
                    {p.days} {p.days === 1 ? 'día' : 'días'} · última {dateTime(p.last_at)}
                  </span>
                </span>
                <span className="board-score">{fmtInt(p.plays)}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="muted small">Sin datos todavía.</p>
        )}
      </Section>
      <Section title="Últimos registrados">
        <Table
          head={['Usuario', 'Alta', 'Partidas', 'Al ranking', 'Última partida']}
          rows={k.recent_users.map((u) => [u.username, dateTime(u.created_at), u.plays, u.ranked, dateTime(u.last_at)])}
        />
      </Section>
    </>
  );
}

function Challenges({ k }: { k: Kpis }) {
  const [open, setOpen] = useState<ChallengeRow | null>(null);
  const [players, setPlayers] = useState<ChallengePlayer[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setPlayers(null);
    setError('');
    fetchChallengePlayers(open.id)
      .then((p) => alive && setPlayers(p))
      .catch((e) => alive && setError(e instanceof Error ? e.message : 'No se ha podido cargar.'));
    return () => {
      alive = false;
    };
  }, [open]);

  if (open)
    return (
      <Section title={`Reto ${open.id}`} note={`${modeTitle(open.mode as PlayMode)} · ${open.label}`}>
        <button className="btn-ghost" onClick={() => setOpen(null)}>
          <Icon name="back" /> Todos los retos
        </button>
        <p className="muted small">
          Creado por <strong>{open.creator}</strong> el {dateTime(open.created_at)} con {fmtInt(open.creator_score)} puntos.
        </p>
        {error && <p className="form-error">{error}</p>}
        {!players && !error && <p className="muted small">Cargando…</p>}
        {players && (
          <Table
            head={['Jugador', 'Veces', 'Mejor', 'Aciertos', 'Guardado', 'Primera', 'Última']}
            rows={players.map((p) => [
              p.player,
              p.plays,
              p.best ?? '—',
              p.best_correct ?? '—',
              p.saved ?? '—',
              dateTime(p.first_at),
              dateTime(p.last_at),
            ])}
            empty="Nadie lo ha jugado todavía."
          />
        )}
      </Section>
    );

  return (
    <Section title="Retos" note="Toca uno para ver quién lo ha jugado">
      {k.challenges.list.length ? (
        <ul className="admin-list">
          {k.challenges.list.map((c) => (
            <li key={c.id}>
              <button className="admin-item" onClick={() => setOpen(c)}>
                <span>
                  <strong>{c.id}</strong> · {modeTitle(c.mode as PlayMode)} · {c.label}
                  <span className="muted small">
                    {' '}
                    de {c.creator} · {dateTime(c.created_at)}
                  </span>
                </span>
                <span className="admin-count">
                  {fmtInt(c.plays)} <small>partidas · {fmtInt(c.devices)} jugadores</small>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted small">Aún no hay retos.</p>
      )}
    </Section>
  );
}

function Errors({ k, onChange }: { k: Kpis; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <Section title="Errores" note={`${fmtInt(k.errors.period)} en ${k.days} días · ${fmtInt(k.errors.devices)} dispositivos`}>
      {k.errors.top.length ? (
        <ul className="admin-list">
          {k.errors.top.map((e) => (
            <li key={`${e.place}|${e.message}`}>
              <details className="admin-error">
                <summary>
                  <span className="admin-count">{fmtInt(e.n)}</span>
                  <span>
                    <strong>{e.message}</strong>
                    <span className="muted small">
                      {' '}
                      {e.place} · {fmtInt(e.devices)} disp. · {dateTime(e.last_at)} · v{e.version ?? '?'}
                    </span>
                  </span>
                </summary>
                {e.extra && <pre>{JSON.stringify(e.extra, null, 1)}</pre>}
                {e.stack && <pre>{e.stack}</pre>}
              </details>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted small">Ningún error en este periodo.</p>
      )}
      <button
        className="btn-ghost"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          await purgeErrors().catch(() => 0);
          setBusy(false);
          onChange();
        }}
      >
        Borrar errores de hace más de 90 días
      </button>
    </Section>
  );
}

function Reports({ k, onChange }: { k: Kpis; onChange: () => void }) {
  const [done, setDone] = useState<Set<number>>(new Set());
  const reason = (id: string) => REPORT_REASONS.find((r) => r.id === id)?.label ?? id;
  const list = k.reports.list.filter((r) => !done.has(r.id));
  return (
    <Section title="Preguntas reportadas" note={`${fmtInt(k.reports.open)} sin revisar`}>
      {list.length ? (
        <ul className="admin-list">
          {list.map((r) => (
            <li key={r.id} className="admin-report">
              <div>
                <strong>{reason(r.reason)}</strong>
                <span className="muted small">
                  {' '}
                  · {r.mode ? modeName(r.mode in PUZZLE_NAMES ? 'puzzle' : 'game', r.mode) : '—'} · {r.username ?? 'sin cuenta'} ·{' '}
                  {dateTime(r.created_at)}
                </span>
                <span className="admin-report-what">
                  {[r.title, r.artist, r.album].filter(Boolean).join(' · ') || 'Sin datos de la pregunta'}
                  {r.track_id ? ` (canción ${r.track_id})` : ''}
                  {r.album_id ? ` (disco ${r.album_id})` : ''}
                </span>
                {r.comment && <q>{r.comment}</q>}
              </div>
              <button
                className="btn-chip"
                onClick={async () => {
                  await resolveReport(r.id).catch(() => {});
                  setDone(new Set([...done, r.id]));
                  if (list.length === 1) onChange();
                }}
              >
                Revisado
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted small">No hay reportes pendientes.</p>
      )}
    </Section>
  );
}
