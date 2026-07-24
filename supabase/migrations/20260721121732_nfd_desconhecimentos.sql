-- Registra cada movimentação em que um promotor declara não reconhecer uma NFD.
-- A NFD exibida no app vem da view/importação `nfd_notas`, por isso o vínculo
-- usa uma referência textual e também mantém um snapshot dos dados principais.

create table if not exists public.nfd_desconhecimentos (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references public.lojas(id) on delete restrict,
  promotor_id uuid not null references public.usuarios(id) on delete restrict,
  nfd_referencia text not null,
  nfd_chave_acesso text,
  nfd_numero text not null,
  loja_codigo text,
  comentario text not null check (length(btrim(comentario)) > 0),
  created_at timestamptz not null default now()
);

comment on table public.nfd_desconhecimentos is
  'Histórico de declarações de promotores que não reconhecem a procedência de uma NFD.';
comment on column public.nfd_desconhecimentos.nfd_referencia is
  'Identificador usado pelo app para localizar a NFD, normalmente codigo_cliente:nota_fiscal.';
comment on column public.nfd_desconhecimentos.nfd_chave_acesso is
  'Chave de acesso da NFD na origem/importação, quando disponível.';

create index if not exists nfd_desconhecimentos_promotor_id_idx
  on public.nfd_desconhecimentos (promotor_id, created_at desc);
create index if not exists nfd_desconhecimentos_loja_id_idx
  on public.nfd_desconhecimentos (loja_id, created_at desc);
create index if not exists nfd_desconhecimentos_nfd_referencia_idx
  on public.nfd_desconhecimentos (nfd_referencia, created_at desc);

grant usage on schema public to authenticated;
revoke all on table public.nfd_desconhecimentos from anon;
grant select, insert on table public.nfd_desconhecimentos to authenticated;

alter table public.nfd_desconhecimentos enable row level security;

drop policy if exists "nfd_desconhecimentos_select_gerencial_or_own" on public.nfd_desconhecimentos;
create policy "nfd_desconhecimentos_select_gerencial_or_own"
on public.nfd_desconhecimentos
for select
to authenticated
using (
  public.is_current_user_gerencial_ativo()
  or exists (
    select 1
    from public.usuarios as u
    where u.id = nfd_desconhecimentos.promotor_id
      and u.auth_user_id = (select auth.uid())
      and u.perfil = 'Promotor'
      and u.ativo is true
  )
);

drop policy if exists "nfd_desconhecimentos_insert_own_assigned_store" on public.nfd_desconhecimentos;
create policy "nfd_desconhecimentos_insert_own_assigned_store"
on public.nfd_desconhecimentos
for insert
to authenticated
with check (
  exists (
    select 1
    from public.usuarios as u
    where u.id = nfd_desconhecimentos.promotor_id
      and u.auth_user_id = (select auth.uid())
      and u.perfil = 'Promotor'
      and u.ativo is true
  )
  and exists (
    select 1
    from public.loja_promotores as lp
    where lp.loja_id = nfd_desconhecimentos.loja_id
      and lp.promotor_id = nfd_desconhecimentos.promotor_id
  )
);

notify pgrst, 'reload schema';
