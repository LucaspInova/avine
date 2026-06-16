with duplicados as (
  select
    id,
    nome,
    email,
    row_number() over (
      partition by lower(btrim(nome))
      order by created_at, email
    ) as posicao
  from public.usuarios
),
nomes_corrigidos as (
  select
    id,
    upper(
      btrim(nome) || ' ' || split_part(email, '@', 1)
    ) as nome_corrigido
  from duplicados
  where posicao > 1
)
update public.usuarios as u
set nome = nomes_corrigidos.nome_corrigido
from nomes_corrigidos
where u.id = nomes_corrigidos.id;

create unique index if not exists usuarios_nome_unico_idx
on public.usuarios (lower(btrim(nome)));

grant delete on table public.usuarios to anon, authenticated;

drop policy if exists "usuarios_delete_client" on public.usuarios;
create policy "usuarios_delete_client"
on public.usuarios
for delete
to anon, authenticated
using (true);
