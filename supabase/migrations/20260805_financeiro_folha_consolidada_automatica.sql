-- Orquestrador administrativo: ponto, benefícios, comissão, bônus, encargos e título financeiro.

create or replace function public.consolidar_folha_financeiro(p_competencia text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sync jsonb;
  v_contabil integer := 0;
  v_total numeric;
  v_titulo uuid;
begin
  if not coalesce(public.usuario_pode_administrar_financeiro(), false)
     or not coalesce(public.rh_usuario_admin(), false) then
    raise exception 'Somente administradores podem consolidar a folha.' using errcode='42501';
  end if;
  if p_competencia !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then
    raise exception 'Competência inválida. Use AAAA-MM.';
  end if;
  if exists(select 1 from public.fin_competencias where competencia=p_competencia and status='fechada') then
    raise exception 'A competência % está fechada.', p_competencia;
  end if;

  -- O sincronizador gera a folha com ponto/benefícios e atualiza comissão e bônus.
  v_sync := public.sincronizar_financeiro_rh(p_competencia);
  -- Depois da comissão, atualiza INSS, IRRF, FGTS, DSR, provisões e encargos.
  v_contabil := public.aplicar_calculos_contabeis_folha(p_competencia);

  select coalesce(sum(
    greatest(0,
      coalesce(base,0) + coalesce(proventos,0) + coalesce(comissao,0) + coalesce(bonus_meta,0)
      - coalesce(desconto_horas,0) - coalesce(desconto_dsr,0)
    )
    + coalesce(vale_transporte,0) + coalesce(vale_alimentacao,0)
    + coalesce(beneficios,0) + coalesce(encargos_empresa,0)
  ),0)
  into v_total from public.folha_itens where competencia=p_competencia;

  select id into v_titulo from public.fin_titulos
  where origem_modulo='RH' and origem_tipo='folha' and origem_id=p_competencia limit 1;

  if v_titulo is not null then
    update public.fin_titulos set
      valor=v_total,
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
        'sincronizado_em',now(),'calculo','custo_empresa_consolidado'
      )
    where id=v_titulo and status<>'pago';
  end if;

  return coalesce(v_sync,'{}'::jsonb)||jsonb_build_object(
    'calculos_contabeis',v_contabil,'custo_empresa',v_total,'titulo_financeiro_id',v_titulo
  );
end;
$$;

revoke all on function public.consolidar_folha_financeiro(text) from public;
grant execute on function public.consolidar_folha_financeiro(text) to authenticated;
