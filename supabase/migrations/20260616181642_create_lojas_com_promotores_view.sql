grant usage on schema public to anon, authenticated;

alter table public.usuarios enable row level security;
alter table public.lojas enable row level security;
alter table public.loja_promotores enable row level security;

grant select, insert, update, delete on table public.usuarios to anon, authenticated;
grant select, insert, update, delete on table public.lojas to anon, authenticated;
grant select, insert, update, delete on table public.loja_promotores to anon, authenticated;

drop policy if exists "usuarios_delete_client" on public.usuarios;
create policy "usuarios_delete_client"
on public.usuarios
for delete
to anon, authenticated
using (true);

create or replace view public.lojas_com_promotores
with (security_invoker = true)
as
select
  l.id as loja_id,
  l.codigo,
  l.nome as loja_nome,
  l.uf,
  l.cidade,
  max(case when lp.posicao = 1 then u.nome end) as promotor_1,
  max(case when lp.posicao = 2 then u.nome end) as promotor_2,
  max(case when lp.posicao = 3 then u.nome end) as promotor_3
from public.lojas l
left join public.loja_promotores lp on lp.loja_id = l.id
left join public.usuarios u on u.id = lp.promotor_id
group by l.id, l.codigo, l.nome, l.uf, l.cidade;

grant select on table public.lojas_com_promotores to anon, authenticated;
