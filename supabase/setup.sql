-- IdeaForge Arena — FULL SETUP (safe to run on a fresh Supabase project)
-- Paste this entire file into Supabase SQL Editor and click Run.

-- ============================================================
-- EXTENSIONS
-- ============================================================
create extension if not exists pgcrypto;

-- ============================================================
-- TABLES
-- ============================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.ideas (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  title text not null,
  created_by uuid not null references auth.users(id) on delete cascade,
  champion_version_id uuid,
  round_end_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.versions (
  id uuid primary key default gen_random_uuid(),
  idea_id uuid not null references public.ideas(id) on delete cascade,
  body text not null,
  stage text not null check (stage in ('original', 'improvement')),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.ideas
  drop constraint if exists ideas_champion_version_id_fkey;
alter table public.ideas
  add constraint ideas_champion_version_id_fkey
  foreign key (champion_version_id) references public.versions(id) on delete set null;

create table if not exists public.battles (
  id uuid primary key default gen_random_uuid(),
  idea_id uuid not null references public.ideas(id) on delete cascade,
  a_version_id uuid not null references public.versions(id) on delete cascade,
  b_version_id uuid not null references public.versions(id) on delete cascade,
  status text not null default 'open' check (status in ('open', 'closed')),
  winner_version_id uuid references public.versions(id) on delete set null,
  created_at timestamptz not null default now(),
  closed_at timestamptz
);

create table if not exists public.votes (
  id uuid primary key default gen_random_uuid(),
  battle_id uuid not null references public.battles(id) on delete cascade,
  voter_id uuid not null references auth.users(id) on delete cascade,
  pick text not null check (pick in ('A', 'B')),
  created_at timestamptz not null default now(),
  unique (battle_id, voter_id)
);

-- ============================================================
-- INDEXES
-- ============================================================
create index if not exists idx_rooms_slug      on public.rooms(slug);
create index if not exists idx_ideas_room_id   on public.ideas(room_id);
create index if not exists idx_versions_idea   on public.versions(idea_id);
create index if not exists idx_battles_idea    on public.battles(idea_id);
create index if not exists idx_votes_battle    on public.votes(battle_id);

-- ============================================================
-- AUTO-CREATE PROFILE ON SIGNUP TRIGGER
-- ============================================================
create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1), 'Player')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user_profile();

-- ============================================================
-- ROW LEVEL SECURITY — enable
-- ============================================================
alter table public.profiles enable row level security;
alter table public.rooms    enable row level security;
alter table public.ideas    enable row level security;
alter table public.versions enable row level security;
alter table public.battles  enable row level security;
alter table public.votes    enable row level security;

-- ============================================================
-- ROW LEVEL SECURITY — policies (drop first so safe to re-run)
-- ============================================================

-- profiles
drop policy if exists "profiles_select" on public.profiles;
drop policy if exists "profiles_insert" on public.profiles;
drop policy if exists "profiles_update" on public.profiles;
create policy "profiles_select" on public.profiles for select using (true);
create policy "profiles_insert" on public.profiles for insert with check (auth.uid() = id);
create policy "profiles_update" on public.profiles for update using (auth.uid() = id);

-- rooms
drop policy if exists "rooms_select" on public.rooms;
drop policy if exists "rooms_insert" on public.rooms;
drop policy if exists "rooms_delete" on public.rooms;
create policy "rooms_select" on public.rooms for select using (true);
create policy "rooms_insert" on public.rooms for insert with check (auth.uid() = created_by);
create policy "rooms_delete" on public.rooms for delete using (auth.uid() = created_by);

-- ideas
drop policy if exists "ideas_select" on public.ideas;
drop policy if exists "ideas_insert" on public.ideas;
drop policy if exists "ideas_update" on public.ideas;
drop policy if exists "ideas_delete" on public.ideas;
create policy "ideas_select" on public.ideas for select using (true);
create policy "ideas_insert" on public.ideas for insert with check (auth.uid() = created_by);
-- Allow any signed-in participant to run rounds and champion updates for collaborative rooms.
create policy "ideas_update" on public.ideas for update using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "ideas_delete" on public.ideas for delete using (auth.uid() = created_by);

-- versions
drop policy if exists "versions_select" on public.versions;
drop policy if exists "versions_insert" on public.versions;
create policy "versions_select" on public.versions for select using (true);
create policy "versions_insert" on public.versions for insert with check (auth.uid() = created_by);

-- battles
drop policy if exists "battles_select" on public.battles;
drop policy if exists "battles_insert" on public.battles;
drop policy if exists "battles_update" on public.battles;
create policy "battles_select" on public.battles for select using (true);
create policy "battles_insert" on public.battles for insert with check (auth.uid() is not null);
create policy "battles_update" on public.battles for update using (auth.uid() is not null);

-- votes
drop policy if exists "votes_select" on public.votes;
drop policy if exists "votes_insert" on public.votes;
create policy "votes_select" on public.votes for select using (true);
create policy "votes_insert" on public.votes for insert with check (auth.uid() = voter_id);
