-- A competência comercial é sempre o mês da instalação efetiva.
-- Nunca usa created_at, data_proposta ou data de auditoria como substitutos.

create index if not exists proposta_instaladas_data_competencia_idx
  on public.proposta(data_instalacao, vendedor)
  where status_venda = 'INSTALADA' and data_instalacao is not null;

create or replace function public.garantir_data_instalacao_venda()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status_novo text := upper(trim(coalesce(new.status_venda,'')));
  v_status_antigo text := case when tg_op='UPDATE' then upper(trim(coalesce(old.status_venda,''))) else '' end;
begin
  if v_status_novo in ('INSTALADA','INSTALADO')
     and new.data_instalacao is null
     and (tg_op='INSERT' or v_status_antigo not in ('INSTALADA','INSTALADO')) then
    new.data_instalacao := current_date;
  end if;
  return new;
end;
$$;

drop trigger if exists proposta_garantir_data_instalacao_trg on public.proposta;
create trigger proposta_garantir_data_instalacao_trg
before insert or update of status_venda, data_instalacao
on public.proposta
for each row execute function public.garantir_data_instalacao_venda();

comment on function public.garantir_data_instalacao_venda() is
  'Ao entrar em INSTALADA sem data explícita, registra o dia da instalação/status. Não altera vendas históricas.';

-- Auditoria: as vendas históricas sem data continuam sem competência até que
-- a data real seja informada. Não é correto usar a data em que foram cadastradas.
select jsonb_build_object(
  'instaladas_com_data', count(*) filter (where data_instalacao is not null),
  'instaladas_sem_data_para_revisao', count(*) filter (where data_instalacao is null)
) as auditoria_competencia_instalacao
from public.proposta
where upper(trim(coalesce(status_venda,''))) in ('INSTALADA','INSTALADO');
