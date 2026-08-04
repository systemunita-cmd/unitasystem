-- Caixa geral automático e comissão padrão por plano.
-- Inclusão aditiva e idempotente: preserva títulos, folha e modalidades existentes.

create or replace function public.usuario_pode_administrar_financeiro()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.usuarios u
    left join public.grupos_permissao g on g.id = u.grupo_id
    where u.auth_user_id = auth.uid()
      and coalesce(u.ativo, true)
      and (
        u.role = 'admin'
        or lower(u.email) = 'admin@grupounita.net.br'
        or lower(trim(coalesce(g.nome, ''))) in ('administração geral', 'administracao geral', 'administrador geral')
      )
  );
$$;

revoke all on function public.usuario_pode_administrar_financeiro() from public;
grant execute on function public.usuario_pode_administrar_financeiro() to authenticated;

create table if not exists public.fin_comissao_planos (
  id uuid primary key default gen_random_uuid(),
  plano text not null,
  plano_chave text not null unique,
  valor_comissao numeric not null default 0 check (valor_comissao >= 0),
  ativo boolean not null default true,
  atualizado_por text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.fin_comissao_planos enable row level security;
drop policy if exists "fin_comissao_planos_leitura" on public.fin_comissao_planos;
create policy "fin_comissao_planos_leitura" on public.fin_comissao_planos
  for select to authenticated using (public.usuario_pode_acessar_financeiro());
drop policy if exists "fin_comissao_planos_admin" on public.fin_comissao_planos;
create policy "fin_comissao_planos_admin" on public.fin_comissao_planos
  for all to authenticated
  using (public.usuario_pode_administrar_financeiro())
  with check (public.usuario_pode_administrar_financeiro());

grant select on public.fin_comissao_planos to authenticated;

create or replace function public.salvar_fin_comissao_plano(p_plano text, p_valor numeric, p_ativo boolean default true)
returns public.fin_comissao_planos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_chave text;
  v_email text;
  v_resultado public.fin_comissao_planos;
begin
  if not coalesce(public.usuario_pode_administrar_financeiro(), false) then
    raise exception 'Somente administradores podem alterar a comissão por plano.' using errcode = '42501';
  end if;
  if nullif(trim(p_plano), '') is null then raise exception 'Informe o plano.'; end if;
  if coalesce(p_valor, 0) < 0 then raise exception 'O valor da comissão não pode ser negativo.'; end if;
  v_chave := upper(regexp_replace(trim(p_plano), '\s+', ' ', 'g'));
  select email into v_email from public.usuarios where auth_user_id = auth.uid() limit 1;
  insert into public.fin_comissao_planos(plano, plano_chave, valor_comissao, ativo, atualizado_por, updated_at)
  values(trim(p_plano), v_chave, coalesce(p_valor, 0), coalesce(p_ativo, true), v_email, now())
  on conflict(plano_chave) do update set
    plano = excluded.plano,
    valor_comissao = excluded.valor_comissao,
    ativo = excluded.ativo,
    atualizado_por = excluded.atualizado_por,
    updated_at = now()
  returning * into v_resultado;
  return v_resultado;
end;
$$;

revoke all on function public.salvar_fin_comissao_plano(text,numeric,boolean) from public;
grant execute on function public.salvar_fin_comissao_plano(text,numeric,boolean) to authenticated;

insert into public.fin_comissao_planos(plano, plano_chave, valor_comissao)
values
  ('1 GIGA COM GLOBO PLAY','1 GIGA COM GLOBO PLAY',55),
  ('700 MEGAS GLOBOPLAY','700 MEGAS GLOBOPLAY',35),
  ('2 GB','2 GB',80), ('1 GB Premium','1 GB PREMIUM',55),
  ('1 GB + Paramount+','1 GB + PARAMOUNT+',55), ('1 GB + MAX','1 GB + MAX',55), ('1 GB','1 GB',55),
  ('900 MB','900 MB',0), ('800 MB','800 MB',0),
  ('700 MB + Paramount+','700 MB + PARAMOUNT+',35), ('700 MB + MAX','700 MB + MAX',35), ('700 MB','700 MB',35),
  ('600 MB + Paramount+','600 MB + PARAMOUNT+',35), ('600 MB + MAX','600 MB + MAX',35), ('600 MB','600 MB',35),
  ('500 MB','500 MB',0), ('400 MB','400 MB',25), ('300 MB','300 MB',0), ('200 MB','200 MB',0)
on conflict(plano_chave) do nothing;

alter table public.fin_comissao_regras drop constraint if exists fin_comissao_regras_modo_check;
alter table public.fin_comissao_regras alter column modo set default 'por_plano';
update public.fin_comissao_regras set modo = 'por_plano' where modo = 'individual';
alter table public.fin_comissao_regras add constraint fin_comissao_regras_modo_check
  check (modo in ('por_plano','por_venda','faixas','valor_unico'));

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
      f.id funcionario_id,
      count(*) quantidade,
      sum(coalesce(cp.valor_comissao,0)) valor_por_plano,
      jsonb_agg(jsonb_build_object(
        'proposta_id',p.id,'cliente',p.nome,'instalacao',p.data_instalacao,
        'plano',p.plano,'valor_plano_comissao',coalesce(cp.valor_comissao,0),
        'plano_configurado',cp.id is not null
      ) order by p.data_instalacao,p.id) detalhes
    from public.funcionarios f
    join public.proposta p on lower(trim(coalesce(p.vendedor,''))) in (
      lower(trim(coalesce(f.nome,''))), lower(trim(coalesce(f.email,''))), lower(trim(coalesce(f.user_email,'')))
    )
    left join public.fin_comissao_planos cp
      on cp.plano_chave=upper(regexp_replace(trim(coalesce(p.plano,'')), '\s+', ' ', 'g')) and cp.ativo
    where p.status_venda='INSTALADA'
      and to_char(p.data_instalacao::date,'YYYY-MM')=p_competencia
    group by f.id
  )
  update public.folha_itens fi
  set comissao = case when v.quantidade < 20 then 0 else
    case coalesce(r.modo,'por_plano')
      when 'por_plano' then v.valor_por_plano
      when 'por_venda' then v.quantidade * coalesce(r.valor_por_venda,0)
      when 'valor_unico' then coalesce(r.valor_unico,0)
      when 'faixas' then v.quantidade * coalesce((
        select (fx->>'valor')::numeric from jsonb_array_elements(coalesce(r.faixas,'[]'::jsonb)) fx
        where v.quantidade >= coalesce((fx->>'de')::integer,0)
          and (nullif(fx->>'ate','') is null or v.quantidade <= (fx->>'ate')::integer)
        order by coalesce((fx->>'de')::integer,0) desc limit 1
      ),0)
      else v.valor_por_plano
    end
  end,
  comissao_detalhes=jsonb_build_object(
    'quantidade',v.quantidade,'meta',20,'liberada',v.quantidade>=20,
    'modo',coalesce(r.modo,'por_plano'),'valor_por_plano',v.valor_por_plano,
    'valor_por_venda',coalesce(r.valor_por_venda,0),'valor_unico',coalesce(r.valor_unico,0),
    'faixas',coalesce(r.faixas,'[]'::jsonb),'vendas',v.detalhes
  ), updated_at=now()
  from vendas v
  left join lateral (
    select regra.* from public.fin_comissao_regras regra
    join public.funcionarios f2 on f2.id=v.funcionario_id
    where regra.competencia=p_competencia and lower(trim(regra.vendedor)) in (
      lower(trim(coalesce(f2.nome,''))), lower(trim(coalesce(f2.email,''))), lower(trim(coalesce(f2.user_email,'')))
    ) limit 1
  ) r on true
  where fi.funcionario_id=v.funcionario_id and fi.competencia=p_competencia and fi.status<>'pago';
  get diagnostics v_total=row_count;
  return v_total;
end;
$$;

grant execute on function public.recalcular_comissoes(text) to authenticated;
