-- Regra corrigida: contam todas as vendas INSTALADAS da competência; auditoria não é exigida.

create or replace function public.recalcular_comissoes(p_competencia text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total integer := 0;
begin
  with vendas as (
    select
      lower(trim(coalesce(p.vendedor,''))) vendedor_chave,
      count(*) quantidade,
      sum(coalesce(p.comissao_manual,0)) valor,
      jsonb_agg(jsonb_build_object(
        'proposta_id', p.id,
        'cliente', p.nome,
        'instalacao', p.data_instalacao,
        'valor', p.comissao_manual
      ) order by p.data_instalacao) detalhes
    from public.proposta p
    where p.status_venda = 'INSTALADA'
      and to_char(p.data_instalacao::date, 'YYYY-MM') = p_competencia
    group by lower(trim(coalesce(p.vendedor,'')))
  )
  update public.folha_itens fi
  set
    comissao = case when v.quantidade >= 20 then v.valor else 0 end,
    comissao_detalhes = jsonb_build_object(
      'quantidade', v.quantidade,
      'meta', 20,
      'liberada', v.quantidade >= 20,
      'valor_potencial', v.valor,
      'vendas', v.detalhes
    ),
    updated_at = now()
  from public.funcionarios f
  join vendas v on v.vendedor_chave in (
    lower(trim(coalesce(f.nome,''))),
    lower(trim(coalesce(f.email,''))),
    lower(trim(coalesce(f.user_email,'')))
  )
  where fi.funcionario_id = f.id
    and fi.competencia = p_competencia
    and fi.status <> 'pago';

  get diagnostics v_total = row_count;
  return v_total;
end;
$$;


select public.sincronizar_financeiro_rh(to_char(current_date,'YYYY-MM'));
