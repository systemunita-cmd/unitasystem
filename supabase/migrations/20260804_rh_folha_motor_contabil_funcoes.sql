-- RPCs protegidas do motor contábil. Depende de 20260804_rh_folha_motor_contabil.sql.
create or replace function public.obter_regras_folha()
returns public.rh_regras_folha language plpgsql stable security definer set search_path=public as $$
begin
  if not public.rh_usuario_admin() then raise exception 'Acesso restrito à administração.'; end if;
  return (select r from public.rh_regras_folha r where id=1);
end $$;

create or replace function public.listar_eventos_folha(p_competencia text,p_funcionario_id uuid default null)
returns setof public.rh_folha_eventos language plpgsql stable security definer set search_path=public as $$
begin
  if not public.rh_usuario_admin() then raise exception 'Acesso restrito à administração.'; end if;
  return query select * from public.rh_folha_eventos where competencia=p_competencia and (p_funcionario_id is null or funcionario_id=p_funcionario_id) order by created_at;
end $$;

create or replace function public.salvar_evento_folha(p_evento jsonb)
returns public.rh_folha_eventos language plpgsql security definer set search_path=public as $ev$
declare v public.rh_folha_eventos%rowtype; v_id uuid:=nullif(p_evento->>'id','')::uuid;
begin
  if not public.rh_usuario_admin() then raise exception 'Somente o administrador pode editar eventos da folha.'; end if;
  if v_id is null then
    insert into public.rh_folha_eventos(competencia,funcionario_id,tipo,descricao,referencia,valor,natureza,incide_inss,incide_fgts,incide_irrf,observacao)
    values(p_evento->>'competencia',(p_evento->>'funcionario_id')::uuid,p_evento->>'tipo',p_evento->>'descricao',coalesce((p_evento->>'referencia')::numeric,0),coalesce((p_evento->>'valor')::numeric,0),p_evento->>'natureza',coalesce((p_evento->>'incide_inss')::boolean,false),coalesce((p_evento->>'incide_fgts')::boolean,false),coalesce((p_evento->>'incide_irrf')::boolean,false),p_evento->>'observacao') returning * into v;
  else
    update public.rh_folha_eventos set tipo=p_evento->>'tipo',descricao=p_evento->>'descricao',referencia=coalesce((p_evento->>'referencia')::numeric,0),valor=coalesce((p_evento->>'valor')::numeric,0),natureza=p_evento->>'natureza',incide_inss=coalesce((p_evento->>'incide_inss')::boolean,false),incide_fgts=coalesce((p_evento->>'incide_fgts')::boolean,false),incide_irrf=coalesce((p_evento->>'incide_irrf')::boolean,false),observacao=p_evento->>'observacao',updated_at=now() where id=v_id and not automatico returning * into v;
  end if;
  if v.id is null then raise exception 'Evento não encontrado ou automático.'; end if;
  return v;
end $ev$;

create or replace function public.excluir_evento_folha(p_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.rh_usuario_admin() then raise exception 'Somente o administrador pode excluir eventos da folha.'; end if;
  delete from public.rh_folha_eventos where id=p_id and not automatico;
end $$;

create or replace function public.salvar_regras_folha(p_regras jsonb)
returns public.rh_regras_folha language plpgsql security definer set search_path=public as $fn$
declare v public.rh_regras_folha%rowtype;
begin
  if not public.rh_usuario_admin() then raise exception 'Somente o super administrador pode alterar as regras da folha.'; end if;
  update public.rh_regras_folha set
    divisor_salario_dias=greatest(coalesce((p_regras->>'divisor_salario_dias')::numeric,divisor_salario_dias),1), percentual_fgts=coalesce((p_regras->>'percentual_fgts')::numeric,percentual_fgts),
    percentual_inss_patronal=coalesce((p_regras->>'percentual_inss_patronal')::numeric,percentual_inss_patronal), percentual_rat=coalesce((p_regras->>'percentual_rat')::numeric,percentual_rat),
    percentual_terceiros=coalesce((p_regras->>'percentual_terceiros')::numeric,percentual_terceiros), percentual_vt_empregado=coalesce((p_regras->>'percentual_vt_empregado')::numeric,percentual_vt_empregado),
    calcular_dsr_faltas=coalesce((p_regras->>'calcular_dsr_faltas')::boolean,calcular_dsr_faltas), max_dsr_mes=greatest(coalesce((p_regras->>'max_dsr_mes')::integer,max_dsr_mes),0),
    deducao_irrf_dependente=coalesce((p_regras->>'deducao_irrf_dependente')::numeric,deducao_irrf_dependente), deducao_irrf_simplificada=coalesce((p_regras->>'deducao_irrf_simplificada')::numeric,deducao_irrf_simplificada),
    usar_deducao_irrf_simplificada=coalesce((p_regras->>'usar_deducao_irrf_simplificada')::boolean,usar_deducao_irrf_simplificada), provisionar_decimo=coalesce((p_regras->>'provisionar_decimo')::boolean,provisionar_decimo),
    provisionar_ferias=coalesce((p_regras->>'provisionar_ferias')::boolean,provisionar_ferias), atualizado_por=lower(coalesce(auth.jwt()->>'email','')),updated_at=now()
  where id=1 returning * into v;
  return v;
end $fn$;

create or replace function public.aplicar_calculos_contabeis_folha(p_competencia text)
returns integer language plpgsql security definer set search_path=public as $motor$
declare x record; r public.rh_regras_folha%rowtype; vi date; vf date; dm numeric; da numeric; sal numeric; prop numeric; dsr numeric; prov numeric; des numeric; pinss numeric; dinss numeric; pfgts numeric; dfgts numeric; pirrf numeric; dirrf numeric; binss numeric; bfgts numeric; birrf numeric; vinss numeric; vfgts numeric; virrf numeric; n integer:=0;
begin
  if not public.rh_usuario_admin() then raise exception 'Somente o administrador pode recalcular a folha.'; end if;
  if p_competencia !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then raise exception 'Competência inválida.'; end if;
  if exists(select 1 from public.fin_competencias where competencia=p_competencia and status='fechada') then raise exception 'A competência % está fechada.',p_competencia; end if;
  select * into r from public.rh_regras_folha where id=1; vi:=to_date(p_competencia||'-01','YYYY-MM-DD'); vf:=(vi+interval '1 month'-interval '1 day')::date; dm:=extract(day from vf);
  for x in select fi.*,f.admissao,f.desligamento,f.dependentes_irrf,f.salario salario_rh,coalesce(bh.dias_falta,0) dias_falta from public.folha_itens fi join public.funcionarios f on f.id=fi.funcionario_id left join lateral(select * from public.calcular_banco_horas(p_competencia,f.id,now()) limit 1) bh on true where fi.competencia=p_competencia and fi.status<>'pago' loop
    sal:=coalesce(nullif(x.salario_rh,0),x.base,0); da:=greatest(0,least(vf,coalesce(x.desligamento,vf))-greatest(vi,coalesce(x.admissao,vi))+1); prop:=round(sal*least(da,r.divisor_salario_dias)/greatest(r.divisor_salario_dias,1),2); dsr:=case when r.calcular_dsr_faltas then round((sal/greatest(r.divisor_salario_dias,1))*least(x.dias_falta,r.max_dsr_mes),2) else 0 end;
    select coalesce(sum(valor) filter(where natureza='provento'),0),coalesce(sum(valor) filter(where natureza='desconto'),0),coalesce(sum(valor) filter(where natureza='provento' and incide_inss),0),coalesce(sum(valor) filter(where natureza='desconto' and incide_inss),0),coalesce(sum(valor) filter(where natureza='provento' and incide_fgts),0),coalesce(sum(valor) filter(where natureza='desconto' and incide_fgts),0),coalesce(sum(valor) filter(where natureza='provento' and incide_irrf),0),coalesce(sum(valor) filter(where natureza='desconto' and incide_irrf),0) into prov,des,pinss,dinss,pfgts,dfgts,pirrf,dirrf from public.rh_folha_eventos where competencia=p_competencia and funcionario_id=x.funcionario_id and ativo;
    binss:=round(greatest(0,prop-coalesce(x.desconto_horas,0)-dsr+coalesce(x.comissao,0)+coalesce(x.bonus_meta,0)+pinss-dinss),2); bfgts:=round(greatest(0,prop-coalesce(x.desconto_horas,0)-dsr+coalesce(x.comissao,0)+coalesce(x.bonus_meta,0)+pfgts-dfgts),2); vinss:=public.calcular_inss_2026(binss); vfgts:=round(bfgts*r.percentual_fgts/100,2); birrf:=greatest(0,prop-coalesce(x.desconto_horas,0)-dsr+coalesce(x.comissao,0)+coalesce(x.bonus_meta,0)+pirrf-dirrf-vinss-greatest(coalesce(x.dependentes_irrf,0)*r.deducao_irrf_dependente,case when r.usar_deducao_irrf_simplificada then r.deducao_irrf_simplificada else 0 end)); virrf:=public.calcular_irrf_folha(birrf);
    update public.folha_itens set salario_cadastrado=sal,salario_proporcional=prop,base=prop,proventos=coalesce(x.proventos_manuais,0)+prov,outros=coalesce(x.outros_manuais,0)+des,desconto_dsr=dsr,eventos_proventos=prov,eventos_descontos=des,base_inss=binss,inss=vinss,base_fgts=bfgts,fgts=vfgts,base_irrf=birrf,irrf=virrf,inss_patronal=round(binss*r.percentual_inss_patronal/100,2),rat=round(binss*r.percentual_rat/100,2),terceiros=round(binss*r.percentual_terceiros/100,2),provisao_decimo=case when r.provisionar_decimo then round(bfgts/12,2) else 0 end,provisao_ferias=case when r.provisionar_ferias then round(bfgts/9,2) else 0 end,provisao_fgts=round((case when r.provisionar_decimo then bfgts/12 else 0 end+case when r.provisionar_ferias then bfgts/9 else 0 end)*r.percentual_fgts/100,2),encargos_empresa=vfgts+round(binss*(r.percentual_inss_patronal+r.percentual_rat+r.percentual_terceiros)/100,2)+case when r.provisionar_decimo then round(bfgts/12,2) else 0 end+case when r.provisionar_ferias then round(bfgts/9,2) else 0 end+round((case when r.provisionar_decimo then bfgts/12 else 0 end+case when r.provisionar_ferias then bfgts/9 else 0 end)*r.percentual_fgts/100,2),desconto_vale_transporte=round(least(coalesce(vale_transporte,0),sal*r.percentual_vt_empregado/100),2),memoria_calculo=coalesce(memoria_calculo,'{}')||jsonb_build_object('salario_cadastrado',sal,'dias_mes',dm,'dias_ativos',da,'salario_proporcional',prop,'dias_falta',x.dias_falta,'desconto_dsr',dsr,'eventos_proventos',prov,'eventos_descontos',des,'base_irrf',birrf),updated_at=now() where id=x.id; n:=n+1;
  end loop; return n;
end $motor$;

grant execute on function public.obter_regras_folha() to authenticated;
grant execute on function public.listar_eventos_folha(text,uuid) to authenticated;
grant execute on function public.salvar_evento_folha(jsonb) to authenticated;
grant execute on function public.excluir_evento_folha(uuid) to authenticated;
grant execute on function public.salvar_regras_folha(jsonb) to authenticated;
grant execute on function public.aplicar_calculos_contabeis_folha(text) to authenticated;
