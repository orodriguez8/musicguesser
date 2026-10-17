// @vitest-environment node
// schema.sql contra un Postgres de verdad (PGlite, en memoria) con un "auth" de Supabase simulado.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

const ADMIN = '11111111-1111-1111-1111-111111111111';
const USER = '22222222-2222-2222-2222-222222222222';
const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf8');

let db: PGlite;
const as = (uid: string | null) => db.exec(`select set_config('test.uid', '${uid ?? ''}', false)`);
const one = async <T,>(sql: string) => ((await db.query<{ v: T }>(sql)).rows[0] as { v: T }).v;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}', raw_app_meta_data jsonb default '{}', created_at timestamptz default now());
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
  `);
  await db.exec(schema);
  await db.exec(`insert into auth.users (id, email, raw_user_meta_data) values
    ('${ADMIN}', 'jefe@example.com', '{"username":"jefe"}'),
    ('${USER}', 'pepe@orodriguez8.github.io', '{"username":"pepe"}')`);
});

describe('schema.sql', () => {
  it('se puede ejecutar dos veces sin romper nada', async () => {
    await expect(db.exec(schema)).resolves.toBeDefined();
  });

  it('el alta de usuario crea su perfil', async () => {
    expect((await db.query(`select username from public.profiles order by username`)).rows).toEqual([{ username: 'jefe' }, { username: 'pepe' }]);
  });

  it('submit_score: anti-trampas', async () => {
    await as(USER);
    await db.exec(`select public.submit_score('cancion', 'reggaeton', 7000, 7, 10, 'facil')`);
    await expect(db.exec(`select public.submit_score('cancion', 'reggaeton', 7000, 7, 10)`)).rejects.toThrow('too_fast');
    await expect(db.exec(`select public.submit_score('cancion', 'reggaeton', 99999, 7, 10)`)).rejects.toThrow('invalid_score');
    await expect(db.exec(`select public.submit_score('cancion', 'reggaeton', 100, 7, 8)`)).rejects.toThrow('incomplete_game');
    await as(null);
    await expect(db.exec(`select public.submit_score('cancion', 'reggaeton', 100, 1, 10)`)).rejects.toThrow('not_authenticated');
  });

  it('plays: con sesión se apunta el usuario solo; sin sesión, anónimo', async () => {
    await as(USER);
    await db.exec(`insert into public.plays (device, kind, mode, genre, difficulty, rounds, correct, score) values ('dev-aaaaaaaa', 'game', 'cancion', 'reggaeton', 'facil', 10, 7, 9000)`);
    await db.exec(`insert into public.plays (device, kind, mode, daily, won) values ('dev-aaaaaaaa', 'puzzle', 'wordle', true, true)`);
    await as(null);
    await db.exec(`insert into public.plays (device, kind, mode, rounds, correct, score) values ('dev-bbbbbbbb', 'game', 'mezcla', 10, 3, 2000)`);
    const rows = (await db.query<{ user_id: string | null }>(`select user_id from public.plays order by id`)).rows;
    expect(rows.map((r) => r.user_id)).toEqual([USER, USER, null]);
  });

  it('plays: rechaza datos raros', async () => {
    await expect(db.exec(`insert into public.plays (device, kind, mode) values ('x', 'game', 'cancion')`)).rejects.toThrow();
    await expect(db.exec(`insert into public.plays (device, kind, mode) values ('dev-aaaaaaaa', 'hack', 'cancion')`)).rejects.toThrow();
    await expect(db.exec(`insert into public.plays (device, kind, mode, score) values ('dev-aaaaaaaa', 'game', 'cancion', 999999)`)).rejects.toThrow();
  });

  it('frena a quien manda más de 40 filas por minuto', async () => {
    await as(null);
    let error = '';
    for (let i = 0; i < 45 && !error; i++)
      await db.exec(`insert into public.plays (device, kind, mode) values ('dev-cccccccc', 'game', 'cancion')`).catch((e: Error) => (error = e.message));
    expect(error).toContain('rate_limited');
  });

  it('errores y reportes se pueden enviar sin cuenta', async () => {
    await as(null);
    await db.exec(`insert into public.client_errors (device, place, message, extra) values ('dev-bbbbbbbb', 'render:game', 'TypeError: x', '{"mode":"cancion"}')`);
    await db.exec(`insert into public.question_reports (device, reason, title, track_id) values ('dev-bbbbbbbb', 'audio', 'Gasolina', 5)`);
    await expect(db.exec(`insert into public.question_reports (device, reason) values ('dev-bbbbbbbb', 'inventado')`)).rejects.toThrow();
    await expect(db.exec(`insert into public.question_reports (device, reason, resolved) values ('dev-bbbbbbbb', 'otro', true)`)).resolves.toBeDefined();
  });

  it('el panel está cerrado para quien no es admin', async () => {
    await as(USER);
    expect(await one<boolean>('select public.is_admin() v')).toBe(false);
    await expect(db.query('select public.admin_kpis(30)')).rejects.toThrow('forbidden');
    await expect(db.query(`select public.admin_challenge('ABCDEF')`)).rejects.toThrow('forbidden');
    await expect(db.query('select public.admin_resolve_report(1)')).rejects.toThrow('forbidden');
    await expect(db.query('select public.admin_purge_errors()')).rejects.toThrow('forbidden');
  });

  it('admin: KPIs, retos y reportes', async () => {
    await as(USER);
    await db.exec(`insert into public.challenges (id, creator, mode, label, game, creator_score, creator_correct) values ('ABCDEF', '${USER}', 'cancion', 'Reggaetón', '{}', 5000, 5)`);
    await db.exec(`insert into public.plays (device, kind, mode, challenge_id, rounds, correct, score) values
      ('dev-aaaaaaaa', 'challenge', 'cancion', 'ABCDEF', 10, 6, 6000), ('dev-aaaaaaaa', 'challenge', 'cancion', 'ABCDEF', 10, 8, 8000)`);
    await db.exec(`insert into public.challenge_results (challenge_id, user_id, score, correct) values ('ABCDEF', '${USER}', 6000, 6)`);
    await as(null);
    await db.exec(`insert into public.plays (device, kind, mode, challenge_id, rounds, correct, score) values ('dev-dddddddd', 'challenge', 'cancion', 'ABCDEF', 10, 2, 1000)`);

    await db.exec(`insert into public.admins (user_id) select id from auth.users where email = 'jefe@example.com'`);
    await as(ADMIN);
    expect(await one<boolean>('select public.is_admin() v')).toBe(true);

    const k = await one<Record<string, any>>('select public.admin_kpis(30) v');
    expect(k.users).toMatchObject({ total: 2, with_email: 1, in_ranking: 1 });
    expect(k.plays.devices_total).toBe(4);
    expect(k.daily).toHaveLength(31);
    expect(k.challenges.list[0]).toMatchObject({ id: 'ABCDEF', creator: 'pepe', plays: 3, devices: 2, results: 1 });
    expect(k.errors.top[0]).toMatchObject({ place: 'render:game', n: 1 });
    expect(k.reports.open).toBe(1);
    expect(k.puzzles[0]).toMatchObject({ mode: 'wordle', daily: true, win_rate: 100 });

    const players = await one<any[]>(`select public.admin_challenge('ABCDEF') v`);
    expect(players).toHaveLength(2);
    expect(players[0]).toMatchObject({ player: 'pepe', logged: true, plays: 2, best: 8000, saved: 6000 });
    expect(players[1]).toMatchObject({ player: 'Sin cuenta', logged: false, plays: 1 });

    const reportId = await one<number>('select min(id) v from public.question_reports where not resolved');
    await db.exec(`select public.admin_resolve_report(${reportId})`);
    expect((await one<Record<string, any>>('select public.admin_kpis(7) v')).reports.open).toBe(0);
    expect(await one<number>('select public.admin_purge_errors() v')).toBe(0);
  });

  it('borrar la cuenta se lleva sus partidas (también las de estadísticas)', async () => {
    await as(USER);
    await db.exec('select public.delete_my_account()');
    expect(await one<number>(`select count(*)::int v from public.plays where user_id = '${USER}'`)).toBe(0);
    expect(await one<number>(`select count(*)::int v from public.scores`)).toBe(0);
  });
});
