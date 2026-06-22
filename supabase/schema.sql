create extension if not exists "pgcrypto";

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

create table public.boards (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  color text not null default '#2f6f73',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.lists (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards (id) on delete cascade,
  title text not null,
  position integer not null,
  created_at timestamptz not null default now()
);

create table public.cards (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.lists (id) on delete cascade,
  title text not null,
  body text,
  label text,
  due_at timestamptz,
  position integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.boards enable row level security;
alter table public.lists enable row level security;
alter table public.cards enable row level security;

create policy "Users can read their profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can upsert their profile"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "Users can read their boards"
  on public.boards for select
  using (auth.uid() = owner_id);

create policy "Users can write their boards"
  on public.boards for all
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

create policy "Users can read lists on their boards"
  on public.lists for select
  using (
    exists (
      select 1 from public.boards
      where boards.id = lists.board_id
        and boards.owner_id = auth.uid()
    )
  );

create policy "Users can write lists on their boards"
  on public.lists for all
  using (
    exists (
      select 1 from public.boards
      where boards.id = lists.board_id
        and boards.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.boards
      where boards.id = lists.board_id
        and boards.owner_id = auth.uid()
    )
  );

create policy "Users can read cards on their boards"
  on public.cards for select
  using (
    exists (
      select 1
      from public.lists
      join public.boards on boards.id = lists.board_id
      where lists.id = cards.list_id
        and boards.owner_id = auth.uid()
    )
  );

create policy "Users can write cards on their boards"
  on public.cards for all
  using (
    exists (
      select 1
      from public.lists
      join public.boards on boards.id = lists.board_id
      where lists.id = cards.list_id
        and boards.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.lists
      join public.boards on boards.id = lists.board_id
      where lists.id = cards.list_id
        and boards.owner_id = auth.uid()
    )
  );

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  kind text not null default 'note' check (kind in ('note', 'library')),
  title text not null default '',
  body text not null default '',
  workflow jsonb,
  color text not null default '#fff3bf',
  pinned boolean not null default false,
  done boolean not null default false,
  position double precision not null default extract(epoch from now()),
  archived boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.notes
  add column if not exists deleted_at timestamptz;

alter table public.notes
  add column if not exists kind text not null default 'note';

alter table public.notes
  add column if not exists done boolean not null default false;

alter table public.notes
  add column if not exists workflow jsonb;

alter table public.notes
  drop constraint if exists notes_kind_check;

alter table public.notes
  add constraint notes_kind_check check (kind in ('note', 'library'));

alter table public.notes
  add column if not exists position double precision not null default extract(epoch from now());

create table if not exists public.note_boards (
  note_id uuid not null references public.notes (id) on delete cascade,
  board_id text not null,
  assigned_at timestamptz not null default now(),
  primary key (note_id, board_id)
);

alter table public.note_boards
  add column if not exists assigned_at timestamptz not null default now();

-- Optional cleanup after switching from soft delete to permanent delete:
-- delete from public.notes
-- where owner_id = auth.uid()
--   and (deleted_at is not null or archived = true);

create table if not exists public.note_categories (
  note_id uuid not null references public.notes (id) on delete cascade,
  category_id text not null,
  primary key (note_id, category_id)
);

alter table public.notes enable row level security;
alter table public.note_boards enable row level security;
alter table public.note_categories enable row level security;

create policy "Users can read their notes"
  on public.notes for select
  using (auth.uid() = owner_id);

create policy "Users can write their notes"
  on public.notes for all
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

create policy "Users can read note boards"
  on public.note_boards for select
  using (
    exists (
      select 1 from public.notes
      where notes.id = note_boards.note_id
        and notes.owner_id = auth.uid()
    )
  );

create policy "Users can write note boards"
  on public.note_boards for all
  using (
    exists (
      select 1 from public.notes
      where notes.id = note_boards.note_id
        and notes.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.notes
      where notes.id = note_boards.note_id
        and notes.owner_id = auth.uid()
    )
  );

create policy "Users can read note categories"
  on public.note_categories for select
  using (
    exists (
      select 1 from public.notes
      where notes.id = note_categories.note_id
        and notes.owner_id = auth.uid()
    )
  );

create policy "Users can write note categories"
  on public.note_categories for all
  using (
    exists (
      select 1 from public.notes
      where notes.id = note_categories.note_id
        and notes.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.notes
      where notes.id = note_categories.note_id
        and notes.owner_id = auth.uid()
    )
  );
