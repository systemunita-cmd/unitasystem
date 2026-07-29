-- Modalidades de comissão por vendedor e competência.
-- Inclusão aditiva: individual por cliente, valor por venda, faixas e valor único.

create table if not exists public.fin_comissao_regras (
  id uuid primary key default gen_random_uuid(),
  competencia text not null check (competencia ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  vendedor text not null,
  modo text not null default 'individual' check (modo in ('individual','por_venda','faixas','valor_unico')),
  valor_por_venda numeric not null default 0,
  valor_unico numeric not null default 0,
  faixas jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists fin_comissao_regras_comp_vendedor_uidx
  on public.fin_comissao_regras(competencia, lower(trim(vendedor)));

alter table public.fin_comissao_regras enable row level security;
drop policy if exists "fin_comissao_regras_financeiro" on public.fin_comissao_regras;
create policy "fin_comissao_regras_financeiro" on public.fin_comissao_regras
  for all to authenticated
  using (public.usuario_pode_acessar_financeiro())
  with check (public.usuario_pode_acessar_financeiro());

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
    select lower(trim(coalesce(p.vendedor,''))) vendedor_chave,
      count(*) quantidade,
      sum(coalesce(p.comissao_manual,0)) valor_individual,
      jsonb_agg(jsonb_build_object('proposta_id',p.id,'cliente',p.nome,'instalacao',p.data_instalacao,'valor',p.comissao_manual) order by p.data_instalacao) detalhes
    from public.proposta p
    where p.status_venda='INSTALADA'
      and to_char(p.data_instalacao::date,'YYYY-MM')=p_competencia
    group by lower(trim(coalesce(p.vendedor,'')))
  )
  update public.folha_itens fi
  set comissao = case when v.quantidade < 20 then 0 else
    case coalesce(r.modo,'individual')
      when 'por_venda' then v.quantidade * coalesce(r.valor_por_venda,0)
      when 'valor_unico' then coalesce(r.valor_unico,0)
      when 'faixas' then v.quantidade * coalesce((
        select (fx->>'valor')::numeric from jsonb_array_elements(coalesce(r.faixas,'[]'::jsonb)) fx
        where v.quantidade >= coalesce((fx->>'de')::integer,0)
          and (nullif(fx->>'ate','') is null or v.quantidade <= (fx->>'ate')::integer)
        order by coalesce((fx->>'de')::integer,0) desc limit 1
      ),0)
      else v.valor_individual
    end
  end,
  comissao_detalhes=jsonb_build_object(
    'quantidade',v.quantidade,'meta',20,'liberada',v.quantidade>=20,
    'modo',coalesce(r.modo,'individual'),'valor_individual',v.valor_individual,
    'valor_por_venda',coalesce(r.valor_por_venda,0),'valor_unico',coalesce(r.valor_unico,0),
    'faixas',coalesce(r.faixas,'[]'::jsonb),'vendas',v.detalhes
  ), updated_at=now()
  from public.funcionarios f
  join vendas v on v.vendedor_chave in (
    lower(trim(coalesce(f.nome,''))),lower(trim(coalesce(f.email,''))),lower(trim(coalesce(f.user_email,'')))
  )
  left join public.fin_comissao_regras r
    on r.competencia=p_competencia and lower(trim(r.vendedor))=v.vendedor_chave
  where fi.funcionario_id=f.id and fi.competencia=p_competencia and fi.status<>'pago';
  get diagnostics v_total=row_count;
  return v_total;
end;
$$;

grant select,insert,update,delete on public.fin_comissao_regras to authenticated;
grant execute on function public.recalcular_comissoes(text) to authenticated;

select public.sincronizar_financeiro_rh(to_char(current_date,'YYYY-MM'));