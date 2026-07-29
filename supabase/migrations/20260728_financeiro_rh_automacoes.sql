-- Automações finais Financeiro + RH. Inclusão aditiva e idempotente.

alter table public.fin_titulos add column if not exists centro_custo text;

create unique index if not exists fin_titulos_origem_unica_uidx
  on public.fin_titulos(origem_modulo, origem_tipo, origem_id)
  where origem_modulo is not null and origem_tipo is not null and origem_id is not null;

create unique index if not exists fin_metas_escopo_uidx
  on public.fin_metas(competencia, coalesce(vendedor,''), coalesce(equipe_id,0));

create or replace function public.gerar_folha_integrada(p_competencia text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total integer := 0;
begin
  if p_competencia !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then
    raise exception 'Competência inválida. Use AAAA-MM.';
  end if;
  if exists(select 1 from public.fin_competencias where competencia=p_competencia and status='fechada') then
    raise exception 'A competência % está fechada.', p_competencia;
  end if;

  insert into public.folha_itens (
    competencia, funcionario_id, nome, cargo, base, proventos, comissao,
    inss, irrf, outros, status, vale_transporte, vale_alimentacao,
    beneficios, encargos_empresa, origem, updated_at
  )
  select p_competencia, f.id, f.nome, coalesce(f.cargo,''), coalesce(f.salario,0),
    coalesce(vt.total,0)+coalesce(va.total,0)+coalesce(b.total,0), 0, 0, 0, 0,
    'pendente', coalesce(vt.total,0), coalesce(va.total,0), coalesce(b.total,0),
    round(coalesce(f.salario,0)*0.288,2), 'rh_automatico', now()
  from public.funcionarios f
  left join lateral (
    select sum(coalesce(x.valor_diario,0)*coalesce(x.dias_uteis,0)) total
    from public.vale_transporte x where lower(trim(x.nome))=lower(trim(f.nome))
  ) vt on true
  left join lateral (
    select sum(coalesce(x.valor_diario,0)*coalesce(x.dias,22)) total
    from public.vale_refeicao x where lower(trim(x.nome))=lower(trim(f.nome))
  ) va on true
  left join lateral (
    select sum(coalesce(rbf.valor_empresa,bn.custo_empresa,0)) total
    from public.rh_beneficio_funcionarios rbf
    join public.beneficios bn on bn.id=rbf.beneficio_id
    where rbf.funcionario_id=f.id and rbf.ativo
  ) b on true
  where coalesce(lower(f.status),'ativo') <> 'desligado'
  on conflict (competencia, funcionario_id) where funcionario_id is not null
  do update set
    nome=excluded.nome, cargo=excluded.cargo, base=excluded.base,
    proventos=excluded.proventos, vale_transporte=excluded.vale_transporte,
    vale_alimentacao=excluded.vale_alimentacao, beneficios=excluded.beneficios,
    encargos_empresa=excluded.encargos_empresa, origem='rh_automatico', updated_at=now()
  where folha_itens.status <> 'pago';

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
  v_total numeric;
  v_titulo uuid;
begin
  v_folha := public.gerar_folha_integrada(p_competencia);
  v_comissoes := public.recalcular_comissoes(p_competencia);

  select coalesce(sum(coalesce(base,0)+coalesce(vale_transporte,0)+coalesce(vale_alimentacao,0)+
    coalesce(beneficios,0)+coalesce(encargos_empresa,0)+coalesce(comissao,0)),0)
  into v_total from public.folha_itens where competencia=p_competencia;

  select id into v_titulo from public.fin_titulos
   where origem_modulo='RH' and origem_tipo='folha' and origem_id=p_competencia limit 1;
  if v_titulo is null then
    insert into public.fin_titulos(tipo,descricao,parte,valor,competencia,vencimento,status,categoria,
      centro_custo,origem_modulo,origem_tipo,origem_id,metadata)
    values('pagar','Folha integrada '||p_competencia,'Colaboradores',v_total,p_competencia,
      (date_trunc('month',(p_competencia||'-01')::date)+interval '1 month - 1 day')::date,
      'pendente','Folha','RH','RH','folha',p_competencia,
      jsonb_build_object('gerado_automaticamente',true,'sincronizado_em',now()))
    returning id into v_titulo;
  else
    update public.fin_titulos set valor=v_total, competencia=p_competencia,
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('sincronizado_em',now())
    where id=v_titulo and status <> 'pago';
  end if;

  return jsonb_build_object('folha_processada',v_folha,'comissoes_atualizadas',v_comissoes,
    'titulo_financeiro_id',v_titulo,'total',v_total);
end;
$$;

create or replace function public.rh_sincronizar_competencia_atual()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  perform public.sincronizar_financeiro_rh(to_char(current_date,'YYYY-MM'));
  if tg_op = 'DELETE' then return old; end if;
  return new;
exception when others then
  raise warning 'Sincronização automática RH/Financeiro pendente: %', sqlerrm;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists funcionarios_financeiro_sync on public.funcionarios;
create trigger funcionarios_financeiro_sync after insert or update of nome,cargo,salario,status on public.funcionarios
for each row execute function public.rh_sincronizar_competencia_atual();

drop trigger if exists vale_transporte_financeiro_sync on public.vale_transporte;
create trigger vale_transporte_financeiro_sync after insert or update or delete on public.vale_transporte
for each row execute function public.rh_sincronizar_competencia_atual();

drop trigger if exists vale_refeicao_financeiro_sync on public.vale_refeicao;
create trigger vale_refeicao_financeiro_sync after insert or update or delete on public.vale_refeicao
for each row execute function public.rh_sincronizar_competencia_atual();

drop trigger if exists beneficio_funcionario_financeiro_sync on public.rh_beneficio_funcionarios;
create trigger beneficio_funcionario_financeiro_sync after insert or update or delete on public.rh_beneficio_funcionarios
for each row execute function public.rh_sincronizar_competencia_atual();

drop trigger if exists proposta_comissao_financeiro_sync on public.proposta;
create trigger proposta_comissao_financeiro_sync
  after insert or update of status_venda,data_instalacao,vendedor,comissao_manual,instalacao_auditada
  on public.proposta for each row execute function public.rh_sincronizar_competencia_atual();

create or replace function public.fin_titulo_alerta_automatico()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.status <> 'pago' and new.vencimento is not null and new.vencimento <= current_date+3 then
    insert into public.fin_alertas(tipo,titulo,mensagem,referencia_tipo,referencia_id,vencimento)
    values(case when new.vencimento<current_date then 'vencida' else 'proximo_vencimento' end,
      case when new.tipo='pagar' then 'Conta a pagar' else 'Conta a receber' end,
      new.descricao,'fin_titulos',new.id::text,new.vencimento)
    on conflict do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists fin_titulo_alerta_sync on public.fin_titulos;
create trigger fin_titulo_alerta_sync after insert or update of vencimento,status on public.fin_titulos
for each row execute function public.fin_titulo_alerta_automatico();

grant execute on function public.rh_sincronizar_competencia_atual() to authenticated;
create or replace function public.usuario_pode_ver_inadimplencia_comercial()
returns boolean language sql stable security definer set search_path=public as $$
 select exists(
  select 1 from public.usuarios u left join public.grupos_permissao g on g.id=u.grupo_id
  where u.auth_user_id=auth.uid() and coalesce(u.ativo,true) and (
   u.role in ('admin','supervisor') or lower(u.email)='admin@grupounita.net.br'
   or public.usuario_pode_acessar_financeiro()
   or coalesce(g.permissoes->>'vendas.ver','off') not in ('off','none','false','')
  )
 );
$$;
revoke all on function public.usuario_pode_ver_inadimplencia_comercial() from public;
grant execute on function public.usuario_pode_ver_inadimplencia_comercial() to authenticated;
drop policy if exists "fin_inadimplencia_comercial_select" on public.fin_inadimplencia;
create policy "fin_inadimplencia_comercial_select" on public.fin_inadimplencia
 for select to authenticated using (public.usuario_pode_ver_inadimplencia_comercial());