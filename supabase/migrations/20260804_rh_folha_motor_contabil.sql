-- Motor contábil aditivo da folha. Todas as operações sensíveis são restritas
-- ao administrador; os valores legais permanecem configuráveis pela interface.

alter table public.funcionarios
  add column if not exists dependentes_irrf integer not null default 0,
  add column if not exists desligamento date;

alter table public.folha_itens
  add column if not exists salario_cadastrado numeric not null default 0,
  add column if not exists salario_proporcional numeric not null default 0,
  add column if not exists desconto_dsr numeric not null default 0,
  add column if not exists inss_patronal numeric not null default 0,
  add column if not exists rat numeric not null default 0,
  add column if not exists terceiros numeric not null default 0,
  add column if not exists provisao_decimo numeric not null default 0,
  add column if not exists provisao_ferias numeric not null default 0,
  add column if not exists provisao_fgts numeric not null default 0,
  add column if not exists base_irrf numeric not null default 0,
  add column if not exists eventos_proventos numeric not null default 0,
  add column if not exists eventos_descontos numeric not null default 0;

alter table public.folha_itens
  add column if not exists proventos_manuais numeric not null default 0,
  add column if not exists outros_manuais numeric not null default 0;
update public.folha_itens set proventos_manuais=coalesce(proventos,0),outros_manuais=coalesce(outros,0)
where proventos_manuais=0 and outros_manuais=0 and (coalesce(proventos,0)<>0 or coalesce(outros,0)<>0);

create table if not exists public.rh_regras_folha (
  id smallint primary key default 1 check (id=1),
  divisor_salario_dias numeric not null default 30,
  percentual_fgts numeric not null default 8,
  percentual_inss_patronal numeric not null default 20,
  percentual_rat numeric not null default 3,
  percentual_terceiros numeric not null default 5.8,
  percentual_vt_empregado numeric not null default 6,
  calcular_dsr_faltas boolean not null default true,
  max_dsr_mes integer not null default 5,
  deducao_irrf_dependente numeric not null default 189.59,
  deducao_irrf_simplificada numeric not null default 607.20,
  usar_deducao_irrf_simplificada boolean not null default true,
  provisionar_decimo boolean not null default true,
  provisionar_ferias boolean not null default true,
  atualizado_por text,
  updated_at timestamptz not null default now()
);
insert into public.rh_regras_folha(id) values(1) on conflict(id) do nothing;

create table if not exists public.rh_folha_eventos (
  id uuid primary key default gen_random_uuid(),
  competencia text not null check (competencia ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  funcionario_id uuid not null references public.funcionarios(id) on delete cascade,
  tipo text not null check (tipo in ('provento','desconto','afastamento_pago','afastamento_nao_pago','ferias','terco_ferias','decimo_terceiro','inss_decimo','emprestimo','devolucao','rescisao','aviso_previo','outro')),
  descricao text not null,
  referencia numeric not null default 0,
  valor numeric not null default 0,
  natureza text not null default 'provento' check (natureza in ('provento','desconto','informativo')),
  incide_inss boolean not null default false,
  incide_fgts boolean not null default false,
  incide_irrf boolean not null default false,
  ativo boolean not null default true,
  automatico boolean not null default false,
  observacao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists rh_folha_eventos_comp_func_idx on public.rh_folha_eventos(competencia,funcionario_id) where ativo;

alter table public.rh_regras_folha enable row level security;
alter table public.rh_folha_eventos enable row level security;
revoke all on public.rh_regras_folha,public.rh_folha_eventos from anon,authenticated;

create or replace function public.rh_usuario_admin()
returns boolean language sql stable security definer set search_path=public as $ok$
  select lower(coalesce(auth.jwt()->>'email',''))='admin@grupounita.net.br' or exists(
    select 1 from public.usuarios u left join public.grupos_permissao g on g.id=u.grupo_id
    where lower(u.email)=lower(coalesce(auth.jwt()->>'email',''))
      and (lower(coalesce(u.role,''))='admin' or lower(coalesce(g.nome,'')) in ('administração geral','administracao geral','administrador geral'))
  )
$ok$;

create or replace function public.calcular_irrf_folha(p_base numeric)
returns numeric language sql immutable as $irrf$
  select round(greatest(0,case when coalesce(p_base,0)<=2428.80 then 0 when p_base<=2826.65 then p_base*.075-182.16 when p_base<=3751.05 then p_base*.15-394.16 when p_base<=4664.68 then p_base*.225-675.49 else p_base*.275-908.73 end),2)
$irrf$;
