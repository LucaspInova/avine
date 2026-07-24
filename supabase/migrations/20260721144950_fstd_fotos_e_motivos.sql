alter table public.fstd_produtos
  add column if not exists fotos jsonb not null default '[]'::jsonb;

comment on column public.fstd_produtos.fotos is
  'Caminhos dos arquivos de evidencia armazenados no bucket privado fstd-fotos.';

insert into storage.buckets (id, name, public)
values ('fstd-fotos', 'fstd-fotos', false)
on conflict (id) do update set public = false;

drop policy if exists "fstd_fotos_insert_own" on storage.objects;
create policy "fstd_fotos_insert_own"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'fstd-fotos'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

drop policy if exists "fstd_fotos_select_own" on storage.objects;
create policy "fstd_fotos_select_own"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'fstd-fotos'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

drop policy if exists "fstd_fotos_delete_own" on storage.objects;
create policy "fstd_fotos_delete_own"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'fstd-fotos'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

insert into public.motivos_devolucao (nome, ordem, ativo)
select seed.nome, seed.ordem, true
from (
  values
    ('Ovos Mofados', 60),
    ('Proximo ao Vencimento', 70),
    ('Falta de Produto', 80),
    ('Erro Carregamento CD', 90),
    ('Ovos Sujos', 100),
    ('Marca/Tipo Errada', 110),
    ('Avaria de Viagem', 120),
    ('Sem Data/Ilegivel', 130),
    ('Erro Carregamento AV11', 140)
) as seed(nome, ordem)
where not exists (
  select 1
  from public.motivos_devolucao as existing
  where lower(btrim(existing.nome)) = lower(btrim(seed.nome))
);

create or replace function public.concluir_fstd_produto(
  p_produto_id uuid,
  p_motivo_id uuid,
  p_quantidade_retorno integer,
  p_observacao text default null,
  p_fotos jsonb default '[]'::jsonb
)
returns public.fstd_produtos
language plpgsql
set search_path = public
as $$
declare
  v_promotor_id uuid;
  v_item public.fstd_produtos;
  v_total_faturado integer;
begin
  select u.id into v_promotor_id
  from public.usuarios as u
  where u.auth_user_id = (select auth.uid())
    and u.perfil = 'Promotor'
    and u.ativo is true
  limit 1;

  if v_promotor_id is null then
    raise exception 'Promotor ativo nao encontrado para o usuario autenticado.';
  end if;

  if not exists (
    select 1
    from public.motivos_devolucao as m
    where m.id = p_motivo_id and m.ativo is true
  ) then
    raise exception 'Motivo de devolucao invalido ou inativo.';
  end if;

  if jsonb_typeof(coalesce(p_fotos, '[]'::jsonb)) <> 'array' then
    raise exception 'As fotos devem ser enviadas como uma lista.';
  end if;

  select fp.* into v_item
  from public.fstd_produtos as fp
  join public.fstd_processos as p on p.id = fp.processo_id
  where fp.id = p_produto_id
    and p.promotor_id = v_promotor_id
    and p.status = 'em_andamento'
  for update;

  if v_item.id is null then
    raise exception 'Produto de FSTD nao encontrado ou ja finalizado.';
  end if;

  v_total_faturado := v_item.quantidade_faturada_galinha + v_item.quantidade_faturada_codorna;

  if coalesce(p_quantidade_retorno, 0) <= 0
    or coalesce(p_quantidade_retorno, 0) > v_total_faturado then
    raise exception 'A quantidade de retorno deve ser maior que zero e nao pode exceder o faturado.';
  end if;

  update public.fstd_produtos
  set
    motivo_id = p_motivo_id,
    quantidade_retorno = p_quantidade_retorno,
    observacao = nullif(btrim(p_observacao), ''),
    fotos = coalesce(p_fotos, '[]'::jsonb),
    status = 'concluido',
    concluido_em = now(),
    updated_at = now()
  where id = p_produto_id
  returning * into v_item;

  return v_item;
end;
$$;

revoke all on function public.concluir_fstd_produto(uuid, uuid, integer, text, jsonb) from public;
grant execute on function public.concluir_fstd_produto(uuid, uuid, integer, text, jsonb) to authenticated;

notify pgrst, 'reload schema';
