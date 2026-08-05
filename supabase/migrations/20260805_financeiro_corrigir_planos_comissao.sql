-- Resolve o plano sem reescrever propostas históricas e compatibiliza nomes antigos.
-- Ex.: 600 MB = 600 MEGA, 1 GB = 1 GIGA, Paramount+ = Paramount.

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

create or replace function public.plano_venda_resolvido(p_plano text, p_dados_customizados jsonb)
returns text language sql immutable as $$
  select nullif(trim(coalesce(
    nullif(p_plano, ''),
    p_dados_customizados->>'plano_escolhido',
    p_dados_customizados->>'plano'
  )), '');
$$;

create or replace function public.recalcular_comissoes(p_competencia text)
returns integer language plpgsql security definer set search_path = public as $$
declare v_total integer := 0;
begin
  with vendas as (
    select f.id funcionario_id, count(*) quantidade,
      sum(coalesce(cp.valor_comissao, 0)) valor_por_plano,
      jsonb_agg(jsonb_build_object(
        'proposta_id', p.id, 'cliente', p.nome, 'instalacao', p.data_instalacao,
        'plano', public.plano_venda_resolvido(p.plano, p.dados_customizados),
        'valor_plano_comissao', coalesce(cp.valor_comissao, 0),
        'plano_configurado', cp.id is not null
      ) order by p.data_instalacao, p.id) detalhes
    from public.funcionarios f
    join public.proposta p on lower(trim(coalesce(p.vendedor, ''))) in (
      lower(trim(coalesce(f.nome, ''))), lower(trim(coalesce(f.email, ''))),
      lower(trim(coalesce(f.user_email, '')))
    )
    left join lateral (
      select tabela.* from public.fin_comissao_planos tabela
      where public.normalizar_plano_comissao(tabela.plano) = public.normalizar_plano_comissao(
        public.plano_venda_resolvido(p.plano, p.dados_customizados)
      )
      order by tabela.ativo desc, tabela.updated_at desc limit 1
    ) cp on true
    where p.status_venda = 'INSTALADA'
      and to_char(p.data_instalacao::date, 'YYYY-MM') = p_competencia
    group by f.id
  )
  update public.folha_itens fi set
    comissao = case when v.quantidade < 20 then 0 else
      case coalesce(r.modo, 'por_plano')
        when 'por_plano' then v.valor_por_plano
        when 'por_venda' then v.quantidade * coalesce(r.valor_por_venda, 0)
        when 'valor_unico' then coalesce(r.valor_unico, 0)
        when 'faixas' then v.quantidade * coalesce((
          select (fx->>'valor')::numeric from jsonb_array_elements(coalesce(r.faixas, '[]'::jsonb)) fx
          where v.quantidade >= coalesce((fx->>'de')::integer, 0)
            and (nullif(fx->>'ate', '') is null or v.quantidade <= (fx->>'ate')::integer)
          order by coalesce((fx->>'de')::integer, 0) desc limit 1
        ), 0)
        else v.valor_por_plano
      end
    end,
    comissao_detalhes = jsonb_build_object(
      'quantidade', v.quantidade, 'meta', 20, 'liberada', v.quantidade >= 20,
      'modo', coalesce(r.modo, 'por_plano'), 'valor_por_plano', v.valor_por_plano,
      'valor_por_venda', coalesce(r.valor_por_venda, 0), 'valor_unico', coalesce(r.valor_unico, 0),
      'faixas', coalesce(r.faixas, '[]'::jsonb), 'vendas', v.detalhes
    ), updated_at = now()
  from vendas v
  left join lateral (
    select regra.* from public.fin_comissao_regras regra
    join public.funcionarios f2 on f2.id = v.funcionario_id
    where regra.competencia = p_competencia and lower(trim(regra.vendedor)) in (
      lower(trim(coalesce(f2.nome, ''))), lower(trim(coalesce(f2.email, ''))),
      lower(trim(coalesce(f2.user_email, '')))
    ) limit 1
  ) r on true
  where fi.funcionario_id = v.funcionario_id and fi.competencia = p_competencia and fi.status <> 'pago';
  get diagnostics v_total = row_count;
  return v_total;
end;
$$;

grant execute on function public.normalizar_plano_comissao(text) to authenticated;
grant execute on function public.plano_venda_resolvido(text,jsonb) to authenticated;
revoke all on function public.recalcular_comissoes(text) from public, authenticated;

comment on function public.recalcular_comissoes(text) is
  'Função interna chamada pelo sincronizador financeiro; não deve ser executada diretamente pelo frontend.';
