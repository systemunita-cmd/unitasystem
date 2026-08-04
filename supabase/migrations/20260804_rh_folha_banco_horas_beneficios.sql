-- RH: cadastro único de benefícios, banco de horas temporal e folha auditável.
-- A jornada padrão pode ser ajustada por funcionário no cadastro do RH.

alter table public.funcionarios
  add column if not exists carga_horaria_mensal numeric not null default 220,
  add column if not exists jornada_inicio time not null default '08:00',
  add column if not exists intervalo_inicio time not null default '12:00',
  add column if not exists intervalo_fim time not null default '13:00',
  add column if not exists jornada_fim time not null default '17:00';

alter table public.vale_transporte
  add column if not exists funcionario_id uuid references public.funcionarios(id) on delete cascade,
  add column if not exists periodicidade text not null default 'diario',
  add column if not exists valor_mensal numeric not null default 0;

alter table public.vale_refeicao
  add column if not exists funcionario_id uuid references public.funcionarios(id) on delete cascade,
  add column if not exists periodicidade text not null default 'diario',
  add column if not exists valor_mensal numeric not null default 0;

update public.vale_transporte vt set funcionario_id=f.id
from public.funcionarios f
where vt.funcionario_id is null and lower(trim(vt.nome))=lower(trim(f.nome));

update public.vale_refeicao vr set funcionario_id=f.id
from public.funcionarios f
where vr.funcionario_id is null and lower(trim(vr.nome))=lower(trim(f.nome));

alter table public.vale_transporte drop constraint if exists vale_transporte_periodicidade_check;
alter table public.vale_transporte add constraint vale_transporte_periodicidade_check
  check (periodicidade in ('diario','mensal'));
alter table public.vale_refeicao drop constraint if exists vale_refeicao_periodicidade_check;
alter table public.vale_refeicao add constraint vale_refeicao_periodicidade_check
  check (periodicidade in ('diario','mensal'));

alter table public.folha_itens
  add column if not exists horas_previstas_min integer not null default 0,
  add column if not exists horas_trabalhadas_min integer not null default 0,
  add column if not exists saldo_banco_min integer not null default 0,
  add column if not exists desconto_horas numeric not null default 0,
  add column if not exists desconto_beneficios numeric not null default 0,
  add column if not exists desconto_vale_transporte numeric not null default 0,
  add column if not exists base_inss numeric not null default 0,
  add column if not exists base_fgts numeric not null default 0,
  add column if not exists fgts numeric not null default 0,
  add column if not exists memoria_calculo jsonb not null default '{}'::jsonb;

create or replace function public.calcular_inss_2026(p_base numeric)
returns numeric language sql immutable as $$
  select round(greatest(0,
    least(coalesce(p_base,0),1621.00)*0.075 +
    greatest(least(coalesce(p_base,0),2902.84)-1621.00,0)*0.09 +
    greatest(least(coalesce(p_base,0),4354.27)-2902.84,0)*0.12 +
    greatest(least(coalesce(p_base,0),8475.55)-4354.27,0)*0.14
  ),2)
$$;

create or replace function public.calcular_banco_horas(
  p_competencia text,
  p_funcionario_id uuid default null,
  p_ate timestamptz default now()
)
returns table(
  funcionario_id uuid, nome text, horas_previstas_min integer,
  horas_trabalhadas_min integer, saldo_min integer,
  debito_min integer, credito_min integer, dias_falta integer,
  calculado_ate timestamptz
)
language sql stable security definer set search_path=public as $$
with params as (
  select to_date(p_competencia||'-01','YYYY-MM-DD') inicio,
         (to_date(p_competencia||'-01','YYYY-MM-DD')+interval '1 month' - interval '1 day')::date fim,
         (p_ate at time zone 'America/Sao_Paulo') local_ate
), funcs as (
  select f.*, coalesce(f.jornada_inicio,'08:00'::time) ini,
         coalesce(f.intervalo_inicio,'12:00'::time) int_ini,
         coalesce(f.intervalo_fim,'13:00'::time) int_fim,
         coalesce(f.jornada_fim,'17:00'::time) fim
  from public.funcionarios f
  where coalesce(lower(f.status),'ativo')<>'desligado'
    and (p_funcionario_id is null or f.id=p_funcionario_id)
), dias as (
  select f.id funcionario_id,f.nome,f.ini,f.int_ini,f.int_fim,f.fim,
         d::date dia,p.local_ate,p_ate
  from funcs f cross join params p
  cross join lateral generate_series(greatest(p.inicio,coalesce(f.admissao,p.inicio)),least(p.fim,p.local_ate::date),interval '1 day') d
), marcacoes as (
  select d.*,
    exists(select 1 from public.ponto_registros pr where lower(trim(pr.funcionario))=lower(trim(d.nome))
      and (pr.data_hora at time zone 'America/Sao_Paulo')::date=d.dia
      and lower(coalesce(pr.tipo,'')) in ('folga','atestado','falta justificada','ferias','férias','licenca','licença')) abonado
  from dias d
), esperado as (
  select m.*,
    case
      when extract(dow from dia)=0 or abonado then 0
      when dia<local_ate::date then case when extract(dow from dia)=6 then 240 else
        greatest(0,extract(epoch from (int_ini-ini))/60)::int + greatest(0,extract(epoch from (fim-int_fim))/60)::int end
      when extract(dow from dia)=6 then greatest(0,least(240,extract(epoch from (local_ate::time-ini))/60))::int
      else greatest(0,least(extract(epoch from (int_ini-ini))/60,
             extract(epoch from (local_ate::time-ini))/60))::int
           + greatest(0,least(extract(epoch from (fim-int_fim))/60,
             extract(epoch from (local_ate::time-int_fim))/60))::int
    end previsto_min
  from marcacoes m
), batidas as (
  select e.funcionario_id,e.nome,e.dia,e.previsto_min,e.p_ate,
         pr.data_hora,
         row_number() over(partition by e.funcionario_id,e.dia order by pr.data_hora) rn,
         lead(pr.data_hora) over(partition by e.funcionario_id,e.dia order by pr.data_hora) prox
  from esperado e
  left join public.ponto_registros pr
    on lower(trim(pr.funcionario))=lower(trim(e.nome))
   and (pr.data_hora at time zone 'America/Sao_Paulo')::date=e.dia
   and lower(coalesce(pr.tipo,'')) not in ('folga','falta','falta justificada','atestado','ferias','férias','licenca','licença')
), por_dia as (
  select funcionario_id,nome,dia,max(previsto_min)::int previsto_min,
    coalesce(sum(case when data_hora is not null and rn%2=1 then
      greatest(0,extract(epoch from (coalesce(prox,case when dia=(p_ate at time zone 'America/Sao_Paulo')::date then p_ate end)-data_hora))/60)
      else 0 end),0)::int trabalhado_min
  from batidas group by funcionario_id,nome,dia
), total as (
  select funcionario_id,nome,sum(previsto_min)::int previstos,sum(trabalhado_min)::int trabalhados,
         count(*) filter(where previsto_min>0 and trabalhado_min=0)::int faltas
  from por_dia group by funcionario_id,nome
)
select funcionario_id,nome,previstos,trabalhados,(trabalhados-previstos)::int,
       greatest(previstos-trabalhados,0)::int,greatest(trabalhados-previstos,0)::int,
       faltas,p_ate
from total
$$;

create or replace function public.salvar_beneficios_funcionario(
  p_funcionario_id uuid,
  p_vt_ativo boolean, p_vt_periodicidade text, p_vt_valor numeric, p_vt_dias integer, p_vt_linha text,
  p_va_ativo boolean, p_va_periodicidade text, p_va_valor numeric, p_va_dias integer, p_va_modalidade text
)
returns void language plpgsql security definer set search_path=public as $$
declare f public.funcionarios%rowtype; v_vt_id public.vale_transporte.id%type; v_va_id public.vale_refeicao.id%type;
begin
  select * into f from public.funcionarios where id=p_funcionario_id;
  if not found then raise exception 'Funcionário não encontrado.'; end if;
  if p_vt_ativo then
    select id into v_vt_id from public.vale_transporte where funcionario_id=f.id or (funcionario_id is null and lower(trim(nome))=lower(trim(f.nome))) order by created_at desc limit 1;
    if v_vt_id is null then
      insert into public.vale_transporte(funcionario_id,nome,cargo,salario,linha,periodicidade,valor_diario,valor_mensal,dias_uteis)
      values(f.id,f.nome,coalesce(f.cargo,''),coalesce(f.salario,0),coalesce(p_vt_linha,''),p_vt_periodicidade,case when p_vt_periodicidade='diario' then coalesce(p_vt_valor,0) else 0 end,case when p_vt_periodicidade='mensal' then coalesce(p_vt_valor,0) else 0 end,coalesce(p_vt_dias,22));
    else
      update public.vale_transporte set funcionario_id=f.id,nome=f.nome,cargo=coalesce(f.cargo,''),salario=coalesce(f.salario,0),linha=coalesce(p_vt_linha,''),periodicidade=p_vt_periodicidade,valor_diario=case when p_vt_periodicidade='diario' then coalesce(p_vt_valor,0) else 0 end,valor_mensal=case when p_vt_periodicidade='mensal' then coalesce(p_vt_valor,0) else 0 end,dias_uteis=coalesce(p_vt_dias,22) where id=v_vt_id;
    end if;
  else delete from public.vale_transporte where funcionario_id=f.id; end if;
  if p_va_ativo then
    select id into v_va_id from public.vale_refeicao where funcionario_id=f.id or (funcionario_id is null and lower(trim(nome))=lower(trim(f.nome))) order by created_at desc limit 1;
    if v_va_id is null then
      insert into public.vale_refeicao(funcionario_id,nome,cargo,modalidade,operadora,periodicidade,valor_diario,valor_mensal,dias)
      values(f.id,f.nome,coalesce(f.cargo,''),coalesce(p_va_modalidade,'Alimentação'),'',p_va_periodicidade,case when p_va_periodicidade='diario' then coalesce(p_va_valor,0) else 0 end,case when p_va_periodicidade='mensal' then coalesce(p_va_valor,0) else 0 end,coalesce(p_va_dias,22));
    else
      update public.vale_refeicao set funcionario_id=f.id,nome=f.nome,cargo=coalesce(f.cargo,''),modalidade=coalesce(p_va_modalidade,'Alimentação'),periodicidade=p_va_periodicidade,valor_diario=case when p_va_periodicidade='diario' then coalesce(p_va_valor,0) else 0 end,valor_mensal=case when p_va_periodicidade='mensal' then coalesce(p_va_valor,0) else 0 end,dias=coalesce(p_va_dias,22) where id=v_va_id;
    end if;
  else delete from public.vale_refeicao where funcionario_id=f.id; end if;
end $$;

create or replace function public.gerar_folha_integrada(p_competencia text)
returns integer language plpgsql security definer set search_path=public as $$
declare v_total integer:=0;
begin
  if p_competencia !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then raise exception 'Competência inválida. Use AAAA-MM.'; end if;
  if exists(select 1 from public.fin_competencias where competencia=p_competencia and status='fechada') then
    raise exception 'A competência % está fechada.',p_competencia;
  end if;
  insert into public.folha_itens(
    competencia,funcionario_id,nome,cargo,base,proventos,comissao,inss,irrf,outros,status,
    vale_transporte,vale_alimentacao,beneficios,encargos_empresa,origem,updated_at,
    horas_previstas_min,horas_trabalhadas_min,saldo_banco_min,desconto_horas,
    desconto_beneficios,desconto_vale_transporte,base_inss,base_fgts,fgts,memoria_calculo)
  select p_competencia,f.id,f.nome,coalesce(f.cargo,''),coalesce(f.salario,0),
    coalesce(fi.proventos,0),
    coalesce(fi.comissao,0),calc.inss,coalesce(fi.irrf,0),coalesce(fi.outros,0),'pendente',
    round(greatest(vt.nominal-coalesce(prop.desc_vt,0),0),2),round(greatest(va.nominal-coalesce(prop.desc_va,0),0),2),b.total,
    round(calc.base_contribuicao*0.08,2), 'rh_automatico',now(),coalesce(bh.horas_previstas_min,0),
    coalesce(bh.horas_trabalhadas_min,0),coalesce(bh.saldo_min,0),calc.desconto_horas,
    round(coalesce(prop.desc_vt,0)+coalesce(prop.desc_va,0),2),calc.desconto_vt,
    calc.base_contribuicao,calc.base_contribuicao,round(calc.base_contribuicao*0.08,2),
    jsonb_build_object('calculado_ate',coalesce(bh.calculado_ate,now()),'carga_horaria_mensal',coalesce(f.carga_horaria_mensal,220),
      'salario_bruto',coalesce(f.salario,0),'horas_previstas_min',coalesce(bh.horas_previstas_min,0),
      'horas_trabalhadas_min',coalesce(bh.horas_trabalhadas_min,0),'saldo_banco_min',coalesce(bh.saldo_min,0),
      'desconto_horas',calc.desconto_horas,'vt_nominal',vt.nominal,'vt_reduzido',coalesce(prop.desc_vt,0),
      'va_nominal',va.nominal,'va_reduzido',coalesce(prop.desc_va,0),'desconto_vt_6pct',calc.desconto_vt,
      'base_inss',calc.base_contribuicao,'inss',calc.inss,'base_fgts',calc.base_contribuicao,'fgts',round(calc.base_contribuicao*0.08,2))
  from public.funcionarios f
  left join public.folha_itens fi on fi.competencia=p_competencia and fi.funcionario_id=f.id
  left join lateral (select * from public.calcular_banco_horas(p_competencia,f.id,now()) limit 1) bh on true
  left join lateral (select coalesce(sum(case when periodicidade='mensal' then valor_mensal else valor_diario*dias_uteis end),0) nominal
    from public.vale_transporte x where x.funcionario_id=f.id or (x.funcionario_id is null and lower(trim(x.nome))=lower(trim(f.nome)))) vt on true
  left join lateral (select coalesce(sum(case when periodicidade='mensal' then valor_mensal else valor_diario*dias end),0) nominal
    from public.vale_refeicao x where x.funcionario_id=f.id or (x.funcionario_id is null and lower(trim(x.nome))=lower(trim(f.nome)))) va on true
  left join lateral (select coalesce(sum(coalesce(rbf.valor_empresa,bn.custo_empresa,0)),0) total
    from public.rh_beneficio_funcionarios rbf join public.beneficios bn on bn.id=rbf.beneficio_id
    where rbf.funcionario_id=f.id and rbf.ativo) b on true
  left join lateral (select
    case when coalesce(bh.horas_previstas_min,0)>0 then round(vt.nominal*greatest(-coalesce(bh.saldo_min,0),0)/bh.horas_previstas_min,2) else 0 end desc_vt,
    case when coalesce(bh.horas_previstas_min,0)>0 then round(va.nominal*greatest(-coalesce(bh.saldo_min,0),0)/bh.horas_previstas_min,2) else 0 end desc_va) prop on true
  left join lateral (select
    round(least(coalesce(f.salario,0),greatest(-coalesce(bh.saldo_min,0),0)*(coalesce(f.salario,0)/(greatest(coalesce(f.carga_horaria_mensal,220),1)*60))),2) desconto_horas,
    round(greatest(0,coalesce(f.salario,0)-least(coalesce(f.salario,0),greatest(-coalesce(bh.saldo_min,0),0)*(coalesce(f.salario,0)/(greatest(coalesce(f.carga_horaria_mensal,220),1)*60)))+coalesce(fi.comissao,0)+coalesce(fi.bonus_meta,0)),2) base_contribuicao,
    round(least(vt.nominal*greatest(1-case when coalesce(bh.horas_previstas_min,0)>0 then greatest(-coalesce(bh.saldo_min,0),0)::numeric/bh.horas_previstas_min else 0 end,0),coalesce(f.salario,0)*0.06),2) desconto_vt,
    public.calcular_inss_2026(round(greatest(0,coalesce(f.salario,0)-least(coalesce(f.salario,0),greatest(-coalesce(bh.saldo_min,0),0)*(coalesce(f.salario,0)/(greatest(coalesce(f.carga_horaria_mensal,220),1)*60)))+coalesce(fi.comissao,0)+coalesce(fi.bonus_meta,0)),2)) inss) calc on true
  where coalesce(lower(f.status),'ativo')<>'desligado'
  on conflict (competencia,funcionario_id) where funcionario_id is not null do update set
    nome=excluded.nome,cargo=excluded.cargo,base=excluded.base,proventos=excluded.proventos,
    vale_transporte=excluded.vale_transporte,vale_alimentacao=excluded.vale_alimentacao,beneficios=excluded.beneficios,
    inss=excluded.inss,encargos_empresa=excluded.encargos_empresa,horas_previstas_min=excluded.horas_previstas_min,
    horas_trabalhadas_min=excluded.horas_trabalhadas_min,saldo_banco_min=excluded.saldo_banco_min,
    desconto_horas=excluded.desconto_horas,desconto_beneficios=excluded.desconto_beneficios,
    desconto_vale_transporte=excluded.desconto_vale_transporte,base_inss=excluded.base_inss,
    base_fgts=excluded.base_fgts,fgts=excluded.fgts,memoria_calculo=excluded.memoria_calculo,
    origem='rh_automatico',updated_at=now()
  where folha_itens.status<>'pago';
  get diagnostics v_total=row_count;
  return v_total;
end $$;

grant execute on function public.calcular_banco_horas(text,uuid,timestamptz) to authenticated;
grant execute on function public.salvar_beneficios_funcionario(uuid,boolean,text,numeric,integer,text,boolean,text,numeric,integer,text) to authenticated;
grant execute on function public.calcular_inss_2026(numeric) to authenticated;
grant execute on function public.gerar_folha_integrada(text) to authenticated;
