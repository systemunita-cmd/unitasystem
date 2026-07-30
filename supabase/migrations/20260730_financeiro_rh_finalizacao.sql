-- Finalização aditiva do Financeiro/RH.
-- Inclui configuração inicial, conciliação automática conservadora,
-- consulta contextual de inadimplência e regularização de candidatos antigos.

insert into public.fin_categorias(nome, tipo, cor)
values
  ('Vendas e mensalidades', 'receber', '#65a30d'),
  ('Folha de pagamento', 'pagar', '#2563eb'),
  ('Benefícios', 'pagar', '#0f766e'),
  ('Encargos trabalhistas', 'pagar', '#7c3aed'),
  ('Comissões', 'pagar', '#ca8a04'),
  ('Fornecedores', 'pagar', '#dc2626'),
  ('Impostos e taxas', 'pagar', '#b45309'),
  ('Tarifas bancárias', 'pagar', '#64748b'),
  ('Outras receitas', 'receber', '#0891b2'),
  ('Outras despesas', 'pagar', '#475569')
on conflict (nome) do nothing;

insert into public.fin_centros_custo(nome, codigo)
values
  ('Administrativo', 'ADM'),
  ('Comercial', 'COM'),
  ('Financeiro', 'FIN'),
  ('Recursos Humanos', 'RH'),
  ('Instalação', 'INST'),
  ('Suporte', 'SUP')
on conflict do nothing;

create or replace function public.consultar_inadimplencia_cliente(
  p_documento text,
  p_nome text default null
) returns table (
  id uuid,
  cliente text,
  valor numeric,
  vencimento date,
  status text,
  origem text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    i.id,
    i.cliente,
    i.valor,
    i.vencimento,
    i.status,
    case when i.fatura_status_id is null then 'manual' else 'fatura' end
  from public.fin_inadimplencia i
  where i.status <> 'regularizada'
    and public.usuario_pode_ver_inadimplencia_comercial()
    and (
      (
        length(regexp_replace(coalesce(p_documento, ''), '\D', '', 'g')) >= 8
        and regexp_replace(coalesce(i.cpf, ''), '\D', '', 'g')
          = regexp_replace(coalesce(p_documento, ''), '\D', '', 'g')
      )
      or (
        nullif(trim(coalesce(p_nome, '')), '') is not null
        and lower(trim(i.cliente)) = lower(trim(p_nome))
      )
    )
  order by i.vencimento nulls last, i.created_at;
$$;

revoke all on function public.consultar_inadimplencia_cliente(text, text) from public;
grant execute on function public.consultar_inadimplencia_cliente(text, text) to authenticated;

create or replace function public.conciliar_extratos_automaticamente(
  p_competencia text,
  p_tolerancia_dias integer default 3,
  p_aplicar boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_extrato record;
  v_titulo record;
  v_candidatos integer;
  v_sugeridos integer := 0;
  v_conciliados integer := 0;
  v_ignorados integer := 0;
  v_erros integer := 0;
  v_resultado jsonb;
begin
  if not coalesce(public.usuario_pode_acessar_financeiro(), false) then
    raise exception 'Acesso financeiro não autorizado.';
  end if;
  if public.competencia_financeira_fechada(p_competencia) then
    raise exception 'COMPETENCIA_FECHADA: reabra a competência antes de conciliar.';
  end if;
  if p_tolerancia_dias < 0 or p_tolerancia_dias > 31 then
    raise exception 'A tolerância deve ficar entre 0 e 31 dias.';
  end if;

  for v_extrato in
    select e.*
    from public.fin_extratos e
    where to_char(e.data, 'YYYY-MM') = p_competencia
      and not e.conciliado
      and round(e.valor - coalesce(e.valor_alocado, 0), 2) > 0
    order by e.data, e.id
  loop
    v_candidatos := 0;
    select q.* into v_titulo
    from (
      select t.*, count(*) over () as total_candidatos
      from public.fin_titulos t
      where t.tipo = case when v_extrato.tipo = 'credito' then 'receber' else 'pagar' end
        and t.status <> 'cancelado'
        and round(t.valor - coalesce(t.valor_conciliado, 0), 2)
          = round(v_extrato.valor - coalesce(v_extrato.valor_alocado, 0), 2)
        and abs(t.vencimento - v_extrato.data) <= p_tolerancia_dias
        and not public.competencia_financeira_fechada(t.competencia)
    ) q
    limit 1;
    if found then
      v_candidatos := v_titulo.total_candidatos;
    end if;

    if v_candidatos <> 1 then
      v_ignorados := v_ignorados + 1;
      continue;
    end if;

    v_sugeridos := v_sugeridos + 1;
    if p_aplicar then
      begin
        v_resultado := public.conciliar_extrato_avancado(
          v_extrato.id,
          jsonb_build_array(jsonb_build_object(
            'tipo', 'titulo',
            'titulo_id', v_titulo.id,
            'valor', round(v_extrato.valor - coalesce(v_extrato.valor_alocado, 0), 2)
          )),
          format(
            'Conciliação automática: valor exato e vencimento com diferença de até %s dia(s).',
            p_tolerancia_dias
          )
        );
        v_conciliados := v_conciliados + 1;
      exception when others then
        v_erros := v_erros + 1;
      end;
    end if;
  end loop;

  return jsonb_build_object(
    'competencia', p_competencia,
    'modo', case when p_aplicar then 'aplicado' else 'simulacao' end,
    'sugeridos', v_sugeridos,
    'conciliados', v_conciliados,
    'ignorados', v_ignorados,
    'erros', v_erros,
    'criterio', 'valor exato, tipo compatível, título único e vencimento dentro da tolerância'
  );
end;
$$;

revoke all on function public.conciliar_extratos_automaticamente(text, integer, boolean) from public;
grant execute on function public.conciliar_extratos_automaticamente(text, integer, boolean) to authenticated;

create or replace function public.regularizar_candidatos_contratados()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_antes integer;
  v_depois integer;
begin
  select count(*) into v_antes
  from public.candidatos
  where lower(trim(coalesce(etapa, ''))) in ('contratado', 'aprovado')
    and funcionario_id is null;

  update public.candidatos
  set etapa = etapa
  where lower(trim(coalesce(etapa, ''))) in ('contratado', 'aprovado')
    and funcionario_id is null;

  select count(*) into v_depois
  from public.candidatos
  where lower(trim(coalesce(etapa, ''))) in ('contratado', 'aprovado')
    and funcionario_id is null;

  return jsonb_build_object(
    'pendentes_antes', v_antes,
    'convertidos', v_antes - v_depois,
    'pendentes_depois', v_depois
  );
end;
$$;

revoke all on function public.regularizar_candidatos_contratados() from public;
grant execute on function public.regularizar_candidatos_contratados() to authenticated;

select public.regularizar_candidatos_contratados();
