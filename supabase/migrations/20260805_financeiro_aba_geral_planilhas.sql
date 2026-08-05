-- Aba Geral do Financeiro inspirada no CAIXA GERAL ABRIL 2026.
-- Inclusão aditiva: mantém as telas e os lançamentos financeiros existentes.

alter table public.fin_titulos
  add column if not exists planilha_grupo text not null default 'empresa',
  add column if not exists juros_multa numeric not null default 0;

update public.fin_titulos
set planilha_grupo = 'pessoal'
where planilha_grupo = 'empresa'
  and (
    lower(coalesce(categoria, '')) like '%pessoal%'
    or lower(coalesce(centro_custo, '')) like '%pessoal%'
  );

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'fin_titulos_planilha_grupo_check'
      and conrelid = 'public.fin_titulos'::regclass
  ) then
    alter table public.fin_titulos
      add constraint fin_titulos_planilha_grupo_check
      check (planilha_grupo in ('pessoal', 'empresa'));
  end if;
end $$;

create table if not exists public.fin_planilha_regras (
  id smallint primary key default 1 check (id = 1),
  percentual_imposto_hsi numeric not null default 10 check (percentual_imposto_hsi between 0 and 100),
  percentual_desconto_supervisor numeric not null default 20 check (percentual_desconto_supervisor between 0 and 100),
  valor_venda_supervisor numeric not null default 10 check (valor_venda_supervisor >= 0),
  atualizado_por text,
  updated_at timestamptz not null default now()
);

insert into public.fin_planilha_regras(id) values (1) on conflict (id) do nothing;

alter table public.fin_planilha_regras enable row level security;
drop policy if exists "fin_planilha_regras_leitura" on public.fin_planilha_regras;
create policy "fin_planilha_regras_leitura" on public.fin_planilha_regras
  for select to authenticated using (public.usuario_pode_acessar_financeiro());
drop policy if exists "fin_planilha_regras_admin" on public.fin_planilha_regras;
create policy "fin_planilha_regras_admin" on public.fin_planilha_regras
  for all to authenticated
  using (public.usuario_pode_administrar_financeiro())
  with check (public.usuario_pode_administrar_financeiro());

grant select on public.fin_planilha_regras to authenticated;

create or replace function public.salvar_fin_planilha_regras(
  p_percentual_imposto_hsi numeric,
  p_percentual_desconto_supervisor numeric,
  p_valor_venda_supervisor numeric
)
returns public.fin_planilha_regras
language plpgsql
security definer
set search_path = public
as $$
declare
  v_resultado public.fin_planilha_regras;
  v_email text := lower(coalesce(auth.jwt()->>'email', ''));
begin
  if not coalesce(public.usuario_pode_administrar_financeiro(), false) then
    raise exception 'Somente administradores podem alterar os padrões das planilhas.' using errcode = '42501';
  end if;
  if p_percentual_imposto_hsi not between 0 and 100
     or p_percentual_desconto_supervisor not between 0 and 100
     or coalesce(p_valor_venda_supervisor, -1) < 0 then
    raise exception 'Revise os percentuais e valores informados.';
  end if;
  insert into public.fin_planilha_regras(
    id, percentual_imposto_hsi, percentual_desconto_supervisor,
    valor_venda_supervisor, atualizado_por, updated_at
  ) values (
    1, p_percentual_imposto_hsi, p_percentual_desconto_supervisor,
    p_valor_venda_supervisor, v_email, now()
  )
  on conflict (id) do update set
    percentual_imposto_hsi = excluded.percentual_imposto_hsi,
    percentual_desconto_supervisor = excluded.percentual_desconto_supervisor,
    valor_venda_supervisor = excluded.valor_venda_supervisor,
    atualizado_por = excluded.atualizado_por,
    updated_at = now()
  returning * into v_resultado;
  return v_resultado;
end;
$$;

revoke all on function public.salvar_fin_planilha_regras(numeric,numeric,numeric) from public;
grant execute on function public.salvar_fin_planilha_regras(numeric,numeric,numeric) to authenticated;

create or replace function public.classificar_fin_titulo_planilha(
  p_titulo_id uuid,
  p_grupo text,
  p_juros_multa numeric default 0
)
returns public.fin_titulos
language plpgsql
security definer
set search_path = public
as $$
declare v_resultado public.fin_titulos;
begin
  if not coalesce(public.usuario_pode_administrar_financeiro(), false) then
    raise exception 'Somente administradores podem classificar lançamentos.' using errcode = '42501';
  end if;
  if p_grupo not in ('pessoal', 'empresa') or coalesce(p_juros_multa, -1) < 0 then
    raise exception 'Grupo ou juros/multa inválido.';
  end if;
  update public.fin_titulos
  set planilha_grupo = p_grupo, juros_multa = p_juros_multa, updated_at = now()
  where id = p_titulo_id
  returning * into v_resultado;
  if v_resultado.id is null then raise exception 'Lançamento não encontrado.'; end if;
  return v_resultado;
end;
$$;

revoke all on function public.classificar_fin_titulo_planilha(uuid,text,numeric) from public;
grant execute on function public.classificar_fin_titulo_planilha(uuid,text,numeric) to authenticated;
