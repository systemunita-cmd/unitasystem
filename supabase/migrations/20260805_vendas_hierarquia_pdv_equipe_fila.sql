-- Hierarquia comercial definitiva e aditiva:
--   equipes            = Empresa/PDV (nome legado preservado)
--   filas              = Equipe      (nome legado preservado)
--   filas_operacionais = Fila        (novo nivel)

alter table public.proposta add column if not exists pdv_id bigint;
alter table public.proposta add column if not exists equipe_comercial_id bigint;
alter table public.proposta add column if not exists fila_operacional_id bigint;
alter table public.usuarios add column if not exists fila_operacional_id bigint;

create index if not exists proposta_pdv_id_idx on public.proposta(pdv_id);
create index if not exists proposta_equipe_comercial_id_idx on public.proposta(equipe_comercial_id);
create index if not exists proposta_fila_operacional_id_idx on public.proposta(fila_operacional_id);
create index if not exists usuarios_fila_operacional_id_idx on public.usuarios(fila_operacional_id);

create or replace function public.hierarquia_id_seguro(p_valor text)
returns bigint
language sql
immutable
as $$
  select case when trim(coalesce(p_valor,'')) ~ '^[0-9]+$' then trim(p_valor)::bigint else null end
$$;

-- Primeiro recupera os IDs que já estavam dentro dos campos customizados.
update public.proposta p
set pdv_id = coalesce(
      p.pdv_id,
      public.hierarquia_id_seguro(p.dados_customizados->>'pdv_id'),
      public.hierarquia_id_seguro(p.dados_customizados->>'equipe_id'),
      public.hierarquia_id_seguro(to_jsonb(p)->>'equipe_id'),
      public.hierarquia_id_seguro(to_jsonb(p)->>'equipe_id_criador')
    ),
    equipe_comercial_id = coalesce(
      p.equipe_comercial_id,
      public.hierarquia_id_seguro(p.dados_customizados->>'equipe_comercial_id'),
      public.hierarquia_id_seguro(p.dados_customizados->>'fila_id'),
      public.hierarquia_id_seguro(p.dados_customizados->>'fila')
    ),
    fila_operacional_id = coalesce(
      p.fila_operacional_id,
      public.hierarquia_id_seguro(p.dados_customizados->>'fila_operacional_id'),
      public.hierarquia_id_seguro(p.dados_customizados->>'fila_operacional')
    );

-- Depois completa pelo cadastro do vendedor, sem sobrescrever o histórico já identificado.
update public.proposta p
set pdv_id = coalesce(p.pdv_id, u.equipe_id),
    equipe_comercial_id = coalesce(p.equipe_comercial_id, u.fila_id),
    fila_operacional_id = coalesce(p.fila_operacional_id, u.fila_operacional_id)
from public.usuarios u
where (lower(trim(coalesce(u.email,''))) = lower(trim(coalesce(p.vendedor,'')))
    or lower(trim(coalesce(u.nome,''))) = lower(trim(coalesce(p.vendedor,''))))
  and (p.pdv_id is null or p.equipe_comercial_id is null or p.fila_operacional_id is null);

create or replace function public.preencher_hierarquia_proposta()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario public.usuarios%rowtype;
begin
  select * into v_usuario
  from public.usuarios u
  where lower(trim(coalesce(u.email,''))) = lower(trim(coalesce(new.vendedor,'')))
     or lower(trim(coalesce(u.nome,''))) = lower(trim(coalesce(new.vendedor,'')))
  order by case when lower(trim(coalesce(u.email,''))) = lower(trim(coalesce(new.vendedor,''))) then 0 else 1 end
  limit 1;

  new.pdv_id := coalesce(
    new.pdv_id,
    public.hierarquia_id_seguro(new.dados_customizados->>'pdv_id'),
    public.hierarquia_id_seguro(new.dados_customizados->>'equipe_id'),
    public.hierarquia_id_seguro(to_jsonb(new)->>'equipe_id'),
    public.hierarquia_id_seguro(to_jsonb(new)->>'equipe_id_criador'),
    v_usuario.equipe_id
  );
  new.equipe_comercial_id := coalesce(
    new.equipe_comercial_id,
    public.hierarquia_id_seguro(new.dados_customizados->>'equipe_comercial_id'),
    public.hierarquia_id_seguro(new.dados_customizados->>'fila_id'),
    public.hierarquia_id_seguro(new.dados_customizados->>'fila'),
    v_usuario.fila_id
  );
  new.fila_operacional_id := coalesce(
    new.fila_operacional_id,
    public.hierarquia_id_seguro(new.dados_customizados->>'fila_operacional_id'),
    public.hierarquia_id_seguro(new.dados_customizados->>'fila_operacional'),
    v_usuario.fila_operacional_id
  );

  new.dados_customizados := coalesce(new.dados_customizados, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
    'pdv_id', new.pdv_id,
    'equipe_comercial_id', new.equipe_comercial_id,
    'fila_operacional_id', new.fila_operacional_id
  ));
  return new;
end;
$$;

drop trigger if exists proposta_preencher_hierarquia_trg on public.proposta;
create trigger proposta_preencher_hierarquia_trg
before insert or update of vendedor, dados_customizados, pdv_id, equipe_comercial_id, fila_operacional_id
on public.proposta
for each row execute function public.preencher_hierarquia_proposta();

-- Espelha os IDs canônicos no JSON para telas antigas continuarem compatíveis.
update public.proposta
set dados_customizados = coalesce(dados_customizados, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
  'pdv_id', pdv_id,
  'equipe_comercial_id', equipe_comercial_id,
  'fila_operacional_id', fila_operacional_id
));

comment on column public.proposta.pdv_id is 'Empresa/PDV; corresponde à antiga Equipe (public.equipes).';
comment on column public.proposta.equipe_comercial_id is 'Equipe comercial; corresponde à antiga Fila (public.filas).';
comment on column public.proposta.fila_operacional_id is 'Nova fila operacional vinculada à equipe comercial.';

select jsonb_build_object(
  'vendas_total', count(*),
  'vendas_com_pdv', count(*) filter (where pdv_id is not null),
  'vendas_com_equipe', count(*) filter (where equipe_comercial_id is not null),
  'vendas_com_fila', count(*) filter (where fila_operacional_id is not null)
) as hierarquia_vendas
from public.proposta;
