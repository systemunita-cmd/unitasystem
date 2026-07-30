-- Conciliação bancária avançada e bloqueio contábil rígido.
-- Inclusão aditiva: preserva lançamentos e conciliações existentes.

alter table public.fin_titulos
  add column if not exists valor_conciliado numeric not null default 0;

alter table public.fin_extratos
  add column if not exists status_conciliacao text not null default 'pendente',
  add column if not exists valor_alocado numeric not null default 0;

update public.fin_extratos
set status_conciliacao = case when conciliado then 'conciliado' else 'pendente' end,
    valor_alocado = case when conciliado then valor else 0 end
where status_conciliacao = 'pendente' or valor_alocado = 0;

create table if not exists public.fin_conciliacoes (
  id uuid primary key default gen_random_uuid(),
  extrato_id uuid not null references public.fin_extratos(id) on delete cascade,
  competencia text not null,
  valor_extrato numeric not null,
  valor_alocado numeric not null default 0,
  diferenca numeric not null default 0,
  status text not null default 'parcial' check (status in ('parcial','conciliada','cancelada')),
  observacao text,
  conciliado_por text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.fin_conciliacao_itens (
  id uuid primary key default gen_random_uuid(),
  conciliacao_id uuid not null references public.fin_conciliacoes(id) on delete cascade,
  titulo_id uuid references public.fin_titulos(id) on delete restrict,
  tipo text not null default 'titulo' check (tipo in ('titulo','tarifa','ajuste')),
  descricao text,
  valor numeric not null check (valor > 0),
  created_at timestamptz not null default now()
);

create index if not exists fin_conciliacoes_extrato_idx on public.fin_conciliacoes(extrato_id, created_at desc);
create index if not exists fin_conciliacoes_competencia_idx on public.fin_conciliacoes(competencia);
create index if not exists fin_conciliacao_itens_titulo_idx on public.fin_conciliacao_itens(titulo_id);

alter table public.fin_conciliacoes enable row level security;
alter table public.fin_conciliacao_itens enable row level security;

drop policy if exists "fin_conciliacoes_authenticated" on public.fin_conciliacoes;
create policy "fin_conciliacoes_authenticated" on public.fin_conciliacoes
  for select to authenticated using (true);
drop policy if exists "fin_conciliacao_itens_authenticated" on public.fin_conciliacao_itens;
create policy "fin_conciliacao_itens_authenticated" on public.fin_conciliacao_itens
  for select to authenticated using (true);

create or replace function public.competencia_financeira_fechada(p_competencia text)
returns boolean language sql stable set search_path = public as $$
  select exists (
    select 1 from public.fin_competencias
    where competencia = p_competencia and status = 'fechada'
  );
$$;

create or replace function public.impedir_alteracao_competencia_fechada()
returns trigger language plpgsql set search_path = public as $$
declare
  v_competencia text;
  v_competencia_anterior text;
  v_titulo_id uuid;
begin
  if tg_table_name = 'fin_titulos' then
    v_competencia := coalesce(
      case when tg_op <> 'DELETE' then new.competencia end,
      case when tg_op <> 'INSERT' then old.competencia end,
      substring(coalesce(
        case when tg_op <> 'DELETE' then new.vencimento::text end,
        case when tg_op <> 'INSERT' then old.vencimento::text end
      ) from 1 for 7)
    );
  elsif tg_table_name = 'fin_extratos' then
    v_competencia := to_char(coalesce(
      case when tg_op <> 'DELETE' then new.data end,
      case when tg_op <> 'INSERT' then old.data end
    ), 'YYYY-MM');
  elsif tg_table_name = 'folha_itens' then
    v_competencia := coalesce(
      case when tg_op <> 'DELETE' then new.competencia end,
      case when tg_op <> 'INSERT' then old.competencia end
    );
  elsif tg_table_name = 'fin_titulo_anexos' then
    v_titulo_id := coalesce(
      case when tg_op <> 'DELETE' then new.titulo_id end,
      case when tg_op <> 'INSERT' then old.titulo_id end
    );
    select competencia into v_competencia from public.fin_titulos where id = v_titulo_id;
  elsif tg_table_name = 'fin_conciliacoes' then
    v_competencia := coalesce(
      case when tg_op <> 'DELETE' then new.competencia end,
      case when tg_op <> 'INSERT' then old.competencia end
    );
  end if;

  if v_competencia is not null and public.competencia_financeira_fechada(v_competencia) then
    raise exception 'COMPETENCIA_FECHADA: a competência % está fechada e não permite inclusões, edições ou exclusões.', v_competencia
      using errcode = 'P0001';
  end if;
  if tg_op = 'UPDATE' then
    if tg_table_name = 'fin_titulos' then
      v_competencia_anterior := coalesce(old.competencia, substring(old.vencimento::text from 1 for 7));
    elsif tg_table_name = 'fin_extratos' then
      v_competencia_anterior := to_char(old.data, 'YYYY-MM');
    elsif tg_table_name = 'folha_itens' then
      v_competencia_anterior := old.competencia;
    elsif tg_table_name = 'fin_titulo_anexos' then
      select competencia into v_competencia_anterior from public.fin_titulos where id = old.titulo_id;
    elsif tg_table_name = 'fin_conciliacoes' then
      v_competencia_anterior := old.competencia;
    end if;
    if v_competencia_anterior is not null and public.competencia_financeira_fechada(v_competencia_anterior) then
      raise exception 'COMPETENCIA_FECHADA: a competência original % está fechada e o lançamento não pode ser movido ou alterado.', v_competencia_anterior using errcode = 'P0001';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['fin_titulos','fin_extratos','folha_itens','fin_titulo_anexos','fin_conciliacoes']
  loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists bloquear_competencia_fechada on public.%I', t);
      execute format(
        'create trigger bloquear_competencia_fechada before insert or update or delete on public.%I for each row execute function public.impedir_alteracao_competencia_fechada()',
        t
      );
    end if;
  end loop;
end $$;

create or replace function public.conciliar_extrato_avancado(
  p_extrato_id uuid,
  p_itens jsonb,
  p_observacao text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_extrato public.fin_extratos%rowtype;
  v_conciliacao_id uuid;
  v_item jsonb;
  v_titulo public.fin_titulos%rowtype;
  v_novo_titulo_id uuid;
  v_valor numeric;
  v_total numeric := 0;
  v_diferenca numeric;
  v_status text;
  v_email text := coalesce(auth.jwt() ->> 'email', auth.uid()::text);
begin
  if not coalesce(public.usuario_pode_acessar_financeiro(), false) then
    raise exception 'Acesso financeiro não autorizado.';
  end if;

  select * into v_extrato from public.fin_extratos where id = p_extrato_id for update;
  if not found then raise exception 'Movimento bancário não encontrado.'; end if;
  if public.competencia_financeira_fechada(to_char(v_extrato.data, 'YYYY-MM')) then
    raise exception 'COMPETENCIA_FECHADA: reabra a competência antes de conciliar.';
  end if;
  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'Informe ao menos uma alocação.';
  end if;

  for v_item in select * from jsonb_array_elements(p_itens)
  loop
    v_valor := round(coalesce((v_item ->> 'valor')::numeric, 0), 2);
    if v_valor <= 0 then raise exception 'Toda alocação deve ter valor maior que zero.'; end if;
    v_total := v_total + v_valor;
  end loop;
  if coalesce(v_extrato.valor_alocado, 0) + v_total > v_extrato.valor + 0.01 then
    raise exception 'As alocações (%) superam o valor do extrato (%).', v_total, v_extrato.valor;
  end if;

  insert into public.fin_conciliacoes(
    extrato_id, competencia, valor_extrato, valor_alocado, diferenca,
    status, observacao, conciliado_por
  ) values (
    v_extrato.id, to_char(v_extrato.data, 'YYYY-MM'), v_extrato.valor, v_total,
    round(v_extrato.valor - coalesce(v_extrato.valor_alocado, 0) - v_total, 2),
    case when abs(v_extrato.valor - coalesce(v_extrato.valor_alocado, 0) - v_total) <= 0.01 then 'conciliada' else 'parcial' end,
    nullif(trim(p_observacao), ''), v_email
  ) returning id into v_conciliacao_id;

  for v_item in select * from jsonb_array_elements(p_itens)
  loop
    v_valor := round((v_item ->> 'valor')::numeric, 2);
    if coalesce(v_item ->> 'tipo', 'titulo') = 'titulo' then
      select * into v_titulo from public.fin_titulos where id = (v_item ->> 'titulo_id')::uuid for update;
      if not found then raise exception 'Título da conciliação não encontrado.'; end if;
      if v_titulo.tipo <> (case when v_extrato.tipo = 'credito' then 'receber' else 'pagar' end) then
        raise exception 'O tipo do título não corresponde ao movimento bancário.';
      end if;
      if coalesce(v_titulo.valor_conciliado, 0) + v_valor > v_titulo.valor + 0.01 then
        raise exception 'A alocação supera o saldo do título %.', v_titulo.descricao;
      end if;
      insert into public.fin_conciliacao_itens(conciliacao_id,titulo_id,tipo,descricao,valor)
      values(v_conciliacao_id,v_titulo.id,'titulo',v_titulo.descricao,v_valor);
      update public.fin_titulos
      set valor_conciliado = coalesce(valor_conciliado,0) + v_valor,
          status = case when coalesce(valor_conciliado,0) + v_valor >= valor - 0.01 then 'pago' else status end,
          pago_em = case when coalesce(valor_conciliado,0) + v_valor >= valor - 0.01 then v_extrato.data else pago_em end
      where id = v_titulo.id;
    elsif (v_item ->> 'tipo') = 'tarifa' then
      insert into public.fin_titulos(tipo,descricao,valor,competencia,vencimento,status,categoria,origem_modulo,origem_tipo,origem_id,valor_conciliado,metadata,pago_em)
      values ('pagar',coalesce(nullif(v_item ->> 'descricao',''),'Tarifa bancária'),v_valor,to_char(v_extrato.data,'YYYY-MM'),v_extrato.data,'pago','Tarifas bancárias','Financeiro','conciliacao_tarifa',v_conciliacao_id::text,v_valor,jsonb_build_object('extrato_id',v_extrato.id,'conciliacao_id',v_conciliacao_id),v_extrato.data)
      returning id into v_novo_titulo_id;
      insert into public.fin_conciliacao_itens(conciliacao_id,titulo_id,tipo,descricao,valor)
      values(v_conciliacao_id,v_novo_titulo_id,'tarifa',coalesce(nullif(v_item ->> 'descricao',''),'Tarifa bancária'),v_valor);
    else
      insert into public.fin_conciliacao_itens(conciliacao_id,tipo,descricao,valor)
      values(v_conciliacao_id,'ajuste',coalesce(nullif(v_item ->> 'descricao',''),'Ajuste de conciliação'),v_valor);
    end if;
  end loop;

  v_diferenca := round(v_extrato.valor - coalesce(v_extrato.valor_alocado, 0) - v_total, 2);
  v_status := case when abs(v_diferenca) <= 0.01 then 'conciliado' else 'parcial' end;
  update public.fin_extratos set
    valor_alocado = coalesce(valor_alocado, 0) + v_total,
    status_conciliacao = v_status,
    conciliado = v_status = 'conciliado',
    titulo_id = case
      when jsonb_array_length(p_itens) = 1 and (p_itens -> 0 ->> 'tipo') = 'titulo'
      then (p_itens -> 0 ->> 'titulo_id')::uuid else null end
  where id = v_extrato.id;

  return jsonb_build_object(
    'conciliacao_id', v_conciliacao_id,
    'status', v_status,
    'valor_alocado', v_total,
    'diferenca', v_diferenca
  );
end;
$$;

revoke all on function public.conciliar_extrato_avancado(uuid,jsonb,text) from public;
grant execute on function public.conciliar_extrato_avancado(uuid,jsonb,text) to authenticated;

