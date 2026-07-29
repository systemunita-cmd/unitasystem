-- Pendências Financeiro/RH: cadastros mestres, metas, bônus, inadimplência e contratação automática.

create table if not exists public.fin_categorias (
 id uuid primary key default gen_random_uuid(), nome text not null unique, tipo text not null default 'ambos' check(tipo in ('pagar','receber','ambos')), cor text default '#65a30d', ativo boolean not null default true, created_at timestamptz not null default now()
);
create table if not exists public.fin_centros_custo (
 id uuid primary key default gen_random_uuid(), nome text not null unique, codigo text unique, responsavel text, orcamento_mensal numeric not null default 0, ativo boolean not null default true, created_at timestamptz not null default now()
);
alter table public.fin_extratos add column if not exists conexao_id uuid, add column if not exists external_id text;
create unique index if not exists fin_extratos_conexao_external_uidx on public.fin_extratos(conexao_id,external_id) where conexao_id is not null and external_id is not null;

create table if not exists public.fin_conexoes_bancarias (
 id uuid primary key default gen_random_uuid(), nome text not null, provedor text not null default 'generico', base_url text not null, conta text, credencial_env text not null, ativo boolean not null default true, ultima_sincronizacao timestamptz, created_at timestamptz not null default now()
);
do $$ begin
 alter table public.fin_extratos add constraint fin_extratos_conexao_fk foreign key (conexao_id) references public.fin_conexoes_bancarias(id) on delete set null;
exception when duplicate_object then null; end $$;

alter table public.fin_metas add column if not exists bonus_valor numeric not null default 0;
alter table public.folha_itens add column if not exists bonus_meta numeric not null default 0, add column if not exists bonus_detalhes jsonb not null default '{}'::jsonb;
alter table public.candidatos add column if not exists funcionario_id uuid references public.funcionarios(id), add column if not exists contratado_em timestamptz;
alter table public.fin_inadimplencia add column if not exists fatura_status_id bigint references public.faturas_status(id) on delete set null;
create unique index if not exists fin_inadimplencia_fatura_uidx on public.fin_inadimplencia(fatura_status_id) where fatura_status_id is not null;

alter table public.fin_categorias enable row level security;
alter table public.fin_centros_custo enable row level security;
alter table public.fin_conexoes_bancarias enable row level security;
do $$ declare t text; begin foreach t in array array['fin_categorias','fin_centros_custo','fin_conexoes_bancarias'] loop execute format('drop policy if exists %I on public.%I',t||'_financeiro',t); execute format('create policy %I on public.%I for all to authenticated using (public.usuario_pode_acessar_financeiro()) with check (public.usuario_pode_acessar_financeiro())',t||'_financeiro',t); end loop; end $$;
grant select,insert,update,delete on public.fin_categorias,public.fin_centros_custo,public.fin_conexoes_bancarias to authenticated;

create or replace function public.sincronizar_inadimplencia_faturas()
returns integer language plpgsql security definer set search_path=public as $$
declare v_total integer:=0; v_i integer:=0; begin
 insert into public.fin_inadimplencia(proposta_id,fatura_status_id,cliente,cpf,vendedor,valor,vencimento,status,observacao,updated_at)
 select p.id,f.id,p.nome,p.cpf,p.vendedor,coalesce(p.valor_plano,0),f.data_vencimento,'aberta','Gerada automaticamente pela fatura '||coalesce(f.numero_referencia,f.numero_fatura::text),now()
 from public.faturas_status f join public.proposta p on p.id=f.proposta_id
 where f.data_vencimento<current_date and coalesce(lower(f.status),'pendente') not in ('pago','paga','paga_atraso','regularizada') and f.data_pagamento is null
 and not exists (select 1 from public.fin_inadimplencia atual where atual.proposta_id=p.id and atual.vencimento=f.data_vencimento and atual.fatura_status_id is distinct from f.id)
 on conflict (fatura_status_id) where fatura_status_id is not null do update set valor=excluded.valor,vencimento=excluded.vencimento,updated_at=now()
 where fin_inadimplencia.status<>'regularizada'; get diagnostics v_total=row_count;
 update public.fin_inadimplencia i set status='regularizada',updated_at=now()
 from public.faturas_status f where i.fatura_status_id=f.id and i.status<>'regularizada' and (f.data_pagamento is not null or coalesce(lower(f.status),'') in ('pago','paga','paga_atraso','regularizada')); get diagnostics v_i=row_count;
 return v_total+v_i; end $$;
grant execute on function public.sincronizar_inadimplencia_faturas() to authenticated;

create or replace function public.fatura_sincronizar_inadimplencia_trigger()
returns trigger language plpgsql security definer set search_path=public as $$ begin perform public.sincronizar_inadimplencia_faturas(); return new; exception when others then raise warning 'Inadimplência pendente: %',sqlerrm; return new; end $$;
drop trigger if exists faturas_status_inadimplencia_sync on public.faturas_status;
create trigger faturas_status_inadimplencia_sync after insert or update of status,data_pagamento,data_vencimento on public.faturas_status for each statement execute function public.fatura_sincronizar_inadimplencia_trigger();

create or replace function public.candidato_criar_funcionario_trigger()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_func uuid; v_vaga record; v_salario_texto text; v_salario numeric:=0; begin
 if lower(trim(coalesce(new.etapa,''))) not in ('contratado','aprovado') or new.funcionario_id is not null then return new; end if;
 select id into v_func from public.funcionarios where (new.email is not null and lower(email)=lower(new.email)) or lower(trim(nome))=lower(trim(new.nome)) limit 1;
 select * into v_vaga from public.vagas where lower(trim(titulo))=lower(trim(new.vaga)) limit 1;
 v_salario_texto:=coalesce(nullif(regexp_replace(coalesce(v_vaga.salario,'0'),'[^0-9,.-]','','g'),''),'0');
 if position(',' in v_salario_texto)>0 then v_salario_texto:=replace(replace(v_salario_texto,'.',''),',','.'); end if;
 begin v_salario:=v_salario_texto::numeric; exception when invalid_text_representation then v_salario:=0; end;
 if v_func is null then insert into public.funcionarios(nome,email,telefone,cargo,departamento,admissao,salario,status) values(new.nome,new.email,new.telefone,new.vaga,coalesce(v_vaga.departamento,''),current_date,v_salario,'ativo') returning id into v_func; end if;
 update public.candidatos set funcionario_id=v_func,contratado_em=coalesce(contratado_em,now()) where id=new.id;
 perform public.sincronizar_financeiro_rh(to_char(current_date,'YYYY-MM')); return new;
exception when others then raise warning 'Contratação automática pendente: %',sqlerrm; return new; end $$;
drop trigger if exists candidato_contratado_funcionario on public.candidatos;
create trigger candidato_contratado_funcionario after insert or update of etapa on public.candidatos for each row execute function public.candidato_criar_funcionario_trigger();

create or replace function public.recalcular_bonus_metas(p_competencia text)
returns integer language plpgsql security definer set search_path=public as $$
declare v_total integer:=0; begin
 with realizado_vendedor as (select lower(trim(coalesce(vendedor,''))) chave,count(*) qtd,sum(coalesce(valor_plano,0)) valor from public.proposta where status_venda='INSTALADA' and to_char(data_instalacao::date,'YYYY-MM')=p_competencia group by 1),
 realizado_equipe as (select coalesce(equipe_id,equipe_id_criador)::bigint equipe,count(*) qtd,sum(coalesce(valor_plano,0)) valor from public.proposta where status_venda='INSTALADA' and to_char(data_instalacao::date,'YYYY-MM')=p_competencia group by 1)
 update public.folha_itens fi set bonus_meta=case when coalesce(mv.meta_vendas,me.meta_vendas,0)>0 and coalesce(rv.qtd,re.qtd,0)>=coalesce(mv.meta_vendas,me.meta_vendas,0) and (coalesce(mv.meta_valor,me.meta_valor,0)=0 or coalesce(rv.valor,re.valor,0)>=coalesce(mv.meta_valor,me.meta_valor,0)) then coalesce(mv.bonus_valor,me.bonus_valor,0) else 0 end,
 bonus_detalhes=jsonb_build_object('meta_vendas',coalesce(mv.meta_vendas,me.meta_vendas,0),'realizado_vendas',coalesce(rv.qtd,re.qtd,0),'meta_valor',coalesce(mv.meta_valor,me.meta_valor,0),'realizado_valor',coalesce(rv.valor,re.valor,0),'origem',case when mv.id is not null then 'vendedor' else 'equipe' end),updated_at=now()
 from public.funcionarios fu
 left join public.fin_metas mv on mv.competencia=p_competencia and lower(trim(mv.vendedor)) in (lower(trim(fu.nome)),lower(trim(fu.email)),lower(trim(fu.user_email)))
 left join realizado_vendedor rv on rv.chave in (lower(trim(fu.nome)),lower(trim(fu.email)),lower(trim(fu.user_email)))
 left join public.fin_metas me on me.competencia=p_competencia and me.equipe_id=case when fu.equipe_id~'^[0-9]+$' then fu.equipe_id::bigint else null end and me.vendedor is null
 left join realizado_equipe re on re.equipe=case when fu.equipe_id~'^[0-9]+$' then fu.equipe_id::bigint else null end
 where fi.funcionario_id=fu.id and fi.competencia=p_competencia and fi.status<>'pago'; get diagnostics v_total=row_count; return v_total; end $$;
grant execute on function public.recalcular_bonus_metas(text) to authenticated;

select public.sincronizar_inadimplencia_faturas();

create or replace function public.sincronizar_financeiro_rh(p_competencia text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_folha integer;
  v_comissoes integer;
  v_bonus integer;
  v_total numeric;
  v_titulo uuid;
begin
  v_folha := public.gerar_folha_integrada(p_competencia);
  v_comissoes := public.recalcular_comissoes(p_competencia);
  v_bonus := public.recalcular_bonus_metas(p_competencia);

  select coalesce(sum(coalesce(base,0)+coalesce(vale_transporte,0)+coalesce(vale_alimentacao,0)+
    coalesce(beneficios,0)+coalesce(encargos_empresa,0)+coalesce(comissao,0)+coalesce(bonus_meta,0)),0)
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
    'bonus_atualizados',v_bonus,'titulo_financeiro_id',v_titulo,'total',v_total);
end;
$$;


select public.sincronizar_financeiro_rh(to_char(current_date,'YYYY-MM'));
