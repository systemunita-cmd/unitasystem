-- Vínculo estável entre ponto, funcionário, banco de horas e folha.
-- Elimina a dependência do texto do nome e recalcula automaticamente competências abertas.

create or replace function public.rh_normalizar_chave(p_texto text)
returns text language sql immutable parallel safe as $fn$
  select regexp_replace(
    translate(lower(trim(coalesce(p_texto,''))),
      'áàãâäéèêëíìîïóòõôöúùûüçñ',
      'aaaaaeeeeiiiiooooouuuucn'),
    '\s+',' ','g')
$fn$;

alter table public.ponto_registros
  add column if not exists funcionario_id uuid references public.funcionarios(id) on delete set null;
alter table public.banco_horas
  add column if not exists funcionario_id uuid references public.funcionarios(id) on delete set null;

create index if not exists ponto_registros_funcionario_data_idx
  on public.ponto_registros(funcionario_id,data_hora);
create index if not exists banco_horas_funcionario_data_idx
  on public.banco_horas(funcionario_id,data);

create table if not exists public.rh_ponto_aliases(
  alias_key text primary key,
  alias_exibicao text not null,
  funcionario_id uuid not null references public.funcionarios(id) on delete cascade,
  origem text not null default 'automatico',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists rh_ponto_aliases_funcionario_idx
  on public.rh_ponto_aliases(funcionario_id);

alter table public.rh_ponto_aliases enable row level security;
drop policy if exists rh_ponto_aliases_select on public.rh_ponto_aliases;
create policy rh_ponto_aliases_select on public.rh_ponto_aliases
  for select to authenticated using (true);
drop policy if exists rh_ponto_aliases_admin on public.rh_ponto_aliases;
create policy rh_ponto_aliases_admin on public.rh_ponto_aliases
  for all to authenticated using (public.rh_usuario_admin())
  with check (public.rh_usuario_admin());

insert into public.rh_ponto_aliases(alias_key,alias_exibicao,funcionario_id,origem)
select distinct on (public.rh_normalizar_chave(f.nome))
  public.rh_normalizar_chave(f.nome),trim(f.nome),f.id,'cadastro_rh'
from public.funcionarios f
where public.rh_normalizar_chave(f.nome)<>''
order by public.rh_normalizar_chave(f.nome),
  case when coalesce(lower(f.status),'ativo')<>'desligado' then 0 else 1 end,f.created_at desc
on conflict(alias_key) do update set
  alias_exibicao=excluded.alias_exibicao,
  funcionario_id=excluded.funcionario_id,
  origem=excluded.origem,
  updated_at=now();

insert into public.rh_ponto_aliases(alias_key,alias_exibicao,funcionario_id,origem)
select distinct on (public.rh_normalizar_chave(u.nome))
  public.rh_normalizar_chave(u.nome),trim(u.nome),f.id,'login_email'
from public.usuarios u
join public.funcionarios f on lower(trim(u.email)) in
  (lower(trim(coalesce(f.email,''))),lower(trim(coalesce(f.user_email,''))))
where trim(coalesce(u.email,''))<>'' and public.rh_normalizar_chave(u.nome)<>''
order by public.rh_normalizar_chave(u.nome),
  case when coalesce(lower(f.status),'ativo')<>'desligado' then 0 else 1 end,u.updated_at desc
on conflict(alias_key) do update set
  alias_exibicao=excluded.alias_exibicao,
  funcionario_id=excluded.funcionario_id,
  origem=excluded.origem,
  updated_at=now();

update public.ponto_registros pr set funcionario_id=a.funcionario_id
from public.rh_ponto_aliases a
where pr.funcionario_id is null
  and a.alias_key=public.rh_normalizar_chave(pr.funcionario);

update public.banco_horas bh set funcionario_id=a.funcionario_id
from public.rh_ponto_aliases a
where bh.funcionario_id is null
  and a.alias_key=public.rh_normalizar_chave(bh.funcionario);

-- Depois do vínculo, preserva um único nome canônico inclusive no histórico.
update public.ponto_registros pr set funcionario=trim(f.nome),cargo=coalesce(f.cargo,pr.cargo)
from public.funcionarios f where pr.funcionario_id=f.id
  and (pr.funcionario is distinct from trim(f.nome) or pr.cargo is distinct from coalesce(f.cargo,pr.cargo));
update public.banco_horas bh set funcionario=trim(f.nome)
from public.funcionarios f where bh.funcionario_id=f.id
  and bh.funcionario is distinct from trim(f.nome);

create or replace function public.rh_vincular_registro_funcionario()
returns trigger language plpgsql security definer set search_path=public as $fn$
declare v_id uuid; v_nome text; v_cargo text;
begin
  v_id:=new.funcionario_id;
  if v_id is null then
    select a.funcionario_id into v_id from public.rh_ponto_aliases a
    where a.alias_key=public.rh_normalizar_chave(new.funcionario) limit 1;
  end if;
  if v_id is not null then
    select trim(f.nome),coalesce(f.cargo,'') into v_nome,v_cargo
    from public.funcionarios f where f.id=v_id;
    new.funcionario_id:=v_id;
    new.funcionario:=v_nome;
    if tg_table_name='ponto_registros' then new.cargo:=v_cargo; end if;
  end if;
  return new;
end $fn$;

drop trigger if exists trg_ponto_vincular_funcionario on public.ponto_registros;
create trigger trg_ponto_vincular_funcionario before insert or update of funcionario,funcionario_id
on public.ponto_registros for each row execute function public.rh_vincular_registro_funcionario();
drop trigger if exists trg_banco_vincular_funcionario on public.banco_horas;
create trigger trg_banco_vincular_funcionario before insert or update of funcionario,funcionario_id
on public.banco_horas for each row execute function public.rh_vincular_registro_funcionario();

create or replace function public.calcular_dias_desconto_beneficio(
  p_competencia text,p_funcionario_id uuid default null,p_ate timestamptz default now()
)
returns table(funcionario_id uuid,nome text,faltas_integrais_dia_util integer,faltas_integrais_sabado integer,dias_desconto_dia_util integer,dias_desconto_sabado integer)
language sql stable security definer set search_path=public as $fn$
with p as (
  select to_date(p_competencia||'-01','YYYY-MM-DD') inicio,
    (to_date(p_competencia||'-01','YYYY-MM-DD')+interval '1 month'-interval '1 day')::date fim,
    (p_ate at time zone 'America/Sao_Paulo') agora
), cfg as (select * from public.rh_regras_calculo where id=1), funcs as (
  select f.*,(select min((pr.data_hora at time zone 'America/Sao_Paulo')::date)
    from public.ponto_registros pr where pr.funcionario_id=f.id) primeiro_ponto
  from public.funcionarios f
  where coalesce(lower(f.status),'ativo')<>'desligado' and (p_funcionario_id is null or f.id=p_funcionario_id)
), dias as (
  select f.id funcionario_id,f.nome,d::date dia,extract(dow from d)::int dow,p.agora,
    case when extract(dow from d)=6 then '12:00'::time else coalesce(f.jornada_fim,'17:00'::time) end hora_fim
  from funcs f cross join p cross join lateral generate_series(
    greatest(p.inicio,coalesce(f.admissao,p.inicio),coalesce(f.primeiro_ponto,p.fim+1)),
    least(p.fim,p.agora::date),interval '1 day') d
  where extract(dow from d)<>0
), situacao as (
  select d.*,
    exists(select 1 from public.ponto_registros pr where pr.funcionario_id=d.funcionario_id
      and (pr.data_hora at time zone 'America/Sao_Paulo')::date=d.dia
      and public.rh_normalizar_chave(pr.tipo) in ('folga','atestado','falta justificada','ferias','licenca')) abonado,
    exists(select 1 from public.ponto_registros pr where pr.funcionario_id=d.funcionario_id
      and (pr.data_hora at time zone 'America/Sao_Paulo')::date=d.dia
      and public.rh_normalizar_chave(pr.tipo) not in ('folga','falta','falta justificada','atestado','ferias','licenca')) teve_batida,
    exists(select 1 from public.ponto_registros pr where pr.funcionario_id=d.funcionario_id
      and (pr.data_hora at time zone 'America/Sao_Paulo')::date=d.dia
      and public.rh_normalizar_chave(pr.tipo)='falta') falta_explicita
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
$fn$;

create or replace function public.calcular_banco_horas(
  p_competencia text,p_funcionario_id uuid default null,p_ate timestamptz default now()
)
returns table(funcionario_id uuid,nome text,horas_previstas_min integer,horas_trabalhadas_min integer,saldo_min integer,debito_min integer,credito_min integer,dias_falta integer,calculado_ate timestamptz)
language sql stable security definer set search_path=public as $fn$
with params as (
  select to_date(p_competencia||'-01','YYYY-MM-DD') inicio,
    (to_date(p_competencia||'-01','YYYY-MM-DD')+interval '1 month'-interval '1 day')::date fim,
    (p_ate at time zone 'America/Sao_Paulo') local_ate
), funcs as (
  select f.*,coalesce(f.jornada_inicio,'08:00'::time) ini,coalesce(f.intervalo_inicio,'12:00'::time) int_ini,
    coalesce(f.intervalo_fim,'13:00'::time) int_fim,coalesce(f.jornada_fim,'17:00'::time) fim,
    (select min((pr.data_hora at time zone 'America/Sao_Paulo')::date)
      from public.ponto_registros pr where pr.funcionario_id=f.id) primeiro_ponto
  from public.funcionarios f where coalesce(lower(f.status),'ativo')<>'desligado'
    and (p_funcionario_id is null or f.id=p_funcionario_id)
), dias as (
  select f.id funcionario_id,f.nome,f.ini,f.int_ini,f.int_fim,f.fim,d::date dia,p.local_ate,p_ate
  from funcs f cross join params p cross join lateral generate_series(
    greatest(p.inicio,coalesce(f.admissao,p.inicio),coalesce(f.primeiro_ponto,p.fim+1)),
    least(p.fim,p.local_ate::date),interval '1 day') d
), marcacoes as (
  select d.*,exists(select 1 from public.ponto_registros pr where pr.funcionario_id=d.funcionario_id
    and (pr.data_hora at time zone 'America/Sao_Paulo')::date=d.dia
    and public.rh_normalizar_chave(pr.tipo) in ('folga','atestado','falta justificada','ferias','licenca')) abonado
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
  from esperado e left join public.ponto_registros pr on pr.funcionario_id=e.funcionario_id
    and (pr.data_hora at time zone 'America/Sao_Paulo')::date=e.dia
    and public.rh_normalizar_chave(pr.tipo) not in ('folga','falta','falta justificada','atestado','ferias','licenca')
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
  from funcs f cross join params p left join public.banco_horas bh on bh.funcionario_id=f.id
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
$fn$;

create or replace function public.rh_recalcular_folha_por_ponto()
returns trigger language plpgsql security definer set search_path=public as $fn$
declare v_comp text;
begin
  if tg_table_name='ponto_registros' then
    v_comp:=to_char((coalesce(new.data_hora,old.data_hora) at time zone 'America/Sao_Paulo'),'YYYY-MM');
  else
    v_comp:=case when coalesce(new.data,old.data) ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      then left(coalesce(new.data,old.data),7) else to_char(current_date,'YYYY-MM') end;
  end if;
  begin perform public.gerar_folha_integrada(v_comp); exception when others then null; end;
  if tg_op='DELETE' then return old; end if;
  return new;
end $fn$;

drop trigger if exists trg_ponto_recalcular_folha on public.ponto_registros;
create trigger trg_ponto_recalcular_folha after insert or update or delete
on public.ponto_registros for each row execute function public.rh_recalcular_folha_por_ponto();
drop trigger if exists trg_banco_recalcular_folha on public.banco_horas;
create trigger trg_banco_recalcular_folha after insert or update or delete
on public.banco_horas for each row execute function public.rh_recalcular_folha_por_ponto();

-- Corrige competências pendentes já existentes. Competências fechadas/pagas permanecem imutáveis.
do $do$
declare v_comp text;
begin
  for v_comp in select distinct competencia from public.folha_itens
    where status<>'pago' and competencia>=to_char(current_date-interval '2 months','YYYY-MM')
  loop
    begin perform public.gerar_folha_integrada(v_comp); exception when others then null; end;
  end loop;
end $do$;

grant execute on function public.calcular_banco_horas(text,uuid,timestamptz) to authenticated;
grant execute on function public.calcular_dias_desconto_beneficio(text,uuid,timestamptz) to authenticated;


create or replace function public.listar_batidas_incompletas(p_competencia text)
returns table(funcionario_id uuid,nome text,dia date,quantidade integer,tipos text)
language sql stable security definer set search_path=public as $fn$
  select f.id,f.nome,(pr.data_hora at time zone 'America/Sao_Paulo')::date,
    count(*)::integer,string_agg(pr.tipo,' | ' order by pr.data_hora)
  from public.ponto_registros pr join public.funcionarios f on f.id=pr.funcionario_id
  where to_char(pr.data_hora at time zone 'America/Sao_Paulo','YYYY-MM')=p_competencia
    and coalesce(lower(f.status),'ativo')<>'desligado'
    and public.rh_normalizar_chave(pr.tipo) not in
      ('folga','falta','falta justificada','atestado','ferias','licenca')
  group by f.id,f.nome,(pr.data_hora at time zone 'America/Sao_Paulo')::date
  having mod(count(*),2)=1
  order by dia desc,f.nome
$fn$;
grant execute on function public.listar_batidas_incompletas(text) to authenticated;

-- Resultado objetivo da auditoria executada junto com a migracao.
select jsonb_build_object(
  'funcionarios_ativos',(select count(*) from public.funcionarios where coalesce(lower(status),'ativo')<>'desligado'),
  'registros_ponto_total',(select count(*) from public.ponto_registros),
  'registros_ponto_vinculados',(select count(*) from public.ponto_registros where funcionario_id is not null),
  'registros_ponto_sem_vinculo',(select count(*) from public.ponto_registros where funcionario_id is null),
  'saldos_competencia_atual',(select coalesce(jsonb_agg(jsonb_build_object(
    'funcionario_id',x.funcionario_id,'nome',x.nome,'previsto_min',x.horas_previstas_min,
    'trabalhado_min',x.horas_trabalhadas_min,'saldo_min',x.saldo_min,'faltas',x.dias_falta)
    order by x.nome),'[]'::jsonb) from public.calcular_banco_horas(to_char(current_date,'YYYY-MM'),null,now()) x)
) as auditoria_banco_horas;
