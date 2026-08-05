-- Não transforma período anterior ao início real do controle de ponto em falta.
-- Inclui também os ajustes manuais da tabela banco_horas no saldo oficial.

create or replace function public.calcular_dias_desconto_beneficio(
  p_competencia text,p_funcionario_id uuid default null,p_ate timestamptz default now()
)
returns table(funcionario_id uuid,nome text,faltas_integrais_dia_util integer,faltas_integrais_sabado integer,dias_desconto_dia_util integer,dias_desconto_sabado integer)
language sql stable security definer set search_path=public as $$
with p as (
  select to_date(p_competencia||'-01','YYYY-MM-DD') inicio,
    (to_date(p_competencia||'-01','YYYY-MM-DD')+interval '1 month'-interval '1 day')::date fim,
    (p_ate at time zone 'America/Sao_Paulo') agora
), cfg as (select * from public.rh_regras_calculo where id=1), funcs as (
  select f.*,(select min((pr.data_hora at time zone 'America/Sao_Paulo')::date)
    from public.ponto_registros pr where lower(trim(pr.funcionario))=lower(trim(f.nome))) primeiro_ponto
  from public.funcionarios f
  where coalesce(lower(f.status),'ativo')<>'desligado' and (p_funcionario_id is null or f.id=p_funcionario_id)
), dias as (
  select f.id funcionario_id,f.nome,d::date dia,extract(dow from d)::int dow,p.agora,
    case when extract(dow from d)=6 then '12:00'::time else coalesce(f.jornada_fim,'17:00'::time) end hora_fim
  from funcs f cross join p
  cross join lateral generate_series(
    greatest(p.inicio,coalesce(f.admissao,p.inicio),coalesce(f.primeiro_ponto,p.fim+1)),
    least(p.fim,p.agora::date),interval '1 day'
  ) d where extract(dow from d)<>0
), situacao as (
  select d.*,
    exists(select 1 from public.ponto_registros pr where lower(trim(pr.funcionario))=lower(trim(d.nome)) and (pr.data_hora at time zone 'America/Sao_Paulo')::date=d.dia and lower(coalesce(pr.tipo,'')) in ('folga','atestado','falta justificada','ferias','férias','licenca','licença')) abonado,
    exists(select 1 from public.ponto_registros pr where lower(trim(pr.funcionario))=lower(trim(d.nome)) and (pr.data_hora at time zone 'America/Sao_Paulo')::date=d.dia and lower(coalesce(pr.tipo,'')) not in ('folga','falta','falta justificada','atestado','ferias','férias','licenca','licença')) teve_batida,
    exists(select 1 from public.ponto_registros pr where lower(trim(pr.funcionario))=lower(trim(d.nome)) and (pr.data_hora at time zone 'America/Sao_Paulo')::date=d.dia and lower(coalesce(pr.tipo,''))='falta') falta_explicita
  from dias d
), totais as (
  select funcionario_id,
    count(*) filter(where dow between 1 and 5 and not abonado and (falta_explicita or (not teve_batida and (dia<agora::date or agora::time>=hora_fim))))::int fu,
    count(*) filter(where dow=6 and not abonado and (falta_explicita or (not teve_batida and (dia<agora::date or agora::time>=hora_fim))))::int fs
  from situacao group by funcionario_id
)
select f.id,f.nome,coalesce(t.fu,0),coalesce(t.fs,0),
  least(coalesce(t.fu,0),floor((coalesce(t.fu,0)*24)/cfg.limite_dia_util_horas)::int),
  least(coalesce(t.fs,0),floor((coalesce(t.fs,0)*12)/cfg.limite_sabado_horas)::int)
from funcs f left join totais t on t.funcionario_id=f.id cross join cfg
$$;

create or replace function public.calcular_banco_horas(
  p_competencia text,p_funcionario_id uuid default null,p_ate timestamptz default now()
)
returns table(funcionario_id uuid,nome text,horas_previstas_min integer,horas_trabalhadas_min integer,saldo_min integer,debito_min integer,credito_min integer,dias_falta integer,calculado_ate timestamptz)
language sql stable security definer set search_path=public as $$
with params as (
  select to_date(p_competencia||'-01','YYYY-MM-DD') inicio,
    (to_date(p_competencia||'-01','YYYY-MM-DD')+interval '1 month'-interval '1 day')::date fim,
    (p_ate at time zone 'America/Sao_Paulo') local_ate
), funcs as (
  select f.*,coalesce(f.jornada_inicio,'08:00'::time) ini,coalesce(f.intervalo_inicio,'12:00'::time) int_ini,
    coalesce(f.intervalo_fim,'13:00'::time) int_fim,coalesce(f.jornada_fim,'17:00'::time) fim,
    (select min((pr.data_hora at time zone 'America/Sao_Paulo')::date) from public.ponto_registros pr
      where lower(trim(pr.funcionario))=lower(trim(f.nome))) primeiro_ponto
  from public.funcionarios f where coalesce(lower(f.status),'ativo')<>'desligado'
    and (p_funcionario_id is null or f.id=p_funcionario_id)
), dias as (
  select f.id funcionario_id,f.nome,f.ini,f.int_ini,f.int_fim,f.fim,d::date dia,p.local_ate,p_ate
  from funcs f cross join params p
  cross join lateral generate_series(
    greatest(p.inicio,coalesce(f.admissao,p.inicio),coalesce(f.primeiro_ponto,p.fim+1)),
    least(p.fim,p.local_ate::date),interval '1 day'
  ) d
), marcacoes as (
  select d.*,exists(select 1 from public.ponto_registros pr where lower(trim(pr.funcionario))=lower(trim(d.nome))
    and (pr.data_hora at time zone 'America/Sao_Paulo')::date=d.dia
    and lower(coalesce(pr.tipo,'')) in ('folga','atestado','falta justificada','ferias','férias','licenca','licença')) abonado
  from dias d
), esperado as (
  select m.*,case when extract(dow from dia)=0 or abonado then 0
    when dia<local_ate::date then case when extract(dow from dia)=6 then 240 else
      greatest(0,extract(epoch from (int_ini-ini))/60)::int+greatest(0,extract(epoch from (fim-int_fim))/60)::int end
    when extract(dow from dia)=6 then greatest(0,least(240,extract(epoch from (local_ate::time-ini))/60))::int
    else greatest(0,least(extract(epoch from (int_ini-ini))/60,extract(epoch from (local_ate::time-ini))/60))::int+
      greatest(0,least(extract(epoch from (fim-int_fim))/60,extract(epoch from (local_ate::time-int_fim))/60))::int end previsto_min
  from marcacoes m
), batidas as (
  select e.*,pr.data_hora,row_number() over(partition by e.funcionario_id,e.dia order by pr.data_hora) rn,
    lead(pr.data_hora) over(partition by e.funcionario_id,e.dia order by pr.data_hora) prox
  from esperado e left join public.ponto_registros pr on lower(trim(pr.funcionario))=lower(trim(e.nome))
    and (pr.data_hora at time zone 'America/Sao_Paulo')::date=e.dia
    and lower(coalesce(pr.tipo,'')) not in ('folga','falta','falta justificada','atestado','ferias','férias','licenca','licença')
), por_dia as (
  select funcionario_id,nome,dia,max(previsto_min)::int previsto_min,
    coalesce(sum(case when data_hora is not null and rn%2=1 then greatest(0,extract(epoch from
      (coalesce(prox,case when dia=(p_ate at time zone 'America/Sao_Paulo')::date then p_ate end)-data_hora))/60) else 0 end),0)::int trabalhado_min
  from batidas group by funcionario_id,nome,dia
), resumo as (
  select funcionario_id,sum(previsto_min)::int previstos,sum(trabalhado_min)::int trabalhados,
    count(*) filter(where previsto_min>0 and trabalhado_min=0)::int faltas from por_dia group by funcionario_id
), ajustes as (
  select f.id funcionario_id,coalesce(sum(round(bh.horas*60)),0)::int ajuste_min
  from funcs f cross join params p left join public.banco_horas bh on lower(trim(bh.funcionario))=lower(trim(f.nome))
    and ((bh.data between to_char(p.inicio,'YYYY-MM-DD') and to_char(p.fim,'YYYY-MM-DD'))
      or (bh.data is null and p_competencia=to_char(p.local_ate::date,'YYYY-MM')))
  group by f.id
)
select f.id,f.nome,coalesce(r.previstos,0),coalesce(r.trabalhados,0),
  (coalesce(r.trabalhados,0)-coalesce(r.previstos,0)+coalesce(a.ajuste_min,0))::int,
  greatest(coalesce(r.previstos,0)-coalesce(r.trabalhados,0)-coalesce(a.ajuste_min,0),0)::int,
  greatest(coalesce(r.trabalhados,0)-coalesce(r.previstos,0)+coalesce(a.ajuste_min,0),0)::int,
  coalesce(r.faltas,0),p_ate
from funcs f left join resumo r on r.funcionario_id=f.id left join ajustes a on a.funcionario_id=f.id
$$;
