-- Lote 5: cadastros derivados das importacoes e gestao humana do catalogo.

create table if not exists public.loja_import_alertas (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid references public.lojas(id) on delete cascade,
  codigo text not null,
  tipo text not null check (tipo in ('dados_divergentes', 'possivel_troca_codigo')),
  nome_importado text not null,
  uf_importada text not null,
  cidade_importada text not null,
  fonte text not null check (fonte in ('api', 'sheets', 'historico')),
  ocorrencias integer not null default 1 check (ocorrencias > 0),
  primeira_ocorrencia_em timestamptz not null default now(),
  ultima_ocorrencia_em timestamptz not null default now(),
  status text not null default 'pendente' check (status in ('pendente', 'resolvido', 'ignorado')),
  unique (codigo, tipo, nome_importado, uf_importada, cidade_importada)
);

comment on table public.loja_import_alertas is
  'Divergencias cadastrais detectadas pelos importadores sem sobrescrever automaticamente a loja canonica.';

alter table public.loja_import_alertas enable row level security;
drop policy if exists loja_import_alertas_admin_select on public.loja_import_alertas;
create policy loja_import_alertas_admin_select
on public.loja_import_alertas for select to authenticated
using ((select app_private.is_current_user_admin_ativo()));

revoke all on table public.loja_import_alertas from public, anon, authenticated;
grant select on table public.loja_import_alertas to authenticated;
grant all on table public.loja_import_alertas to service_role;

create or replace function public.sincronizar_lojas_importadas(
  p_lojas jsonb,
  p_fonte text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_item jsonb;
  v_codigo text;
  v_nome text;
  v_uf text;
  v_cidade text;
  v_loja public.lojas;
  v_similar public.lojas;
  v_inseridas integer := 0;
  v_inalteradas integer := 0;
  v_divergentes integer := 0;
  v_invalidas integer := 0;
begin
  if p_fonte not in ('api', 'sheets', 'historico') then
    raise exception 'Fonte de importacao invalida.' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_lojas, '[]'::jsonb)) <> 'array' then
    raise exception 'Lojas devem ser enviadas em uma lista.' using errcode = '22023';
  end if;

  for v_item in select value from jsonb_array_elements(coalesce(p_lojas, '[]'::jsonb)) loop
    v_codigo := nullif(btrim(v_item->>'codigo'), '');
    v_nome := nullif(btrim(v_item->>'nome'), '');
    v_uf := upper(nullif(btrim(v_item->>'uf'), ''));
    v_cidade := nullif(btrim(v_item->>'cidade'), '');

    if v_codigo is null or v_nome is null or v_uf is null or v_cidade is null
      or v_uf not in ('CE','MA','BA','PA','PB','PI','PE','AP','SE','RN','AL','TO') then
      v_invalidas := v_invalidas + 1;
      continue;
    end if;

    perform pg_advisory_xact_lock(pg_catalog.hashtextextended('loja:' || v_codigo, 0));
    select l.* into v_loja from public.lojas l where l.codigo = v_codigo limit 1;

    if v_loja.id is not null then
      if upper(btrim(v_loja.nome)) = upper(btrim(v_nome))
        and v_loja.uf = v_uf
        and upper(btrim(v_loja.cidade)) = upper(btrim(v_cidade)) then
        v_inalteradas := v_inalteradas + 1;
      else
        insert into public.loja_import_alertas (
          loja_id, codigo, tipo, nome_importado, uf_importada, cidade_importada, fonte
        ) values (
          v_loja.id, v_codigo, 'dados_divergentes', v_nome, v_uf, v_cidade, p_fonte
        )
        on conflict (codigo, tipo, nome_importado, uf_importada, cidade_importada)
        do update set
          ocorrencias = public.loja_import_alertas.ocorrencias + 1,
          ultima_ocorrencia_em = now(),
          fonte = excluded.fonte,
          status = case when public.loja_import_alertas.status = 'resolvido' then 'pendente' else public.loja_import_alertas.status end;
        v_divergentes := v_divergentes + 1;
      end if;
      continue;
    end if;

    select l.* into v_similar
    from public.lojas l
    where upper(btrim(l.nome)) = upper(btrim(v_nome))
      and l.uf = v_uf
      and upper(btrim(l.cidade)) = upper(btrim(v_cidade))
      and l.codigo <> v_codigo
    order by l.created_at nulls last, l.id
    limit 1;

    insert into public.lojas (codigo, nome, uf, cidade)
    values (v_codigo, v_nome, v_uf, v_cidade)
    on conflict (codigo) do nothing
    returning * into v_loja;

    if v_loja.id is null then
      v_inalteradas := v_inalteradas + 1;
      continue;
    end if;

    v_inseridas := v_inseridas + 1;
    if v_similar.id is not null then
      insert into public.loja_import_alertas (
        loja_id, codigo, tipo, nome_importado, uf_importada, cidade_importada, fonte
      ) values (
        v_similar.id, v_codigo, 'possivel_troca_codigo', v_nome, v_uf, v_cidade, p_fonte
      )
      on conflict (codigo, tipo, nome_importado, uf_importada, cidade_importada)
      do update set
        ocorrencias = public.loja_import_alertas.ocorrencias + 1,
        ultima_ocorrencia_em = now(),
        fonte = excluded.fonte;
    end if;
  end loop;

  return jsonb_build_object(
    'inseridas', v_inseridas,
    'inalteradas', v_inalteradas,
    'divergentes', v_divergentes,
    'invalidas', v_invalidas
  );
end;
$function$;

revoke all on function public.sincronizar_lojas_importadas(jsonb, text) from public, anon, authenticated;
grant execute on function public.sincronizar_lojas_importadas(jsonb, text) to service_role;

-- Reconcilia lacunas historicas somente quando todos os campos obrigatorios
-- possuem um valor valido. Cadastros existentes nunca sao atualizados aqui.
with candidatas as (
  select distinct on (ni.codigo_cliente::text)
    ni.codigo_cliente::text as codigo,
    btrim(ni.nome_abreviado) as nome,
    upper(btrim(ni.uf)) as uf,
    btrim(ni.cidade) as cidade
  from public.nfd_itens ni
  where ni.codigo_cliente is not null
    and nullif(btrim(ni.nome_abreviado), '') is not null
    and upper(btrim(ni.uf)) in ('CE','MA','BA','PA','PB','PI','PE','AP','SE','RN','AL','TO')
    and nullif(btrim(ni.cidade), '') is not null
  order by ni.codigo_cliente::text, ni.atualizado_em desc nulls last, ni.id desc
)
insert into public.lojas (codigo, nome, uf, cidade)
select c.codigo, c.nome, c.uf, c.cidade
from candidatas c
on conflict (codigo) do nothing;

create table if not exists public.produto_catalogo_auditoria (
  id bigint generated by default as identity primary key,
  produto_id uuid,
  acao text not null check (acao in ('criado', 'alterado')),
  dados_anteriores jsonb,
  dados_novos jsonb not null,
  usuario_id uuid references public.usuarios(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.produto_catalogo_auditoria enable row level security;
drop policy if exists produto_catalogo_auditoria_management_select on public.produto_catalogo_auditoria;
create policy produto_catalogo_auditoria_management_select
on public.produto_catalogo_auditoria for select to authenticated
using ((select app_private.is_current_user_gerencial_ativo()));

revoke all on table public.produto_catalogo_auditoria from public, anon, authenticated;
grant select on table public.produto_catalogo_auditoria to authenticated;
grant all on table public.produto_catalogo_auditoria to service_role;

create or replace function app_private.validar_codigos_produto_unicos()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_codigos text[];
  v_codigo text;
  v_conflito public.produtos;
begin
  select coalesce(array_agg(distinct upper(btrim(codigo)) order by upper(btrim(codigo))), '{}'::text[])
  into v_codigos
  from regexp_split_to_table(coalesce(new.codigos_vinculados, ''), '\s*;\s*') codigo
  where nullif(btrim(codigo), '') is not null;

  if cardinality(v_codigos) = 0 then
    raise exception 'Informe ao menos um codigo vinculado ao produto.' using errcode = '23514';
  end if;

  foreach v_codigo in array v_codigos loop
    perform pg_advisory_xact_lock(pg_catalog.hashtextextended('produto_codigo:' || v_codigo, 0));
  end loop;

  select p.* into v_conflito
  from public.produtos p
  cross join lateral regexp_split_to_table(coalesce(p.codigos_vinculados, ''), '\s*;\s*') codigo
  where p.id <> new.id
    and upper(btrim(codigo)) = any(v_codigos)
  order by p.id
  limit 1;

  if v_conflito.id is not null then
    raise exception 'Um codigo informado ja pertence ao produto %.', coalesce(v_conflito.nome, v_conflito.id::text)
      using errcode = '23505';
  end if;

  new.codigos_vinculados := array_to_string(v_codigos, ';');
  return new;
end;
$function$;

drop trigger if exists produtos_validar_codigos_unicos on public.produtos;
create trigger produtos_validar_codigos_unicos
before insert or update of codigos_vinculados on public.produtos
for each row execute function app_private.validar_codigos_produto_unicos();

create or replace function app_private.auditar_produto_catalogo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  insert into public.produto_catalogo_auditoria (
    produto_id, acao, dados_anteriores, dados_novos, usuario_id
  ) values (
    new.id,
    case when tg_op = 'INSERT' then 'criado' else 'alterado' end,
    case when tg_op = 'UPDATE' then to_jsonb(old) else null end,
    to_jsonb(new),
    app_private.current_usuario_id()
  );
  return new;
end;
$function$;

drop trigger if exists produtos_auditar_catalogo on public.produtos;
create trigger produtos_auditar_catalogo
after insert or update on public.produtos
for each row execute function app_private.auditar_produto_catalogo();

create or replace function public.salvar_produto_catalogo(
  p_produto_id uuid,
  p_nome text,
  p_codigos text[],
  p_ovos_und bigint,
  p_categoria text,
  p_imagem_url text default null,
  p_status boolean default true
)
returns public.produtos
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_produto public.produtos;
  v_nome text := nullif(btrim(p_nome), '');
  v_categoria text := nullif(btrim(p_categoria), '');
  v_codigos text[];
begin
  if not app_private.is_current_user_gerencial_ativo() then
    raise exception 'Somente Gerencial ou Admin pode administrar produtos.' using errcode = '42501';
  end if;
  if v_nome is null or v_categoria is null or coalesce(p_ovos_und, 0) <= 0 then
    raise exception 'Nome, categoria e quantidade de ovos sao obrigatorios.' using errcode = '23514';
  end if;

  select coalesce(array_agg(distinct upper(btrim(codigo)) order by upper(btrim(codigo))), '{}'::text[])
  into v_codigos
  from unnest(coalesce(p_codigos, '{}'::text[])) codigo
  where nullif(btrim(codigo), '') is not null;
  if cardinality(v_codigos) = 0 then
    raise exception 'Informe ao menos um codigo vinculado ao produto.' using errcode = '23514';
  end if;

  if p_produto_id is null then
    insert into public.produtos (status, nome, codigos_vinculados, ovos_und, categoria, imagem_url)
    values (coalesce(p_status, true), v_nome, array_to_string(v_codigos, ';'), p_ovos_und, v_categoria, nullif(btrim(p_imagem_url), ''))
    returning * into v_produto;
  else
    update public.produtos p
    set status = coalesce(p_status, p.status),
        nome = v_nome,
        codigos_vinculados = array_to_string(v_codigos, ';'),
        ovos_und = p_ovos_und,
        categoria = v_categoria,
        imagem_url = nullif(btrim(p_imagem_url), '')
    where p.id = p_produto_id
    returning * into v_produto;
    if v_produto.id is null then
      raise exception 'Produto nao encontrado.' using errcode = 'P0002';
    end if;
  end if;

  return v_produto;
end;
$function$;

revoke all on function public.salvar_produto_catalogo(uuid, text, text[], bigint, text, text, boolean) from public, anon;
grant execute on function public.salvar_produto_catalogo(uuid, text, text[], bigint, text, text, boolean) to authenticated, service_role;

create or replace function public.vincular_codigo_produto(
  p_produto_id uuid,
  p_codigo text
)
returns public.produtos
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_produto public.produtos;
  v_codigo text := upper(nullif(btrim(p_codigo), ''));
begin
  if not app_private.is_current_user_gerencial_ativo() then
    raise exception 'Somente Gerencial ou Admin pode administrar produtos.' using errcode = '42501';
  end if;
  if v_codigo is null then
    raise exception 'Codigo do produto obrigatorio.' using errcode = '23514';
  end if;

  perform pg_advisory_xact_lock(pg_catalog.hashtextextended('produto_codigo:' || v_codigo, 0));
  select p.* into v_produto from public.produtos p where p.id = p_produto_id for update;
  if v_produto.id is null then
    raise exception 'Produto nao encontrado.' using errcode = 'P0002';
  end if;

  update public.produtos p
  set codigos_vinculados = concat_ws(';', nullif(p.codigos_vinculados, ''), v_codigo)
  where p.id = p_produto_id
  returning * into v_produto;
  return v_produto;
end;
$function$;

revoke all on function public.vincular_codigo_produto(uuid, text) from public, anon;
grant execute on function public.vincular_codigo_produto(uuid, text) to authenticated, service_role;

create or replace view public.produtos_pendentes
with (security_invoker = true)
as
with pendentes as (
  select
    upper(btrim(ni.codigo_produto)) as codigo_produto,
    (array_agg(nullif(btrim(ni.descricao_produto), '') order by ni.atualizado_em desc nulls last, ni.id desc))[1] as descricao_produto,
    count(*)::bigint as itens_count,
    count(distinct ni.chave_acesso)::bigint as notas_count,
    max(ni.data_referencia) as ultima_data,
    sum(coalesce(ni.quantidade_galinha, 0))::bigint as quantidade_galinha,
    sum(coalesce(ni.quantidade_codorna, 0))::bigint as quantidade_codorna
  from public.nfd_itens ni
  where nullif(btrim(ni.codigo_produto), '') is not null
    and not exists (
      select 1 from public.produtos_expandidos pe
      where pe.codigo_produto = upper(btrim(ni.codigo_produto))
    )
  group by upper(btrim(ni.codigo_produto))
)
select
  pendentes.*,
  sugestao.produto_id as produto_sugerido_id,
  sugestao.nome as produto_sugerido_nome,
  sugestao.similaridade
from pendentes
left join lateral (
  select p.id as produto_id, p.nome,
    extensions.similarity(upper(coalesce(p.nome, '')), upper(coalesce(pendentes.descricao_produto, '')))::numeric(5,4) as similaridade
  from public.produtos p
  where p.status is true and nullif(btrim(p.nome), '') is not null
  order by extensions.similarity(upper(p.nome), upper(coalesce(pendentes.descricao_produto, ''))) desc, p.nome, p.id
  limit 1
) sugestao on true;

comment on view public.produtos_pendentes is
  'Codigos fiscais ainda nao classificados; a sugestao por nome nunca cria vinculo automaticamente.';

grant select on public.produtos_pendentes to authenticated, service_role;

-- Resolve os dois codigos confirmados durante o diagnostico. As clausulas de
-- existencia tornam esta carga segura para reexecucao e para bases onde a
-- classificacao ja tenha sido feita manualmente.
update public.produtos p
set codigos_vinculados = concat_ws(';', nullif(p.codigos_vinculados, ''), '10PA01.017EX23')
where upper(btrim(p.nome)) = 'EB C/30'
  and not exists (
    select 1 from public.produtos_expandidos pe
    where pe.codigo_produto = '10PA01.017EX23'
  );

insert into public.produtos (
  status, nome, codigos_vinculados, ovos_und, categoria, imagem_url, class_ia, color_ia
)
select true, 'GB C/15', '10PA01.014GD02', 15, 'Grande', null, null, null
where not exists (
  select 1 from public.produtos_expandidos pe
  where pe.codigo_produto = '10PA01.014GD02'
)
and not exists (
  select 1 from public.produtos p where upper(btrim(p.nome)) = 'GB C/15'
);

update public.produtos p
set codigos_vinculados = concat_ws(';', nullif(p.codigos_vinculados, ''), '10PA01.014GD02')
where upper(btrim(p.nome)) = 'GB C/15'
  and not exists (
    select 1 from public.produtos_expandidos pe
    where pe.codigo_produto = '10PA01.014GD02'
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp']::text[])
on conflict (id) do update set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists product_images_management_insert on storage.objects;
drop policy if exists product_images_management_update on storage.objects;
drop policy if exists product_images_management_delete on storage.objects;

create policy product_images_management_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'product-images'
  and (select app_private.is_current_user_gerencial_ativo())
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy product_images_management_update
on storage.objects for update to authenticated
using (bucket_id = 'product-images' and (select app_private.is_current_user_gerencial_ativo()))
with check (bucket_id = 'product-images' and (select app_private.is_current_user_gerencial_ativo()));

create policy product_images_management_delete
on storage.objects for delete to authenticated
using (bucket_id = 'product-images' and (select app_private.is_current_user_gerencial_ativo()));

notify pgrst, 'reload schema';
