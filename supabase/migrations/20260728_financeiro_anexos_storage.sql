-- Bucket privado. O acesso replica a permissão "financeiro_acessar" da aplicação.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'financeiro-anexos',
  'financeiro-anexos',
  false,
  10485760,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'text/csv']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.usuario_pode_acessar_financeiro()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.usuarios u
    left join public.grupos_permissao g on g.id = u.grupo_id
    where u.auth_user_id = auth.uid()
      and coalesce(u.ativo, true)
      and (
        u.role = 'admin'
        or lower(u.email) = 'admin@grupounita.net.br'
        or g.nome = 'Administração Geral'
        or coalesce((g.permissoes ->> 'financeiro_acessar')::boolean, false)
      )
  );
$$;

revoke all on function public.usuario_pode_acessar_financeiro() from public;
grant execute on function public.usuario_pode_acessar_financeiro() to authenticated;

drop policy if exists "financeiro_anexos_select_authenticated" on storage.objects;
create policy "financeiro_anexos_select_authenticated"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'financeiro-anexos'
    and public.usuario_pode_acessar_financeiro()
  );

drop policy if exists "financeiro_anexos_insert_authenticated" on storage.objects;
create policy "financeiro_anexos_insert_authenticated"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'financeiro-anexos'
    and public.usuario_pode_acessar_financeiro()
  );

drop policy if exists "financeiro_anexos_update_authenticated" on storage.objects;
create policy "financeiro_anexos_update_authenticated"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'financeiro-anexos'
    and public.usuario_pode_acessar_financeiro()
  )
  with check (
    bucket_id = 'financeiro-anexos'
    and public.usuario_pode_acessar_financeiro()
  );

drop policy if exists "financeiro_anexos_delete_authenticated" on storage.objects;
create policy "financeiro_anexos_delete_authenticated"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'financeiro-anexos'
    and public.usuario_pode_acessar_financeiro()
  );

-- Restringe também os metadados que foram criados na migração anterior.
drop policy if exists "fin_titulo_anexos_select_authenticated" on public.fin_titulo_anexos;
create policy "fin_titulo_anexos_select_authenticated"
  on public.fin_titulo_anexos for select to authenticated
  using (public.usuario_pode_acessar_financeiro());

drop policy if exists "fin_titulo_anexos_insert_authenticated" on public.fin_titulo_anexos;
create policy "fin_titulo_anexos_insert_authenticated"
  on public.fin_titulo_anexos for insert to authenticated
  with check (public.usuario_pode_acessar_financeiro());

drop policy if exists "fin_titulo_anexos_update_authenticated" on public.fin_titulo_anexos;
create policy "fin_titulo_anexos_update_authenticated"
  on public.fin_titulo_anexos for update to authenticated
  using (public.usuario_pode_acessar_financeiro())
  with check (public.usuario_pode_acessar_financeiro());

drop policy if exists "fin_titulo_anexos_delete_authenticated" on public.fin_titulo_anexos;
create policy "fin_titulo_anexos_delete_authenticated"
  on public.fin_titulo_anexos for delete to authenticated
  using (public.usuario_pode_acessar_financeiro());
