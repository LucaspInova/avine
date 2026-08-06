alter table public.lojas drop constraint if exists lojas_uf_check;
alter table public.lojas
  add constraint lojas_uf_check
  check (uf in ('CE', 'MA', 'BA', 'PA', 'PB', 'PI', 'PE', 'AP', 'SE', 'RN', 'AL', 'TO'));
drop policy if exists "lojas_insert_gerencial" on public.lojas;
create policy "lojas_insert_gerencial"
on public.lojas
for insert
to authenticated
with check (
  app_private.is_current_user_gerencial_ativo()
  and uf in ('CE', 'MA', 'BA', 'PA', 'PB', 'PI', 'PE', 'AP', 'SE', 'RN', 'AL', 'TO')
);
drop policy if exists "lojas_update_gerencial" on public.lojas;
create policy "lojas_update_gerencial"
on public.lojas
for update
to authenticated
using (app_private.is_current_user_gerencial_ativo())
with check (uf in ('CE', 'MA', 'BA', 'PA', 'PB', 'PI', 'PE', 'AP', 'SE', 'RN', 'AL', 'TO'));
