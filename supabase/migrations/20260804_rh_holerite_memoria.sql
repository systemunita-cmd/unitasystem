alter table public.holerites
  add column if not exists informacoes jsonb not null default '{}'::jsonb;
