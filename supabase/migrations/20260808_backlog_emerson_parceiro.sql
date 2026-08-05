-- BACKLOG conta como instalada para comissÃ£o, metas e supervisÃ£o, sem alterar o status.
-- Consolida aliases histÃ³ricos do Emerson no login canÃ´nico do usuÃ¡rio Emerson Parceiro.

update public.proposta
set vendedor='emerson@grupounita.net.br'
where lower(trim(coalesce(vendedor,''))) in ('emerson','emerson parceiro','emerson@grupounita.net.br')
  and vendedor is distinct from 'emerson@grupounita.net.br';

update public.fin_comissao_regras
set vendedor='emerson@grupounita.net.br', updated_at=now()
where lower(trim(coalesce(vendedor,''))) in ('emerson','emerson parceiro')
  and not exists (
    select 1 from public.fin_comissao_regras atual
    where atual.competencia=fin_comissao_regras.competencia
      and lower(trim(atual.vendedor))='emerson@grupounita.net.br'
  );

delete from public.fin_comissao_regras antiga
where lower(trim(coalesce(antiga.vendedor,''))) in ('emerson','emerson parceiro')
  and exists (
    select 1 from public.fin_comissao_regras atual
    where atual.competencia=antiga.competencia
      and lower(trim(atual.vendedor))='emerson@grupounita.net.br'
  );

update public.fin_metas
set vendedor='emerson@grupounita.net.br'
where lower(trim(coalesce(vendedor,''))) in ('emerson','emerson parceiro');

create or replace function public.recalcular_comissoes(p_competencia text)
returns integer language plpgsql security definer set search_path = public as $$
declare v_total integer := 0;
begin
  with vendas as (
    select f.id funcionario_id, count(*) quantidade,
      sum(coalesce(
        case
          when coalesce(r.valores_por_plano, '{}'::jsonb) ? public.normalizar_plano_comissao(public.plano_venda_resolvido(p.plano,p.dados_customizados))
           and (r.valores_por_plano->>public.normalizar_plano_comissao(public.plano_venda_resolvido(p.plano,p.dados_customizados))) ~ '^[0-9]+([.,][0-9]+)?$'
          then replace(r.valores_por_plano->>public.normalizar_plano_comissao(public.plano_venda_resolvido(p.plano,p.dados_customizados)),',','.')::numeric
        end,
        cp.valor_comissao, 0
      )) valor_por_plano,
      r.modo, r.valor_por_venda, r.valor_unico, r.faixas, r.valores_por_plano,
      jsonb_agg(jsonb_build_object(
        'proposta_id',p.id, 'cliente',p.nome, 'instalacao',p.data_instalacao,
        'plano',public.plano_venda_resolvido(p.plano,p.dados_customizados),
        'valor_plano_comissao',coalesce(
          case
            when coalesce(r.valores_por_plano, '{}'::jsonb) ? public.normalizar_plano_comissao(public.plano_venda_resolvido(p.plano,p.dados_customizados))
             and (r.valores_por_plano->>public.normalizar_plano_comissao(public.plano_venda_resolvido(p.plano,p.dados_customizados))) ~ '^[0-9]+([.,][0-9]+)?$'
            then replace(r.valores_por_plano->>public.normalizar_plano_comissao(public.plano_venda_resolvido(p.plano,p.dados_customizados)),',','.')::numeric
          end,
          cp.valor_comissao,0
        ),
        'valor_individual',coalesce(r.valores_por_plano, '{}'::jsonb) ? public.normalizar_plano_comissao(public.plano_venda_resolvido(p.plano,p.dados_customizados)),
        'plano_configurado',cp.id is not null
      ) order by p.data_instalacao,p.id) detalhes
    from public.funcionarios f
    join public.proposta p on lower(trim(coalesce(p.vendedor,''))) in (
      lower(trim(coalesce(f.nome,''))),lower(trim(coalesce(f.email,''))),lower(trim(coalesce(f.user_email,'')))
    )
    left join lateral (
      select tabela.* from public.fin_comissao_planos tabela
      where public.normalizar_plano_comissao(tabela.plano)=public.normalizar_plano_comissao(public.plano_venda_resolvido(p.plano,p.dados_customizados))
      order by tabela.ativo desc,tabela.updated_at desc limit 1
    ) cp on true
    left join lateral (
      select regra.* from public.fin_comissao_regras regra
      where regra.competencia=p_competencia and lower(trim(regra.vendedor)) in (
        lower(trim(coalesce(f.nome,''))),lower(trim(coalesce(f.email,''))),lower(trim(coalesce(f.user_email,'')))
      ) limit 1
    ) r on true
    where upper(trim(coalesce(p.status_venda,''))) in ('INSTALADA','BACKLOG')
      and to_char(p.data_instalacao::date,'YYYY-MM')=p_competencia
    group by f.id,r.modo,r.valor_por_venda,r.valor_unico,r.faixas,r.valores_por_plano
  )
  update public.folha_itens fi set
    comissao=case when v.quantidade<20 then 0 else
      case coalesce(v.modo,'por_plano')
        when 'por_plano' then v.valor_por_plano
        when 'por_venda' then v.quantidade*coalesce(v.valor_por_venda,0)
        when 'valor_unico' then coalesce(v.valor_unico,0)
        when 'faixas' then v.quantidade*coalesce((
          select (fx->>'valor')::numeric from jsonb_array_elements(coalesce(v.faixas,'[]'::jsonb)) fx
          where v.quantidade>=coalesce((fx->>'de')::integer,0)
            and (nullif(fx->>'ate','') is null or v.quantidade<=(fx->>'ate')::integer)
          order by coalesce((fx->>'de')::integer,0) desc limit 1
        ),0)
        else v.valor_por_plano
      end
    end,
    comissao_detalhes=jsonb_build_object(
      'quantidade',v.quantidade,'meta',20,'liberada',v.quantidade>=20,
      'modo',coalesce(v.modo,'por_plano'),'valor_por_plano',v.valor_por_plano,
      'valores_por_plano',coalesce(v.valores_por_plano,'{}'::jsonb),
      'valor_por_venda',coalesce(v.valor_por_venda,0),'valor_unico',coalesce(v.valor_unico,0),
      'faixas',coalesce(v.faixas,'[]'::jsonb),'vendas',v.detalhes
    ),updated_at=now()
  from vendas v
  where fi.funcionario_id=v.funcionario_id and fi.competencia=p_competencia and fi.status<>'pago';
  get diagnostics v_total=row_count;
  return v_total;
end;
$$;

create or replace function public.recalcular_bonus_metas(p_competencia text)
returns integer language plpgsql security definer set search_path=public as $$
declare v_total integer:=0;
begin
  with realizado_vendedor as (
    select lower(trim(coalesce(vendedor,''))) chave,count(*) qtd,sum(coalesce(valor_plano,0)) valor
    from public.proposta
    where upper(trim(coalesce(status_venda,''))) in ('INSTALADA','BACKLOG')
      and data_instalacao is not null and to_char(data_instalacao::date,'YYYY-MM')=p_competencia
    group by 1
  ), realizado_equipe as (
    select coalesce(
      pdv_id,
      case when coalesce(to_jsonb(proposta)->>'equipe_id','') ~ '^[0-9]+$' then (to_jsonb(proposta)->>'equipe_id')::bigint end,
      case when coalesce(to_jsonb(proposta)->>'equipe_id_criador','') ~ '^[0-9]+$' then (to_jsonb(proposta)->>'equipe_id_criador')::bigint end
    ) equipe,count(*) qtd,sum(coalesce(valor_plano,0)) valor
    from public.proposta
    where upper(trim(coalesce(status_venda,''))) in ('INSTALADA','BACKLOG')
      and data_instalacao is not null and to_char(data_instalacao::date,'YYYY-MM')=p_competencia
    group by 1
  )
  update public.folha_itens fi set
    bonus_meta=case
      when coalesce(mv.meta_vendas,me.meta_vendas,0)>0
       and coalesce(rv.qtd,re.qtd,0)>=coalesce(mv.meta_vendas,me.meta_vendas,0)
       and (coalesce(mv.meta_valor,me.meta_valor,0)=0 or coalesce(rv.valor,re.valor,0)>=coalesce(mv.meta_valor,me.meta_valor,0))
      then coalesce(mv.bonus_valor,me.bonus_valor,0) else 0 end,
    bonus_detalhes=jsonb_build_object(
      'meta_vendas',coalesce(mv.meta_vendas,me.meta_vendas,0),
      'realizado_vendas',coalesce(rv.qtd,re.qtd,0),
      'meta_valor',coalesce(mv.meta_valor,me.meta_valor,0),
      'realizado_valor',coalesce(rv.valor,re.valor,0),
      'inclui_backlog',true,
      'origem',case when mv.id is not null then 'vendedor' else 'equipe' end
    ),updated_at=now()
  from public.funcionarios fu
  left join public.fin_metas mv on mv.competencia=p_competencia and lower(trim(mv.vendedor)) in (
    lower(trim(fu.nome)),lower(trim(fu.email)),lower(trim(fu.user_email))
  )
  left join realizado_vendedor rv on rv.chave in (
    lower(trim(fu.nome)),lower(trim(fu.email)),lower(trim(fu.user_email))
  )
  left join public.fin_metas me on me.competencia=p_competencia
    and me.equipe_id=case when coalesce(fu.equipe_id,'')~'^[0-9]+$' then fu.equipe_id::bigint else null end
    and me.vendedor is null
  left join realizado_equipe re on re.equipe=case when coalesce(fu.equipe_id,'')~'^[0-9]+$' then fu.equipe_id::bigint else null end
  where fi.funcionario_id=fu.id and fi.competencia=p_competencia and fi.status<>'pago';
  get diagnostics v_total=row_count;
  return v_total;
end;
$$;

create or replace function public.garantir_data_instalacao_venda()
returns trigger language plpgsql security definer set search_path=public as $$
declare
  v_status_novo text:=upper(trim(coalesce(new.status_venda,'')));
  v_status_antigo text:=case when tg_op='UPDATE' then upper(trim(coalesce(old.status_venda,''))) else '' end;
begin
  if v_status_novo in ('INSTALADA','INSTALADO','BACKLOG') and new.data_instalacao is null
     and (tg_op='INSERT' or v_status_antigo not in ('INSTALADA','INSTALADO','BACKLOG')) then
    new.data_instalacao:=current_date;
  end if;
  return new;
end;
$$;

create index if not exists proposta_instalada_backlog_competencia_idx
  on public.proposta(data_instalacao,vendedor)
  where status_venda in ('INSTALADA','BACKLOG') and data_instalacao is not null;

do $$
declare c record;
begin
  for c in
    select distinct to_char(data_instalacao::date,'YYYY-MM') competencia
    from public.proposta
    where upper(trim(coalesce(status_venda,''))) in ('INSTALADA','BACKLOG') and data_instalacao is not null
      and data_instalacao::date between date '2025-01-01' and current_date
  loop
    perform public.recalcular_comissoes(c.competencia);
    perform public.recalcular_bonus_metas(c.competencia);
  end loop;
end;
$$;

select jsonb_build_object(
  'emerson_vendas_consolidadas',count(*) filter (where vendedor='emerson@grupounita.net.br'),
  'backlog_total',count(*) filter (where upper(trim(coalesce(status_venda,'')))='BACKLOG'),
  'backlog_com_data',count(*) filter (where upper(trim(coalesce(status_venda,'')))='BACKLOG' and data_instalacao is not null)
) as resultado
from public.proposta;
