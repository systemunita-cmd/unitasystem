-- Separa a tabela global de comissão das exceções por vendedor/competência.
alter table public.fin_comissao_regras
  add column if not exists valores_por_plano jsonb not null default '{}'::jsonb;

create or replace function public.normalizar_plano_comissao(p_plano text)
returns text language plpgsql immutable as $$
declare v text := upper(trim(coalesce(p_plano, '')));
begin
  v := regexp_replace(v, '\s+', ' ', 'g');
  v := replace(v, 'GLOBO PLAY', 'GLOBOPLAY');
  v := replace(v, 'PARAMOUNT+', 'PARAMOUNT');
  v := replace(v, ' MEGAS', ' MEGA');
  v := replace(v, ' MB', ' MEGA');
  v := replace(v, ' GB', ' GIGA');
  v := replace(v, ' COM ', ' ');
  v := regexp_replace(v, '\s*\+\s*', ' ', 'g');
  v := regexp_replace(v, '\s*-\s*', '-', 'g');
  return trim(regexp_replace(v, '\s+', ' ', 'g'));
end;
$$;

-- Recupera a tabela padrão original enviada pela gestão. Esses registros foram
-- indevidamente alterados pelo antigo editor que deveria ser individual.
update public.fin_comissao_planos p
set valor_comissao = padrao.valor, updated_at = now()
from (values
  ('1 GIGA',55::numeric), ('1 GIGA-CNPJ',55), ('1 GIGA MAX',55),
  ('1 GIGA PARAMOUNT',55), ('1 GIGA GLOBOPLAY',55), ('1 GIGA PREMIUM',55),
  ('2 GIGA',80), ('400 MEGA',25), ('500 MEGA 200 MEGA',25),
  ('600 MEGA',35), ('600 MEGA MAX',35), ('600 MEGA PARAMOUNT',35), ('600 MEGA GLOBOPLAY',35),
  ('700 MEGA',35), ('700 MEGA MAX',35), ('700 MEGA PARAMOUNT',35), ('700 MEGA GLOBOPLAY',35),
  ('800 MEGA YOUTUBE PREMIUM',35), ('800 MEGA',0), ('900 MEGA',0),
  ('500 MEGA',0), ('300 MEGA',0), ('200 MEGA',0)
) as padrao(chave,valor)
where public.normalizar_plano_comissao(p.plano)=padrao.chave
  and p.valor_comissao is distinct from padrao.valor;

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
    where p.status_venda='INSTALADA'
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

grant execute on function public.normalizar_plano_comissao(text) to authenticated;
revoke all on function public.recalcular_comissoes(text) from public,authenticated;

select public.sincronizar_financeiro_rh(to_char(current_date,'YYYY-MM'));
