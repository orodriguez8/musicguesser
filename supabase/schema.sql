-- =====================================================================
-- MusicGuesser · base de datos (Supabase)
-- Pégalo entero en Supabase → SQL Editor → New query → Run.
-- Se puede ejecutar varias veces sin romper nada.
-- =====================================================================

-- ---------- Perfiles ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null,
  avatar text not null default 'note',
  created_at timestamptz not null default now(),
  constraint username_format check (username ~ '^[A-Za-z0-9_.]{3,20}$'),
  constraint avatar_format check (avatar ~ '^[a-z0-9-]{1,24}$')
);
create unique index if not exists profiles_username_ci on public.profiles (lower(username));

alter table public.profiles enable row level security;
drop policy if exists "Perfiles públicos" on public.profiles;
create policy "Perfiles públicos" on public.profiles for select using (true);
drop policy if exists "Editar mi perfil" on public.profiles;
create policy "Editar mi perfil" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);
-- El alta del perfil la hace el trigger de abajo, nunca el navegador.

-- Al crear un usuario (email, usuario o Google) se crea su perfil.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  wanted text := nullif(trim(new.raw_user_meta_data ->> 'username'), '');
  base text;
  candidate text;
  n int := 0;
begin
  if wanted is not null then
    -- Nombre elegido al registrarse. Si ya existe, el alta falla y la app lo explica.
    insert into public.profiles (id, username, avatar)
    values (new.id, wanted, coalesce(nullif(new.raw_user_meta_data ->> 'avatar', ''), 'note'));
  else
    -- Google: nombre provisional (se puede cambiar luego desde la app).
    base := regexp_replace(
      coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1), ''),
      '[^A-Za-z0-9_.]', '', 'g');
    base := left(base, 16);
    if length(base) < 3 then base := 'oyente'; end if;
    candidate := base;
    while exists (select 1 from public.profiles where lower(username) = lower(candidate)) loop
      n := n + 1;
      candidate := base || n::text;
    end loop;
    insert into public.profiles (id, username) values (new.id, candidate);
  end if;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ¿Está libre este nombre? (para avisar antes de enviar el registro)
create or replace function public.username_available(p_username text) returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (select 1 from public.profiles where lower(username) = lower(p_username));
$$;
grant execute on function public.username_available(text) to anon, authenticated;

-- ---------- Partidas ----------
create table if not exists public.scores (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  mode text not null,
  genre text not null,
  score int not null,
  correct smallint not null,
  created_at timestamptz not null default now(),
  constraint mode_ok check (mode in ('mezcla','cancion','artista','completa','misteriosa','anio','portada','intruso','subgenero')),
  constraint genre_ok check (genre ~ '^[a-z0-9-]{2,24}$'),
  constraint score_ok check (score between 0 and 30000),
  constraint correct_ok check (correct between 0 and 10)
);
create index if not exists scores_user_time on public.scores (user_id, created_at desc);

-- Dificultad (solo existe en las partidas de urbano; el resto cuentan como 'normal').
-- Cada dificultad tiene su propio ranking.
alter table public.scores add column if not exists difficulty text not null default 'normal';
alter table public.scores drop constraint if exists difficulty_ok;
alter table public.scores add constraint difficulty_ok check (difficulty in ('facil', 'normal', 'dificil'));
-- Modos nuevos que también juegan 10 pruebas y puntúan
alter table public.scores drop constraint if exists mode_ok;
alter table public.scores add constraint mode_ok check (mode in (
  'mezcla','cancion','artista','completa','misteriosa','anio','portada','intruso','subgenero','infiltrado','albumlink'));
drop index if exists public.scores_board;
create index if not exists scores_board2 on public.scores (mode, difficulty, genre, score desc);

alter table public.scores enable row level security;
drop policy if exists "Ranking público" on public.scores;
create policy "Ranking público" on public.scores for select using (true);
-- Sin política de INSERT: solo se puede puntuar a través de submit_score().

-- Versiones anteriores (sin dificultad): se borran para que no haya dos funciones con el mismo nombre
drop function if exists public.submit_score(text, text, int, int, int);
drop function if exists public.leaderboard(text, text, text, int);
drop function if exists public.my_rank(text, text, text);
drop function if exists public.best_scores(text, text, text);

-- Guarda una partida con comprobaciones anti-trampas razonables.
create or replace function public.submit_score(
  p_mode text, p_genre text, p_score int, p_correct int, p_rounds int, p_difficulty text default 'normal')
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  if p_rounds <> 10 then raise exception 'incomplete_game'; end if;
  if p_correct < 0 or p_correct > 10 then raise exception 'invalid_score'; end if;
  -- Ningún acierto puede valer más de 3.000 puntos ni ningún fallo más de 600
  if p_score < 0 or p_score > p_correct * 3000 + (10 - p_correct) * 600 then
    raise exception 'invalid_score';
  end if;
  -- Una partida de verdad dura bastante más de 25 segundos
  if exists (select 1 from public.scores where user_id = uid and created_at > now() - interval '25 seconds') then
    raise exception 'too_fast';
  end if;
  insert into public.scores (user_id, mode, genre, score, correct, difficulty)
  values (uid, p_mode, p_genre, p_score, p_correct, coalesce(p_difficulty, 'normal'));
end $$;
revoke all on function public.submit_score(text, text, int, int, int, text) from public, anon;
grant execute on function public.submit_score(text, text, int, int, int, text) to authenticated;

-- Mejor partida de cada jugador en un modo/género/periodo/dificultad.
-- p_genre = 'todos' → ranking general; p_period = 'semana' → desde el lunes (hora de España).
create or replace function public.best_scores(p_mode text, p_genre text, p_period text, p_difficulty text)
returns table (user_id uuid, score int, correct smallint, played_at timestamptz)
language sql stable security definer set search_path = public as $$
  select distinct on (s.user_id) s.user_id, s.score, s.correct, s.created_at
  from public.scores s
  where s.mode = p_mode
    and s.difficulty = coalesce(p_difficulty, 'normal')
    and (p_genre = 'todos' or s.genre = p_genre)
    and (p_period <> 'semana'
         or s.created_at >= (date_trunc('week', now() at time zone 'Europe/Madrid') at time zone 'Europe/Madrid'))
  order by s.user_id, s.score desc, s.created_at asc;
$$;

create or replace function public.leaderboard(
  p_mode text, p_genre text default 'todos', p_period text default 'siempre', p_limit int default 50,
  p_difficulty text default 'normal')
returns table (pos bigint, user_id uuid, username text, avatar text, score int, correct smallint, played_at timestamptz)
language sql stable security definer set search_path = public as $$
  select rank() over (order by b.score desc, b.played_at asc) as pos,
         b.user_id, p.username, p.avatar, b.score, b.correct, b.played_at
  from public.best_scores(p_mode, p_genre, p_period, p_difficulty) b
  join public.profiles p on p.id = b.user_id
  order by pos
  limit least(greatest(p_limit, 1), 100);
$$;
grant execute on function public.leaderboard(text, text, text, int, text) to anon, authenticated;

-- Mi puesto, aunque esté fuera del top.
create or replace function public.my_rank(
  p_mode text, p_genre text default 'todos', p_period text default 'siempre', p_difficulty text default 'normal')
returns table (pos bigint, score int)
language sql stable security definer set search_path = public as $$
  select r.pos, r.score from (
    select b.user_id, b.score, rank() over (order by b.score desc, b.played_at asc) as pos
    from public.best_scores(p_mode, p_genre, p_period, p_difficulty) b
  ) r where r.user_id = auth.uid();
$$;
grant execute on function public.my_rank(text, text, text, text) to authenticated;

revoke all on function public.best_scores(text, text, text, text) from public, anon, authenticated;

-- ---------- Borrar mi cuenta ----------
-- Google Play exige que cualquiera pueda borrar su cuenta desde la app.
-- Al borrar el usuario se van en cascada su perfil y todas sus partidas.
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  delete from auth.users where id = uid;
end $$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- ---------- Retos a un amigo ----------
-- Guardas las 10 pruebas de tu partida y compartes un enlace: tus amigos juegan exactamente
-- las mismas y comparáis puntos. Cualquiera puede jugar un reto; solo se guarda el resultado
-- de quien tiene cuenta (uno por persona y reto).
create table if not exists public.challenges (
  id text primary key,
  creator uuid not null references public.profiles (id) on delete cascade,
  mode text not null,
  label text not null,
  game jsonb not null,
  creator_score int not null,
  creator_correct smallint not null,
  created_at timestamptz not null default now(),
  constraint challenge_id_ok check (id ~ '^[A-Z2-9]{6}$'),
  constraint challenge_size_ok check (octet_length(game::text) < 300000),
  constraint challenge_label_ok check (char_length(label) <= 80),
  constraint challenge_score_ok check (creator_score between 0 and 30000 and creator_correct between 0 and 10)
);
create index if not exists challenges_creator on public.challenges (creator, created_at desc);

alter table public.challenges enable row level security;
drop policy if exists "Retos públicos" on public.challenges;
create policy "Retos públicos" on public.challenges for select using (true);
drop policy if exists "Crear mis retos" on public.challenges;
create policy "Crear mis retos" on public.challenges for insert with check (auth.uid() = creator);

create table if not exists public.challenge_results (
  challenge_id text not null references public.challenges (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  score int not null,
  correct smallint not null,
  created_at timestamptz not null default now(),
  primary key (challenge_id, user_id),
  constraint result_score_ok check (score between 0 and 30000 and correct between 0 and 10)
);

alter table public.challenge_results enable row level security;
drop policy if exists "Resultados públicos" on public.challenge_results;
create policy "Resultados públicos" on public.challenge_results for select using (true);
drop policy if exists "Guardar mi resultado" on public.challenge_results;
create policy "Guardar mi resultado" on public.challenge_results for insert with check (auth.uid() = user_id);

-- Clasificación de un reto: quien lo creó y todos los que lo han jugado.
create or replace function public.challenge_board(p_id text)
returns table (username text, avatar text, score int, correct smallint, is_creator boolean)
language sql stable security definer set search_path = public as $$
  select * from (
    select p.username, p.avatar, c.creator_score, c.creator_correct, true
    from public.challenges c join public.profiles p on p.id = c.creator
    where c.id = p_id
    union all
    select p.username, p.avatar, r.score, r.correct, false
    from public.challenge_results r join public.profiles p on p.id = r.user_id
    where r.challenge_id = p_id
  ) b order by 3 desc limit 50;
$$;
grant execute on function public.challenge_board(text) to anon, authenticated;

-- =====================================================================
-- Estadísticas, errores, reportes y panel de administración
-- =====================================================================
-- El navegador solo puede AÑADIR filas a estas tablas (nunca leerlas). Lo que se guarda
-- es anónimo: un id aleatorio del dispositivo y, si hay sesión, el usuario.

-- Freno contra abusos: como mucho 40 filas por minuto y dispositivo en cada tabla.
create or replace function public.limit_device_rate() returns trigger
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  execute format('select count(*) from public.%I where device = $1 and created_at > now() - interval ''1 minute''', tg_table_name)
    into n using new.device;
  if n >= 40 then raise exception 'rate_limited'; end if;
  return new;
end $$;

-- ---------- Partidas jugadas (con y sin cuenta) ----------
create table if not exists public.plays (
  id bigint generated always as identity primary key,
  device text not null,
  user_id uuid default auth.uid() references auth.users (id) on delete cascade,
  kind text not null,
  mode text not null,
  genre text,
  difficulty text,
  era text,
  rounds smallint,
  correct smallint,
  score int,
  won boolean,
  daily boolean,
  challenge_id text,
  created_at timestamptz not null default now(),
  constraint play_device_ok check (device ~ '^[a-z0-9-]{8,40}$'),
  constraint play_kind_ok check (kind in ('game', 'challenge', 'room', 'puzzle')),
  constraint play_text_ok check (char_length(mode) <= 24 and coalesce(char_length(genre), 0) <= 60
    and coalesce(char_length(difficulty), 0) <= 12 and coalesce(char_length(era), 0) <= 12
    and coalesce(char_length(challenge_id), 0) <= 12),
  constraint play_numbers_ok check (coalesce(rounds, 0) between 0 and 20 and coalesce(correct, 0) between 0 and 20
    and coalesce(score, 0) between 0 and 60000)
);
create index if not exists plays_time on public.plays (created_at desc);
create index if not exists plays_device on public.plays (device, created_at desc);
create index if not exists plays_challenge on public.plays (challenge_id) where challenge_id is not null;

alter table public.plays enable row level security;
drop policy if exists "Apuntar partida" on public.plays;
create policy "Apuntar partida" on public.plays for insert to anon, authenticated
  with check (user_id is null or user_id = auth.uid());
drop trigger if exists plays_rate on public.plays;
create trigger plays_rate before insert on public.plays for each row execute function public.limit_device_rate();

-- ---------- Errores de la app ----------
create table if not exists public.client_errors (
  id bigint generated always as identity primary key,
  device text not null,
  place text not null,
  message text not null,
  stack text,
  extra jsonb,
  path text,
  user_agent text,
  app_version text,
  created_at timestamptz not null default now(),
  constraint error_device_ok check (device ~ '^[a-z0-9-]{8,40}$'),
  constraint error_size_ok check (char_length(place) <= 60 and char_length(message) <= 500
    and coalesce(char_length(stack), 0) <= 4000 and coalesce(octet_length(extra::text), 0) <= 4000
    and coalesce(char_length(path), 0) <= 200 and coalesce(char_length(user_agent), 0) <= 300
    and coalesce(char_length(app_version), 0) <= 40)
);
create index if not exists client_errors_time on public.client_errors (created_at desc);
create index if not exists client_errors_device on public.client_errors (device, created_at desc);

alter table public.client_errors enable row level security;
drop policy if exists "Avisar de un error" on public.client_errors;
create policy "Avisar de un error" on public.client_errors for insert to anon, authenticated with check (true);
drop trigger if exists client_errors_rate on public.client_errors;
create trigger client_errors_rate before insert on public.client_errors for each row execute function public.limit_device_rate();

-- ---------- Preguntas reportadas por los jugadores ----------
create table if not exists public.question_reports (
  id bigint generated always as identity primary key,
  device text not null,
  user_id uuid default auth.uid() references auth.users (id) on delete set null,
  reason text not null,
  comment text,
  mode text,
  track_id bigint,
  album_id bigint,
  title text,
  artist text,
  album text,
  resolved boolean not null default false,
  created_at timestamptz not null default now(),
  constraint report_device_ok check (device ~ '^[a-z0-9-]{8,40}$'),
  constraint report_reason_ok check (reason in ('cancion', 'artista', 'anio', 'portada', 'audio', 'disco', 'opciones', 'otro')),
  constraint report_size_ok check (coalesce(char_length(comment), 0) <= 500 and coalesce(char_length(mode), 0) <= 24
    and coalesce(char_length(title), 0) <= 200 and coalesce(char_length(artist), 0) <= 200
    and coalesce(char_length(album), 0) <= 200)
);
create index if not exists question_reports_time on public.question_reports (created_at desc);
create index if not exists question_reports_device on public.question_reports (device, created_at desc);

alter table public.question_reports enable row level security;
drop policy if exists "Reportar una pregunta" on public.question_reports;
create policy "Reportar una pregunta" on public.question_reports for insert to anon, authenticated
  with check ((user_id is null or user_id = auth.uid()) and resolved = false);
drop trigger if exists question_reports_rate on public.question_reports;
create trigger question_reports_rate before insert on public.question_reports for each row execute function public.limit_device_rate();

-- ---------- Administración ----------
-- Quién puede ver el panel. Se rellena a mano desde el SQL Editor (no desde la app):
--   insert into public.admins (user_id) select id from auth.users where email = 'TU_EMAIL';
create table if not exists public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade
);
alter table public.admins enable row level security;
-- Sin políticas: nadie puede leerla ni tocarla desde el navegador.

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- Todas las cifras del panel en una sola llamada.
create or replace function public.admin_kpis(p_days int default 30) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  since timestamptz := now() - make_interval(days => greatest(1, least(p_days, 365)));
  out jsonb;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  select jsonb_build_object(
    'generated_at', now(),
    'days', greatest(1, least(p_days, 365)),
    'users', jsonb_build_object(
      'total', (select count(*) from public.profiles),
      'new_24h', (select count(*) from public.profiles where created_at > now() - interval '1 day'),
      'new_7d', (select count(*) from public.profiles where created_at > now() - interval '7 days'),
      'new_period', (select count(*) from public.profiles where created_at > since),
      'with_email', (select count(*) from auth.users where email not like '%@orodriguez8.github.io'),
      'google', (select count(*) from auth.users where raw_app_meta_data ->> 'provider' = 'google'),
      'active_7d', (select count(distinct user_id) from public.plays where user_id is not null and created_at > now() - interval '7 days'),
      'in_ranking', (select count(distinct user_id) from public.scores)
    ),
    'plays', jsonb_build_object(
      'total', (select count(*) from public.plays),
      'period', (select count(*) from public.plays where created_at > since),
      'today', (select count(*) from public.plays where created_at > date_trunc('day', now() at time zone 'Europe/Madrid') at time zone 'Europe/Madrid'),
      'devices_24h', (select count(distinct device) from public.plays where created_at > now() - interval '1 day'),
      'devices_7d', (select count(distinct device) from public.plays where created_at > now() - interval '7 days'),
      'devices_period', (select count(distinct device) from public.plays where created_at > since),
      'devices_total', (select count(distinct device) from public.plays),
      'logged_share', (select round(100.0 * count(*) filter (where user_id is not null) / greatest(count(*), 1), 1) from public.plays where created_at > since),
      -- Dispositivos que han vuelto otro día (de los que llegaron en el periodo)
      'returning_devices', (select count(*) from (
        select device from public.plays where created_at > since group by device
        having count(distinct (created_at at time zone 'Europe/Madrid')::date) >= 2) r),
      'avg_per_device', (select round(count(*)::numeric / greatest(count(distinct device), 1), 1) from public.plays where created_at > since)
    ),
    'daily', coalesce((
      select jsonb_agg(jsonb_build_object('day', d.day, 'plays', coalesce(p.n, 0), 'devices', coalesce(p.dev, 0), 'signups', coalesce(u.n, 0)) order by d.day)
      from (select gs::date as day from generate_series((since at time zone 'Europe/Madrid')::date, (now() at time zone 'Europe/Madrid')::date, interval '1 day') gs) d
      left join (select (created_at at time zone 'Europe/Madrid')::date as day, count(*) n, count(distinct device) dev
                 from public.plays where created_at > since group by 1) p on p.day = d.day
      left join (select (created_at at time zone 'Europe/Madrid')::date as day, count(*) n
                 from public.profiles where created_at > since group by 1) u on u.day = d.day
    ), '[]'::jsonb),
    'hours', coalesce((
      select jsonb_agg(jsonb_build_object('hour', h, 'plays', n) order by h)
      from (select extract(hour from created_at at time zone 'Europe/Madrid')::int h, count(*) n
            from public.plays where created_at > since group by 1) x
    ), '[]'::jsonb),
    'by_mode', coalesce((
      select jsonb_agg(x order by x.plays desc) from (
        select kind, mode, count(*) plays, count(distinct device) devices,
               round(avg(score)) avg_score, round(avg(correct), 1) avg_correct,
               round(100.0 * count(*) filter (where won) / nullif(count(*) filter (where won is not null), 0), 1) win_rate
        from public.plays where created_at > since group by kind, mode) x
    ), '[]'::jsonb),
    'by_genre', coalesce((
      select jsonb_agg(x order by x.plays desc) from (
        select coalesce(genre, '—') genre, count(*) plays from public.plays
        where created_at > since and kind <> 'puzzle' group by 1 order by 2 desc limit 30) x
    ), '[]'::jsonb),
    'by_level', coalesce((
      select jsonb_agg(x order by x.plays desc) from (
        select coalesce(difficulty, 'normal') difficulty, coalesce(era, 'todas') era, count(*) plays
        from public.plays where created_at > since and difficulty is not null group by 1, 2) x
    ), '[]'::jsonb),
    'puzzles', coalesce((
      select jsonb_agg(x order by x.plays desc) from (
        select mode, daily, count(*) plays, count(distinct device) devices,
               round(100.0 * count(*) filter (where won) / greatest(count(*), 1), 1) win_rate
        from public.plays where created_at > since and kind = 'puzzle' group by mode, daily) x
    ), '[]'::jsonb),
    'top_players', coalesce((
      select jsonb_agg(x order by x.plays desc) from (
        select p.username, p.avatar, count(*) plays, max(pl.score) best,
               count(distinct (pl.created_at at time zone 'Europe/Madrid')::date) days, max(pl.created_at) last_at
        from public.plays pl join public.profiles p on p.id = pl.user_id
        where pl.created_at > since group by p.username, p.avatar order by 3 desc limit 25) x
    ), '[]'::jsonb),
    'recent_users', coalesce((
      select jsonb_agg(x order by x.created_at desc) from (
        select p.username, p.avatar, p.created_at,
               (select count(*) from public.plays pl where pl.user_id = p.id) plays,
               (select count(*) from public.scores s where s.user_id = p.id) ranked,
               (select max(created_at) from public.plays pl where pl.user_id = p.id) last_at
        from public.profiles p order by p.created_at desc limit 50) x
    ), '[]'::jsonb),
    'challenges', jsonb_build_object(
      'total', (select count(*) from public.challenges),
      'period', (select count(*) from public.challenges where created_at > since),
      'results', (select count(*) from public.challenge_results),
      'plays', (select count(*) from public.plays where kind = 'challenge'),
      'list', coalesce((
        select jsonb_agg(x order by x.created_at desc) from (
          select c.id, c.mode, c.label, c.created_at, c.creator_score, p.username creator,
                 (select count(*) from public.challenge_results r where r.challenge_id = c.id) results,
                 (select count(*) from public.plays pl where pl.challenge_id = c.id) plays,
                 (select count(distinct device) from public.plays pl where pl.challenge_id = c.id) devices
          from public.challenges c join public.profiles p on p.id = c.creator
          order by c.created_at desc limit 100) x
      ), '[]'::jsonb)
    ),
    'rooms', jsonb_build_object(
      'period', (select count(*) from public.plays where kind = 'room' and created_at > since),
      'players', (select count(distinct coalesce(user_id::text, device)) from public.plays where kind = 'room' and created_at > since)
    ),
    'ranking', jsonb_build_object(
      'total', (select count(*) from public.scores),
      'period', (select count(*) from public.scores where created_at > since)
    ),
    'errors', jsonb_build_object(
      'h24', (select count(*) from public.client_errors where created_at > now() - interval '1 day'),
      'period', (select count(*) from public.client_errors where created_at > since),
      'devices', (select count(distinct device) from public.client_errors where created_at > since),
      'top', coalesce((
        select jsonb_agg(x order by x.n desc) from (
          select place, message, count(*) n, count(distinct device) devices, max(created_at) last_at,
                 (array_agg(app_version order by created_at desc))[1] version,
                 (array_agg(stack order by created_at desc))[1] stack,
                 (array_agg(extra order by created_at desc))[1] extra
          from public.client_errors where created_at > since group by place, message order by 3 desc limit 40) x
      ), '[]'::jsonb)
    ),
    'reports', jsonb_build_object(
      'open', (select count(*) from public.question_reports where not resolved),
      'list', coalesce((
        select jsonb_agg(x order by x.created_at desc) from (
          select r.id, r.reason, r.comment, r.mode, r.track_id, r.album_id, r.title, r.artist, r.album, r.created_at,
                 p.username
          from public.question_reports r left join public.profiles p on p.id = r.user_id
          where not r.resolved order by r.created_at desc limit 100) x
      ), '[]'::jsonb)
    )
  ) into out;
  return out;
end $$;
revoke all on function public.admin_kpis(int) from public, anon;
grant execute on function public.admin_kpis(int) to authenticated;

-- Quién ha jugado un reto y cuántas veces.
create or replace function public.admin_challenge(p_id text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  return coalesce((
    select jsonb_agg(x order by x.plays desc, x.best desc nulls last) from (
      select coalesce(p.username, 'Sin cuenta') player, pl.user_id is not null logged,
             count(*) plays, max(pl.score) best, max(pl.correct) best_correct,
             min(pl.created_at) first_at, max(pl.created_at) last_at,
             (select r.score from public.challenge_results r where r.challenge_id = p_id and r.user_id = pl.user_id) saved
      from public.plays pl left join public.profiles p on p.id = pl.user_id
      where pl.challenge_id = p_id
      group by coalesce(pl.user_id::text, pl.device), p.username, pl.user_id) x
  ), '[]'::jsonb);
end $$;
revoke all on function public.admin_challenge(text) from public, anon;
grant execute on function public.admin_challenge(text) to authenticated;

-- Marcar un reporte como revisado.
create or replace function public.admin_resolve_report(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  update public.question_reports set resolved = true where id = p_id;
end $$;
revoke all on function public.admin_resolve_report(bigint) from public, anon;
grant execute on function public.admin_resolve_report(bigint) to authenticated;

-- Limpieza: los errores de hace más de 90 días ya no sirven.
create or replace function public.admin_purge_errors() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  delete from public.client_errors where created_at < now() - interval '90 days';
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.admin_purge_errors() from public, anon;
grant execute on function public.admin_purge_errors() to authenticated;
