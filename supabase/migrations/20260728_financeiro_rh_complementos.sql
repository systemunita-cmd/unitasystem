-- Complementos aditivos: benefícios individualizados e inadimplência comercial.

create table if not exists public.rh_beneficio_funcionarios (
  id uuid primary key default gen_random_uuid(),
  funcionario_id uuid not null references public.funcionarios(id) on delete cascade,
  beneficio_id uuid not null references public.beneficios(id) on delete cascade,
  valor_empresa numeric,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  unique (funcionario_id, beneficio_id)
);

create unique index if not exists folha_itens_competencia_funcionario_uidx
  on public.folha_itens(competencia, funcionario_id)
  where funcionario_id is not null;

create table if not exists public.fin_inadimplencia (
  id uuid primary key default gen_random_uuid(),
  proposta_id bigint references public.proposta(id) on delete cascade,
  cliente text not null,
  cpf text,
  vendedor text,
  valor numeric not null default 0,
  vencimento date,
  status text not null default 'aberta' check (status in ('aberta','negociando','regularizada')),
  observacao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (proposta_id, vencimento)
);

create index if not exists fin_inadimplencia_vendedor_idx
  on public.fin_inadimplencia(vendedor, status);

alter table public.rh_beneficio_funcionarios enable row level security;
alter table public.fin_inadimplencia enable row level security;

drop policy if exists "rh_beneficio_funcionarios_financeiro" on public.rh_beneficio_funcionarios;
create policy "rh_beneficio_funcionarios_financeiro"
  on public.rh_beneficio_funcionarios for all to authenticated
  using (public.usuario_pode_acessar_financeiro())
  with check (public.usuario_pode_acessar_financeiro());

drop policy if exists "fin_inadimplencia_financeiro" on public.fin_inadimplencia;
create policy "fin_inadimplencia_financeiro"
  on public.fin_inadimplencia for all to authenticated
  using (public.usuario_pode_acessar_financeiro())
  with check (public.usuario_pode_acessar_financeiro());

create or replace function public.vincular_funcionarios_folha()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_total integer;
begin
  update public.folha_itens fi
  set funcionario_id = f.id, updated_at = now()
  from public.funcionarios f
  where fi.funcionario_id is null
    and lower(trim(fi.nome)) = lower(trim(f.nome));
  get diagnostics v_total = row_count;
  return v_total;
end;
$$;

grant execute on function public.vincular_funcionarios_folha() to authenticated;
