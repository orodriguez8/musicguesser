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
