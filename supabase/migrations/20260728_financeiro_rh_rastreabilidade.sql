-- Inclusão aditiva: rastreabilidade RH -> Financeiro.
-- Não remove, renomeia ou altera o comportamento de colunas existentes.

alter table public.fin_titulos
  add column if not exists competencia text,
  add column if not exists origem_modulo text,
  add column if not exists origem_tipo text,
  add column if not exists origem_id text,
  add column if not exists funcionario_id uuid,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

comment on column public.fin_titulos.competencia is
  'Competência contábil no formato AAAA-MM.';
comment on column public.fin_titulos.origem_modulo is
  'Módulo que originou o lançamento: RH, CRM, Financeiro etc.';
comment on column public.fin_titulos.origem_tipo is
  'Tipo da origem: folha, salario, beneficio, encargo, comissao etc.';
comment on column public.fin_titulos.origem_id is
  'Identificador do registro de origem, mantido como texto para aceitar UUID ou chave externa.';
comment on column public.fin_titulos.metadata is
  'Detalhes auditáveis da origem sem alterar o modelo atual do título.';

create index if not exists fin_titulos_competencia_idx
  on public.fin_titulos (competencia);

create index if not exists fin_titulos_origem_idx
  on public.fin_titulos (origem_modulo, origem_tipo, origem_id);

create table if not exists public.fin_titulo_anexos (
  id uuid primary key default gen_random_uuid(),
  titulo_id uuid not null references public.fin_titulos(id) on delete cascade,
  nome text not null,
  tipo_mime text,
  tamanho_bytes bigint,
  storage_path text not null,
  url text,
  enviado_por text,
  created_at timestamptz not null default now()
);

create index if not exists fin_titulo_anexos_titulo_idx
  on public.fin_titulo_anexos (titulo_id, created_at desc);

alter table public.fin_titulo_anexos enable row level security;

-- Mantém o mesmo modelo de acesso autenticado usado pela interface atual.
drop policy if exists "fin_titulo_anexos_select_authenticated" on public.fin_titulo_anexos;
create policy "fin_titulo_anexos_select_authenticated"
  on public.fin_titulo_anexos for select
  to authenticated
  using (true);

drop policy if exists "fin_titulo_anexos_insert_authenticated" on public.fin_titulo_anexos;
create policy "fin_titulo_anexos_insert_authenticated"
  on public.fin_titulo_anexos for insert
  to authenticated
  with check (true);

drop policy if exists "fin_titulo_anexos_update_authenticated" on public.fin_titulo_anexos;
create policy "fin_titulo_anexos_update_authenticated"
  on public.fin_titulo_anexos for update
  to authenticated
  using (true)
  with check (true);

drop policy if exists "fin_titulo_anexos_delete_authenticated" on public.fin_titulo_anexos;
create policy "fin_titulo_anexos_delete_authenticated"
  on public.fin_titulo_anexos for delete
  to authenticated
  using (true);
