create table if not exists user_settings (
  owner_key text primary key,
  daily_goal_minutes integer not null default 480,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists work_sessions (
  id uuid primary key,
  owner_key text not null,
  mode text not null check (mode in ('focus', 'remote', 'study', 'project')),
  note text not null default '',
  check_in_at timestamptz not null,
  check_out_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists work_sessions_owner_check_in_idx
  on work_sessions (owner_key, check_in_at desc);

create unique index if not exists work_sessions_one_active_per_owner_idx
  on work_sessions (owner_key)
  where check_out_at is null;
