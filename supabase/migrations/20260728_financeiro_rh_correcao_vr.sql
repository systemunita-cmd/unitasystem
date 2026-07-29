-- Correção compatível com a coluna existente vale_refeicao.dias.

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


select public.sincronizar_financeiro_rh(to_char(current_date,'YYYY-MM'));
