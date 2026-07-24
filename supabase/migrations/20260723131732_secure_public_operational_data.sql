-- Protect operational sync data exposed through the Data API.
alter table public.nfd_itens enable row level security;
alter table public.nfd_logs enable row level security;
alter table public.produtos enable row level security;

-- Browser clients only need read access to NFDs and the active product catalog.
revoke all on table public.nfd_itens from anon, authenticated;
grant select on table public.nfd_itens to authenticated;

revoke all on table public.nfd_logs from anon, authenticated;

revoke all on table public.produtos from anon, authenticated;
grant select on table public.produtos to authenticated;

drop policy if exists nfd_itens_select_gerencial_or_assigned_promotor on public.nfd_itens;
create policy nfd_itens_select_gerencial_or_assigned_promotor
on public.nfd_itens
for select
to authenticated
using (
  (select public.is_current_user_gerencial_ativo())
  or exists (
    select 1
    from public.lojas as l
    join public.loja_promotores as lp on lp.loja_id = l.id
    join public.usuarios as u on u.id = lp.promotor_id
    where l.codigo = public.nfd_itens.codigo_cliente::text
      and u.auth_user_id = (select auth.uid())
      and u.perfil = 'Promotor'
      and u.ativo is true
  )
);

drop policy if exists produtos_select_authenticated on public.produtos;
create policy produtos_select_authenticated
on public.produtos
for select
to authenticated
using (
  status is true
  or (select public.is_current_user_gerencial_ativo())
);

-- These privileged RPCs already validate that the caller is an active Gerencial.
-- They must never be reachable without a valid authenticated session.
revoke execute on function public.create_gerencial_user(uuid, text, text) from public, anon;
grant execute on function public.create_gerencial_user(uuid, text, text) to authenticated;

revoke execute on function public.is_current_user_gerencial_ativo() from public, anon;
grant execute on function public.is_current_user_gerencial_ativo() to authenticated;

revoke execute on function public.update_gerencial_user(uuid, text, text, boolean) from public, anon;
grant execute on function public.update_gerencial_user(uuid, text, text, boolean) to authenticated;

-- The unique constraint duplicates the primary-key index on produtos.
alter table public.produtos drop constraint if exists produtos_id_key;
