-- IdeaForge Arena schema for Supabase (Postgres)
-- Run in Supabase SQL Editor.

create extension if not exists pgcrypto;

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

create index if not exists idx_rooms_slug on public.rooms(slug);
create index if not exists idx_ideas_room_id on public.ideas(room_id);
create index if not exists idx_versions_idea_id on public.versions(idea_id);
create index if not exists idx_battles_idea_id on public.battles(idea_id);
create index if not exists idx_votes_battle_id on public.votes(battle_id);

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

alter table public.profiles enable row level security;
alter table public.rooms enable row level security;
alter table public.ideas enable row level security;
alter table public.versions enable row level security;
alter table public.battles enable row level security;
alter table public.votes enable row level security;

-- ============================================================
-- RLS POLICIES
-- ============================================================

-- profiles: anyone can read; owner can insert/update
create policy "profiles_select" on public.profiles for select using (true);
create policy "profiles_insert" on public.profiles for insert with check (auth.uid() = id);
create policy "profiles_update" on public.profiles for update using (auth.uid() = id);

-- rooms: anyone can read; authenticated users can create; owner can delete
create policy "rooms_select" on public.rooms for select using (true);
create policy "rooms_insert" on public.rooms for insert with check (auth.uid() = created_by);
create policy "rooms_delete" on public.rooms for delete using (auth.uid() = created_by);

-- ideas: anyone can read; authenticated users can create; owner can update/delete
create policy "ideas_select" on public.ideas for select using (true);
create policy "ideas_insert" on public.ideas for insert with check (auth.uid() = created_by);
create policy "ideas_update" on public.ideas for update using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "ideas_delete" on public.ideas for delete using (auth.uid() = created_by);

-- versions: anyone can read; authenticated users can create their own
create policy "versions_select" on public.versions for select using (true);
create policy "versions_insert" on public.versions for insert with check (auth.uid() = created_by);

-- battles: anyone can read; authenticated users can create and update
create policy "battles_select" on public.battles for select using (true);
create policy "battles_insert" on public.battles for insert with check (auth.uid() is not null);
create policy "battles_update" on public.battles for update using (auth.uid() is not null);

-- votes: anyone can read; authenticated users can cast their own vote (no updates)
create policy "votes_select" on public.votes for select using (true);
create policy "votes_insert" on public.votes for insert with check (auth.uid() = voter_id);

-- Public read for room discovery and timelines.
drop policy if exists "Public read profiles" on public.profiles;
create policy "Public read profiles" on public.profiles
  for select using (true);

drop policy if exists "Public read rooms" on public.rooms;
create policy "Public read rooms" on public.rooms
  for select using (true);

drop policy if exists "Public read ideas" on public.ideas;
create policy "Public read ideas" on public.ideas
  for select using (true);

drop policy if exists "Public read versions" on public.versions;
create policy "Public read versions" on public.versions
  for select using (true);

drop policy if exists "Public read battles" on public.battles;
create policy "Public read battles" on public.battles
  for select using (true);

drop policy if exists "Public read votes" on public.votes;
create policy "Public read votes" on public.votes
  for select using (true);

-- Authenticated writes.
drop policy if exists "Auth upsert own profile" on public.profiles;
create policy "Auth upsert own profile" on public.profiles
  for all to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "Auth create rooms" on public.rooms;
create policy "Auth create rooms" on public.rooms
  for insert to authenticated
  with check (auth.uid() = created_by);

drop policy if exists "Auth update rooms" on public.rooms;
create policy "Auth update rooms" on public.rooms
  for update to authenticated
  using (true)
  with check (true);

drop policy if exists "Auth create ideas" on public.ideas;
create policy "Auth create ideas" on public.ideas
  for insert to authenticated
  with check (auth.uid() = created_by);

drop policy if exists "Auth update ideas" on public.ideas;
create policy "Auth update ideas" on public.ideas
  for update to authenticated
  using (true)
  with check (true);

drop policy if exists "Auth create versions" on public.versions;
create policy "Auth create versions" on public.versions
  for insert to authenticated
  with check (auth.uid() = created_by);

drop policy if exists "Auth create battles" on public.battles;
create policy "Auth create battles" on public.battles
  for insert to authenticated
  with check (true);

drop policy if exists "Auth update battles" on public.battles;
create policy "Auth update battles" on public.battles
  for update to authenticated
  using (true)
  with check (true);

drop policy if exists "Auth create votes" on public.votes;
create policy "Auth create votes" on public.votes
  for insert to authenticated
  with check (auth.uid() = voter_id);
