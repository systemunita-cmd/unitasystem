-- Ausências detalhadas na Jornada de Ponto.
-- Execute antes de usar o campo Outros; é idempotente.
alter table public.ponto_registros
  add column if not exists observacao text;

comment on column public.ponto_registros.observacao is
  'Motivo visual e detalhe informado pelo RH em ajustes manuais de ponto.';
