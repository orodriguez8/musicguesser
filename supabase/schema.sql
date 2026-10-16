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
create index if not exists scores_board on public.scores (mode, genre, score desc);
create index if not exists scores_user_time on public.scores (user_id, created_at desc);

alter table public.scores enable row level security;
drop policy if exists "Ranking público" on public.scores;
create policy "Ranking público" on public.scores for select using (true);
-- Sin política de INSERT: solo se puede puntuar a través de submit_score().

-- Guarda una partida con comprobaciones anti-trampas razonables.
create or replace function public.submit_score(p_mode text, p_genre text, p_score int, p_correct int, p_rounds int)
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
  insert into public.scores (user_id, mode, genre, score, correct)
  values (uid, p_mode, p_genre, p_score, p_correct);
end $$;
revoke all on function public.submit_score(text, text, int, int, int) from public, anon;
grant execute on function public.submit_score(text, text, int, int, int) to authenticated;

-- Mejor partida de cada jugador en un modo/género/periodo.
-- p_genre = 'todos' → ranking general; p_period = 'semana' → desde el lunes (hora de España).
create or replace function public.best_scores(p_mode text, p_genre text, p_period text)
returns table (user_id uuid, score int, correct smallint, played_at timestamptz)
language sql stable security definer set search_path = public as $$
  select distinct on (s.user_id) s.user_id, s.score, s.correct, s.created_at
  from public.scores s
  where s.mode = p_mode
    and (p_genre = 'todos' or s.genre = p_genre)
    and (p_period <> 'semana'
         or s.created_at >= (date_trunc('week', now() at time zone 'Europe/Madrid') at time zone 'Europe/Madrid'))
  order by s.user_id, s.score desc, s.created_at asc;
$$;

create or replace function public.leaderboard(
  p_mode text, p_genre text default 'todos', p_period text default 'siempre', p_limit int default 50)
returns table (pos bigint, user_id uuid, username text, avatar text, score int, correct smallint, played_at timestamptz)
language sql stable security definer set search_path = public as $$
  select rank() over (order by b.score desc, b.played_at asc) as pos,
         b.user_id, p.username, p.avatar, b.score, b.correct, b.played_at
  from public.best_scores(p_mode, p_genre, p_period) b
  join public.profiles p on p.id = b.user_id
  order by pos
  limit least(greatest(p_limit, 1), 100);
$$;
grant execute on function public.leaderboard(text, text, text, int) to anon, authenticated;

-- Mi puesto, aunque esté fuera del top.
create or replace function public.my_rank(p_mode text, p_genre text default 'todos', p_period text default 'siempre')
returns table (pos bigint, score int)
language sql stable security definer set search_path = public as $$
  select r.pos, r.score from (
    select b.user_id, b.score, rank() over (order by b.score desc, b.played_at asc) as pos
    from public.best_scores(p_mode, p_genre, p_period) b
  ) r where r.user_id = auth.uid();
$$;
grant execute on function public.my_rank(text, text, text) to authenticated;

revoke all on function public.best_scores(text, text, text) from public, anon, authenticated;
