-- Compatibilidade dos cadastros financeiros com tabelas antigas.
-- Aditivo e idempotente: não remove nem sobrescreve cadastros existentes.

alter table public.fin_categorias
  add column if not exists ativo boolean not null default true;

alter table public.fin_centros_custo
  add column if not exists ativo boolean not null default true,
  add column if not exists responsavel text,
  add column if not exists orcamento_mensal numeric not null default 0;

update public.fin_categorias
set ativo = true
where ativo is null;

update public.fin_centros_custo
set ativo = true
where ativo is null;

update public.fin_centros_custo
set orcamento_mensal = 0
where orcamento_mensal is null;

alter table public.fin_categorias
  alter column ativo set default true,
  alter column ativo set not null;

alter table public.fin_centros_custo
  alter column ativo set default true,
  alter column ativo set not null,
  alter column orcamento_mensal set default 0,
  alter column orcamento_mensal set not null;
