-- Run this in Supabase SQL Editor to fix room creation and ideas/round write operations.
-- Safe to run multiple times (uses "if not exists" equivalent via drop-first pattern).

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
-- Allow signed-in collaborators to start rounds and update champion state.
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
