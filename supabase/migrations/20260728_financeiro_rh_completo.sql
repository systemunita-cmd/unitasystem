-- Financeiro + RH: inclusão aditiva. Nenhuma tabela/coluna existente é removida.

alter table public.folha_itens
  add column if not exists funcionario_id uuid references public.funcionarios(id),
  add column if not exists vale_transporte numeric not null default 0,
  add column if not exists vale_alimentacao numeric not null default 0,
  add column if not exists beneficios numeric not null default 0,
  add column if not exists encargos_empresa numeric not null default 0,
  add column if not exists comissao_detalhes jsonb not null default '{}'::jsonb,
  add column if not exists origem text not null default 'manual',
  add column if not exists updated_at timestamptz not null default now();

alter table public.proposta
  add column if not exists comissao_manual numeric not null default 0,
  add column if not exists instalacao_auditada boolean not null default false,
  add column if not exists instalacao_auditada_em timestamptz,
  add column if not exists instalacao_auditada_por text;

create table if not exists public.fin_competencias (
  competencia text primary key check (competencia ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  status text not null default 'aberta' check (status in ('aberta','fechada')),
  fechado_em timestamptz,
  fechado_por text,
  entradas_snapshot numeric not null default 0,
  saidas_snapshot numeric not null default 0,
  saldo_snapshot numeric not null default 0,
  observacao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.fin_extratos (
  id uuid primary key default gen_random_uuid(),
  importacao_id uuid,
  data date not null,
  descricao text not null,
  documento text,
  valor numeric not null,
  tipo text not null check (tipo in ('credito','debito')),
  conta_bancaria text,
  categoria_sugerida text,
  conciliado boolean not null default false,
  titulo_id uuid references public.fin_titulos(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.fin_importacoes (
  id uuid primary key default gen_random_uuid(),
  nome_arquivo text not null,
  formato text not null,
  total_linhas integer not null default 0,
  importado_por text,
  created_at timestamptz not null default now()
);

alter table public.fin_extratos
  drop constraint if exists fin_extratos_importacao_id_fkey,
  add constraint fin_extratos_importacao_id_fkey
    foreign key (importacao_id) references public.fin_importacoes(id) on delete cascade;

create table if not exists public.fin_metas (
  id uuid primary key default gen_random_uuid(),
  competencia text not null,
  vendedor text,
  equipe_id bigint,
  meta_vendas integer not null default 20,
  meta_valor numeric not null default 0,
  created_at timestamptz not null default now(),
  unique (competencia, vendedor, equipe_id)
);

create table if not exists public.fin_alertas (
  id uuid primary key default gen_random_uuid(),
  tipo text not null,
  titulo text not null,
  mensagem text,
  referencia_tipo text,
  referencia_id text,
  vencimento date,
  status text not null default 'pendente' check (status in ('pendente','lido','resolvido')),
  created_at timestamptz not null default now(),
  unique (tipo, referencia_tipo, referencia_id, vencimento)
);

create index if not exists fin_extratos_data_idx on public.fin_extratos(data desc);
create index if not exists fin_metas_competencia_idx on public.fin_metas(competencia);
create index if not exists fin_alertas_status_idx on public.fin_alertas(status, vencimento);
create index if not exists proposta_comissao_auditada_idx
  on public.proposta(data_instalacao, vendedor)
  where instalacao_auditada = true and status_venda = 'INSTALADA';

create or replace function public.gerar_folha_integrada(p_competencia text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total integer := 0;
begin
  insert into public.folha_itens (
    competencia, funcionario_id, nome, cargo, base, proventos, comissao,
    inss, irrf, outros, status, vale_transporte, vale_alimentacao,
    beneficios, encargos_empresa, origem, updated_at
  )
  select
    p_competencia,
    f.id,
    f.nome,
    coalesce(f.cargo, ''),
    coalesce(f.salario, 0),
    coalesce(vt.total, 0) + coalesce(va.total, 0),
    0,
    0,
    0,
    0,
    'pendente',
    coalesce(vt.total, 0),
    coalesce(va.total, 0),
    coalesce(b.total, 0),
    round(coalesce(f.salario, 0) * 0.288, 2),
    'rh_automatico',
    now()
  from public.funcionarios f
  left join lateral (
    select sum(coalesce(valor_diario,0) * coalesce(dias_uteis,0)) total
    from public.vale_transporte x
    where lower(trim(x.nome)) = lower(trim(f.nome))
  ) vt on true
  left join lateral (
    select sum(coalesce(valor_diario,0) * coalesce(dias_uteis,22)) total
    from public.vale_refeicao x
    where lower(trim(x.nome)) = lower(trim(f.nome))
  ) va on true
  left join lateral (
    select sum(coalesce(custo_empresa,0)) total
    from public.beneficios x
    where coalesce(x.aderentes,0) > 0
  ) b on true
  where coalesce(lower(f.status),'ativo') <> 'desligado'
  on conflict do nothing;

  get diagnostics v_total = row_count;
  return v_total;
end;
$$;

create or replace function public.recalcular_comissoes(p_competencia text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total integer := 0;
begin
  with vendas as (
    select
      lower(trim(coalesce(p.vendedor,''))) vendedor_chave,
      count(*) quantidade,
      sum(coalesce(p.comissao_manual,0)) valor,
      jsonb_agg(jsonb_build_object(
        'proposta_id', p.id,
        'cliente', p.nome,
        'instalacao', p.data_instalacao,
        'valor', p.comissao_manual
      ) order by p.data_instalacao) detalhes
    from public.proposta p
    where p.status_venda = 'INSTALADA'
      and to_char(p.data_instalacao::date, 'YYYY-MM') = p_competencia
    group by lower(trim(coalesce(p.vendedor,'')))
  )
  update public.folha_itens fi
  set
    comissao = case when v.quantidade >= 20 then v.valor else 0 end,
    comissao_detalhes = jsonb_build_object(
      'quantidade', v.quantidade,
      'meta', 20,
      'liberada', v.quantidade >= 20,
      'valor_potencial', v.valor,
      'vendas', v.detalhes
    ),
    updated_at = now()
  from public.funcionarios f
  join vendas v on v.vendedor_chave in (
    lower(trim(coalesce(f.nome,''))),
    lower(trim(coalesce(f.email,''))),
    lower(trim(coalesce(f.user_email,'')))
  )
  where fi.funcionario_id = f.id
    and fi.competencia = p_competencia
    and fi.status <> 'pago';

  get diagnostics v_total = row_count;
  return v_total;
end;
$$;

create or replace function public.sincronizar_financeiro_rh(p_competencia text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_folha integer;
  v_comissoes integer;
begin
  v_folha := public.gerar_folha_integrada(p_competencia);
  v_comissoes := public.recalcular_comissoes(p_competencia);
  return jsonb_build_object('folha_criada', v_folha, 'comissoes_atualizadas', v_comissoes);
end;
$$;

create or replace function public.gerar_alertas_financeiros()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total integer := 0;
begin
  insert into public.fin_alertas(tipo,titulo,mensagem,referencia_tipo,referencia_id,vencimento)
  select
    case when t.vencimento < current_date then 'vencida' else 'proximo_vencimento' end,
    case when t.tipo='pagar' then 'Conta a pagar' else 'Conta a receber' end,
    t.descricao,
    'fin_titulos',
    t.id::text,
    t.vencimento
  from public.fin_titulos t
  where t.status <> 'pago'
    and t.vencimento is not null
    and t.vencimento <= current_date + 3
  on conflict do nothing;
  get diagnostics v_total = row_count;
  return v_total;
end;
$$;

grant execute on function public.gerar_folha_integrada(text) to authenticated;
grant execute on function public.recalcular_comissoes(text) to authenticated;
grant execute on function public.sincronizar_financeiro_rh(text) to authenticated;
grant execute on function public.gerar_alertas_financeiros() to authenticated;

alter table public.fin_competencias enable row level security;
alter table public.fin_extratos enable row level security;
alter table public.fin_importacoes enable row level security;
alter table public.fin_metas enable row level security;
alter table public.fin_alertas enable row level security;

do $$
declare t text;
begin
  foreach t in array array['fin_competencias','fin_extratos','fin_importacoes','fin_metas','fin_alertas']
  loop
    execute format('drop policy if exists %I on public.%I', t || '_financeiro', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.usuario_pode_acessar_financeiro()) with check (public.usuario_pode_acessar_financeiro())',
      t || '_financeiro', t
    );
  end loop;
end $$;
