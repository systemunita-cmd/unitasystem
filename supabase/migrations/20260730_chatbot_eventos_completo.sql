-- Automação do chatbot por eventos de negócio.
-- Idempotente: pode ser executada novamente sem duplicar regras, gatilhos ou eventos.

create table if not exists public.automacao_eventos (
  id bigserial primary key,
  evento text not null,
  valor_gatilho text,
  entidade_tipo text not null,
  entidade_id text not null,
  chave_dedupe text not null unique,
  destinatario text,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pendente',
  tentativas integer not null default 0,
  proxima_tentativa timestamptz not null default now(),
  bloqueado_em timestamptz,
  processado_em timestamptz,
  erro text,
  disparo_id bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists automacao_eventos_fila_idx
  on public.automacao_eventos(status, proxima_tentativa, created_at);

create table if not exists public.automacao_regras (
  id bigserial primary key,
  evento text not null,
  valor_gatilho text,
  nome text not null,
  canal_id bigint,
  tipo text not null default 'webjs',
  mensagem text,
  template_id bigint,
  delay_min_seg integer not null default 45,
  delay_max_seg integer not null default 120,
  prioridade integer not null default 100,
  ativo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists automacao_regras_evento_valor_uidx
  on public.automacao_regras(evento, coalesce(valor_gatilho, ''));

create or replace function public.usuario_pode_gerenciar_automacoes()
returns boolean
language sql
stable
security definer
set search_path = public
as $
  select exists (
    select 1
    from public.usuarios u
    left join public.grupos_permissao g on g.id = u.grupo_id
    where u.auth_user_id = auth.uid()
      and coalesce(u.ativo, true)
      and (
        u.role in ('admin', 'supervisor')
        or lower(u.email) = 'admin@grupounita.net.br'
        or g.nome = 'Administra??o Geral'
        or coalesce(g.permissoes ->> 'fluxos.acessar', 'off') not in ('off', 'none', 'false', '')
      )
  );
$;

revoke all on function public.usuario_pode_gerenciar_automacoes() from public;
grant execute on function public.usuario_pode_gerenciar_automacoes() to authenticated;
grant select on public.automacao_eventos to authenticated;
grant select, update on public.automacao_regras to authenticated;

alter table public.automacao_eventos enable row level security;
alter table public.automacao_regras enable row level security;
drop policy if exists "automacao_eventos_painel" on public.automacao_eventos;
create policy "automacao_eventos_painel" on public.automacao_eventos
  for select to authenticated using (public.usuario_pode_gerenciar_automacoes());
drop policy if exists "automacao_regras_painel_select" on public.automacao_regras;
create policy "automacao_regras_painel_select" on public.automacao_regras
  for select to authenticated using (public.usuario_pode_gerenciar_automacoes());
drop policy if exists "automacao_regras_painel_update" on public.automacao_regras;
create policy "automacao_regras_painel_update" on public.automacao_regras
  for update to authenticated
  using (public.usuario_pode_gerenciar_automacoes())
  with check (public.usuario_pode_gerenciar_automacoes());

create or replace function public.normalizar_status_automacao(p_status text)
returns text
language sql
immutable
as $$
  select upper(trim(coalesce(p_status, '')))
$$;

create or replace function public.enfileirar_evento_automacao(
  p_evento text,
  p_valor_gatilho text,
  p_entidade_tipo text,
  p_entidade_id text,
  p_chave_dedupe text,
  p_destinatario text,
  p_payload jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if nullif(regexp_replace(coalesce(p_destinatario, ''), '\D', '', 'g'), '') is null then
    return false;
  end if;

  insert into public.automacao_eventos(
    evento, valor_gatilho, entidade_tipo, entidade_id, chave_dedupe,
    destinatario, payload, status, proxima_tentativa
  )
  values(
    p_evento, p_valor_gatilho, p_entidade_tipo, p_entidade_id, p_chave_dedupe,
    p_destinatario, coalesce(p_payload, '{}'::jsonb), 'pendente', now()
  )
  on conflict (chave_dedupe) do nothing;

  return found;
end;
$$;

create or replace function public.trg_automacao_status_proposta()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text := public.normalizar_status_automacao(new.status_venda);
  v_anterior text := case when tg_op = 'UPDATE' then public.normalizar_status_automacao(old.status_venda) else null end;
  v_telefone text := coalesce(nullif(new.telefone1, ''), nullif(new.telefone2, ''), nullif(new.telefone3, ''));
begin
  if v_status = '' or (tg_op = 'UPDATE' and v_status is not distinct from v_anterior) then
    return new;
  end if;

  perform public.enfileirar_evento_automacao(
    'crm.venda.status_alterado',
    v_status,
    'proposta',
    new.id::text,
    format('crm.proposta:%s:%s:%s', new.id, txid_current(), v_status),
    v_telefone,
    jsonb_build_object(
      'proposta_id', new.id,
      'nome', coalesce(new.nome, ''),
      'telefone', coalesce(v_telefone, ''),
      'plano', coalesce(new.plano, ''),
      'valor_plano', coalesce(new.valor_plano, 0),
      'status_anterior', coalesce(v_anterior, ''),
      'status_novo', v_status,
      'data_instalacao', new.data_instalacao,
      'data_agendamento', new.data_agendamento,
      'periodo_instalacao', coalesce(new.periodo_instalacao, '')
    )
  );
  return new;
end;
$$;

do $
declare v_trigger record;
begin
  for v_trigger in
    select t.tgname
    from pg_trigger t
    where t.tgrelid = 'public.proposta'::regclass
      and not t.tgisinternal
      and pg_get_functiondef(t.tgfoid) ilike '%automacao_eventos%'
  loop
    execute format('drop trigger if exists %I on public.proposta', v_trigger.tgname);
  end loop;
end $;

drop trigger if exists proposta_automacao_status_trg on public.proposta;
create trigger proposta_automacao_status_trg
after insert or update of status_venda on public.proposta
for each row execute function public.trg_automacao_status_proposta();

create or replace function public.trg_automacao_status_suporte()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text := public.normalizar_status_automacao(new.status);
  v_anterior text := case when tg_op = 'UPDATE' then public.normalizar_status_automacao(old.status) else null end;
  v_proposta public.proposta%rowtype;
  v_telefone text;
begin
  if v_status = '' or (tg_op = 'UPDATE' and v_status is not distinct from v_anterior) then
    return new;
  end if;

  select * into v_proposta from public.proposta where id = new.proposta_id;
  v_telefone := coalesce(nullif(v_proposta.telefone1, ''), nullif(v_proposta.telefone2, ''), nullif(v_proposta.telefone3, ''));

  perform public.enfileirar_evento_automacao(
    'suporte.chamado.status_alterado',
    v_status,
    'suporte_chamado',
    new.id::text,
    format('suporte.chamado:%s:%s', new.id, v_status),
    v_telefone,
    jsonb_build_object(
      'chamado_id', new.id,
      'os', new.id,
      'proposta_id', new.proposta_id,
      'nome', coalesce(v_proposta.nome, ''),
      'telefone', coalesce(v_telefone, ''),
      'plano', coalesce(v_proposta.plano, ''),
      'status_venda', coalesce(v_proposta.status_venda, ''),
      'status', v_status,
      'status_anterior', coalesce(v_anterior, ''),
      'observacoes', coalesce(new.observacoes, ''),
      'solucao', coalesce(new.solucao, ''),
      'pendencia', coalesce(new.pendencia, ''),
      'criado_por', coalesce(new.criado_por, '')
    )
  );
  return new;
end;
$$;

do $
declare v_trigger record;
begin
  for v_trigger in
    select t.tgname
    from pg_trigger t
    where t.tgrelid = 'public.suporte_chamados'::regclass
      and not t.tgisinternal
      and pg_get_functiondef(t.tgfoid) ilike '%automacao_eventos%'
  loop
    execute format('drop trigger if exists %I on public.suporte_chamados', v_trigger.tgname);
  end loop;
end $;

drop trigger if exists suporte_chamado_automacao_status_trg on public.suporte_chamados;
create trigger suporte_chamado_automacao_status_trg
after insert or update of status on public.suporte_chamados
for each row execute function public.trg_automacao_status_suporte();

create or replace function public.trg_automacao_fatura()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_proposta public.proposta%rowtype;
  v_telefone text;
  v_status text := lower(trim(coalesce(new.status, '')));
  v_status_anterior text := case when tg_op = 'UPDATE' then lower(trim(coalesce(old.status, ''))) else '' end;
  v_paga boolean;
  v_paga_anterior boolean;
begin
  select * into v_proposta from public.proposta where id = new.proposta_id;
  v_telefone := coalesce(nullif(v_proposta.telefone1, ''), nullif(v_proposta.telefone2, ''), nullif(v_proposta.telefone3, ''));
  v_paga := new.data_pagamento is not null or v_status in ('pago', 'paga', 'paga_atraso', 'regularizada');
  v_paga_anterior := tg_op = 'UPDATE' and (
    old.data_pagamento is not null or v_status_anterior in ('pago', 'paga', 'paga_atraso', 'regularizada')
  );

  if tg_op = 'INSERT'
    and not v_paga
    and (new.data_vencimento is null or new.data_vencimento >= current_date)
  then
    perform public.enfileirar_evento_automacao(
      'cobranca.fatura.gerada', null, 'fatura_status', new.id::text,
      format('cobranca.fatura:%s:gerada', new.id), v_telefone,
      jsonb_build_object(
        'fatura_id', new.id, 'proposta_id', new.proposta_id,
        'nome', coalesce(v_proposta.nome, ''), 'telefone', coalesce(v_telefone, ''),
        'mes_referencia', coalesce(new.numero_referencia, to_char(new.data_vencimento, 'MM/YYYY')),
        'valor', coalesce(new.valor_pago, v_proposta.valor_plano, 0),
        'vencimento', case when new.data_vencimento is null then '' else to_char(new.data_vencimento, 'DD/MM/YYYY') end
      )
    );
  end if;

  if tg_op = 'UPDATE' and v_paga and not v_paga_anterior then
    perform public.enfileirar_evento_automacao(
      'cobranca.fatura.paga', null, 'fatura_status', new.id::text,
      format('cobranca.fatura:%s:paga', new.id), v_telefone,
      jsonb_build_object(
        'fatura_id', new.id, 'proposta_id', new.proposta_id,
        'nome', coalesce(v_proposta.nome, ''), 'telefone', coalesce(v_telefone, ''),
        'mes_referencia', coalesce(new.numero_referencia, ''),
        'valor', coalesce(new.valor_pago, v_proposta.valor_plano, 0),
        'data_pagamento', case when new.data_pagamento is null then '' else to_char(new.data_pagamento, 'DD/MM/YYYY') end
      )
    );
  end if;
  return new;
end;
$$;

do $
declare v_trigger record;
begin
  for v_trigger in
    select t.tgname
    from pg_trigger t
    where t.tgrelid = 'public.faturas_status'::regclass
      and not t.tgisinternal
      and pg_get_functiondef(t.tgfoid) ilike '%automacao_eventos%'
  loop
    execute format('drop trigger if exists %I on public.faturas_status', v_trigger.tgname);
  end loop;
end $;

drop trigger if exists fatura_automacao_eventos_trg on public.faturas_status;
create trigger fatura_automacao_eventos_trg
after insert or update of status, data_pagamento on public.faturas_status
for each row execute function public.trg_automacao_fatura();

create or replace function public.gerar_eventos_cobranca_calendario()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total integer := 0;
  v_criados integer;
begin
  with candidatas as (
    select
      f.*, p.nome, p.telefone1, p.telefone2, p.telefone3, p.valor_plano,
      coalesce(nullif(p.telefone1, ''), nullif(p.telefone2, ''), nullif(p.telefone3, '')) telefone
    from public.faturas_status f
    join public.proposta p on p.id = f.proposta_id
    where f.data_vencimento = current_date + 3
      and f.data_pagamento is null
      and lower(trim(coalesce(f.status, 'pendente'))) not in ('pago', 'paga', 'paga_atraso', 'regularizada')
  )
  insert into public.automacao_eventos(evento, valor_gatilho, entidade_tipo, entidade_id, chave_dedupe, destinatario, payload)
  select
    'cobranca.fatura.proximo_vencimento', null, 'fatura_status', c.id::text,
    format('cobranca.fatura:%s:vence_3_dias', c.id), c.telefone,
    jsonb_build_object(
      'fatura_id', c.id, 'proposta_id', c.proposta_id, 'nome', coalesce(c.nome, ''),
      'telefone', coalesce(c.telefone, ''), 'mes_referencia', coalesce(c.numero_referencia, ''),
      'valor', coalesce(c.valor_pago, c.valor_plano, 0), 'vencimento', to_char(c.data_vencimento, 'DD/MM/YYYY')
    )
  from candidatas c
  where nullif(regexp_replace(coalesce(c.telefone, ''), '\D', '', 'g'), '') is not null
  on conflict (chave_dedupe) do nothing;
  get diagnostics v_criados = row_count;
  v_total := v_total + v_criados;

  with candidatas as (
    select
      f.*, p.nome, p.telefone1, p.telefone2, p.telefone3, p.valor_plano,
      coalesce(nullif(p.telefone1, ''), nullif(p.telefone2, ''), nullif(p.telefone3, '')) telefone
    from public.faturas_status f
    join public.proposta p on p.id = f.proposta_id
    where f.data_vencimento = current_date - 1
      and f.data_pagamento is null
      and lower(trim(coalesce(f.status, 'pendente'))) not in ('pago', 'paga', 'paga_atraso', 'regularizada')
  )
  insert into public.automacao_eventos(evento, valor_gatilho, entidade_tipo, entidade_id, chave_dedupe, destinatario, payload)
  select
    'cobranca.fatura.vencida', null, 'fatura_status', c.id::text,
    format('cobranca.fatura:%s:vencida', c.id), c.telefone,
    jsonb_build_object(
      'fatura_id', c.id, 'proposta_id', c.proposta_id, 'nome', coalesce(c.nome, ''),
      'telefone', coalesce(c.telefone, ''), 'mes_referencia', coalesce(c.numero_referencia, ''),
      'valor', coalesce(c.valor_pago, c.valor_plano, 0), 'vencimento', to_char(c.data_vencimento, 'DD/MM/YYYY')
    )
  from candidatas c
  where nullif(regexp_replace(coalesce(c.telefone, ''), '\D', '', 'g'), '') is not null
  on conflict (chave_dedupe) do nothing;
  get diagnostics v_criados = row_count;
  return v_total + v_criados;
end;
$$;

create or replace function public.gerar_eventos_acompanhamento_clientes()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total integer;
begin
  -- O acompanhamento e disparado somente na virada do mes, sem retroagir
  -- quando a migracao ou o servico sao instalados no meio da competencia.
  if extract(day from current_date) <> 1 then
    return 0;
  end if;

  with clientes as (
    select
      p.*,
      (
        extract(year from age(date_trunc('month', current_date), date_trunc('month', p.data_instalacao::date))) * 12
        + extract(month from age(date_trunc('month', current_date), date_trunc('month', p.data_instalacao::date)))
      )::integer mes_ciclo,
      coalesce(nullif(p.telefone1, ''), nullif(p.telefone2, ''), nullif(p.telefone3, '')) telefone
    from public.proposta p
    where public.normalizar_status_automacao(p.status_venda) in ('INSTALADA', 'INSTALADO')
      and p.data_instalacao is not null
  )
  insert into public.automacao_eventos(evento, valor_gatilho, entidade_tipo, entidade_id, chave_dedupe, destinatario, payload)
  select
    'cliente.acompanhamento.mes', c.mes_ciclo::text, 'proposta', c.id::text,
    format('cliente.acompanhamento:%s:mes_%s', c.id, c.mes_ciclo), c.telefone,
    jsonb_build_object(
      'proposta_id', c.id, 'nome', coalesce(c.nome, ''), 'telefone', coalesce(c.telefone, ''),
      'plano', coalesce(c.plano, ''), 'mes_ciclo', c.mes_ciclo,
      'data_instalacao', c.data_instalacao
    )
  from clientes c
  where c.mes_ciclo in (1, 5, 10)
    and nullif(regexp_replace(coalesce(c.telefone, ''), '\D', '', 'g'), '') is not null
  on conflict (chave_dedupe) do nothing;
  get diagnostics v_total = row_count;
  return v_total;
end;
$$;

-- Fila específica para clientes que ainda estão no ciclo de instalação.
insert into public.filas(nome, cor, icone, descricao, equipe_id, ativo)
select 'INSTALAÇÃO', '#8b5cf6', '🛠️', 'Clientes aprovados ou aguardando instalação', 3, true
where not exists (select 1 from public.filas where upper(nome) = 'INSTALAÇÃO');

-- Atualiza regras existentes sem criar duplicatas.
update public.automacao_regras
set canal_id = 3, ativo = true, updated_at = now()
where evento in (
  'crm.venda.status_alterado',
  'cobranca.fatura.gerada',
  'cobranca.fatura.proximo_vencimento',
  'cobranca.fatura.vencida',
  'suporte.chamado.status_alterado'
)
and (
  evento <> 'crm.venda.status_alterado'
  or valor_gatilho in ('APROVADA', 'APROVADO', 'AUDITADA', 'AGUARDANDO INSTALAÇÃO', 'INSTALADA', 'CANCELADA', 'CANCELADA INTERNAMENTE', 'CANCELADA EXTERNAMENTE')
);

insert into public.automacao_regras(evento, valor_gatilho, nome, canal_id, tipo, mensagem, ativo)
select x.evento, x.valor_gatilho, x.nome, 3, 'webjs', x.mensagem, true
from (values
  ('cobranca.fatura.paga', null::text, 'Cobrança - pagamento recebido', 'Oi, {{nome}}! Recebemos o pagamento da sua fatura de {{mes_referencia}}. Obrigado!'),
  ('cliente.acompanhamento.mes', '1', 'Acompanhamento - mês 1', 'Oi, {{nome}}! Seu primeiro mês com a Unita começou. Está tudo funcionando bem? Se precisar, estamos por aqui.'),
  ('cliente.acompanhamento.mes', '5', 'Acompanhamento - mês 5', 'Oi, {{nome}}! Você já está no quinto mês conosco. De 0 a 10, como avalia sua experiência até aqui?'),
  ('cliente.acompanhamento.mes', '10', 'Acompanhamento - mês 10', 'Oi, {{nome}}! Chegamos ao décimo mês do acompanhamento inicial. Se tiver dúvidas ou quiser falar sobre renovação, conte com a gente.')
) as x(evento, valor_gatilho, nome, mensagem)
where not exists (
  select 1 from public.automacao_regras r
  where r.evento = x.evento and r.valor_gatilho is not distinct from x.valor_gatilho
);

update public.automacao_regras
set canal_id = 3, ativo = true, updated_at = now()
where evento in ('cobranca.fatura.paga', 'cliente.acompanhamento.mes');

select public.gerar_eventos_cobranca_calendario();
select public.gerar_eventos_acompanhamento_clientes();
