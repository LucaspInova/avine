-- Reconcile source items whenever an existing FSTD is reopened. This keeps
-- processes created before (or during) an import consistent with nfd_itens
-- without overwriting work already recorded on existing product rows.
create or replace function public.iniciar_fstd_produtos_v2(
  p_loja_id uuid,
  p_nfd_chave_acesso text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_auth_user_id uuid := (select auth.uid());
  v_promotor_id uuid;
  v_loja_codigo text;
  v_chave_acesso text := nullif(btrim(p_nfd_chave_acesso), '');
  v_nfd_numero text;
  v_processo public.fstd_processos;
begin
  if v_auth_user_id is null then
    raise exception 'Sessao autenticada obrigatoria.';
  end if;

  select u.id
  into v_promotor_id
  from public.usuarios as u
  where u.auth_user_id = v_auth_user_id
    and u.perfil in ('Promotor', 'Gerencial', 'Admin')
    and u.ativo is true
    and u.acesso_habilitado is true
  limit 1;

  if v_promotor_id is null then
    raise exception 'Promotor com acesso ativo nao encontrado para o usuario autenticado.';
  end if;

  select l.codigo
  into v_loja_codigo
  from public.lojas as l
  where l.id = p_loja_id
    and (
      app_private.can_current_user_access_loja(l.id)
      or exists (
        select 1
        from public.loja_promotores as lp
        where lp.loja_id = l.id
          and lp.promotor_id = v_promotor_id
      )
    )
  limit 1;

  if v_loja_codigo is null then
    raise exception 'Loja nao encontrada ou sem acesso para o usuario autenticado.';
  end if;

  if v_chave_acesso is null then
    raise exception 'Chave de acesso da NFD obrigatoria.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_chave_acesso, 0)
  );

  select min(ni.nota_fiscal)::text
  into v_nfd_numero
  from public.nfd_itens as ni
  where ni.chave_acesso::text = v_chave_acesso
    and ni.codigo_cliente::text = v_loja_codigo;

  if v_nfd_numero is null then
    raise exception 'NFD nao encontrada para a loja informada.';
  end if;

  if exists (
    select 1
    from public.nfd_itens as ni
    where ni.chave_acesso::text = v_chave_acesso
      and ni.codigo_cliente::text <> v_loja_codigo
  ) then
    raise exception 'A NFD possui itens associados a outra loja.';
  end if;

  select p.*
  into v_processo
  from public.fstd_processos as p
  where p.nfd_chave_acesso = v_chave_acesso
    and p.status <> 'cancelada'
  for update;

  if v_processo.id is not null then
    if v_processo.promotor_id <> v_promotor_id
      or v_processo.loja_id <> p_loja_id then
      if app_private.can_current_user_access_loja(v_processo.loja_id) then
        update public.fstd_processos
        set promotor_id = v_promotor_id,
            updated_at = now()
        where id = v_processo.id;
      else
        raise exception 'Esta NFD ja pertence a outro Promotor ou loja.';
      end if;
    end if;
  else
    insert into public.fstd_processos (
      nfd_chave_acesso,
      nfd_numero,
      loja_id,
      promotor_id
    )
    values (
      v_chave_acesso,
      v_nfd_numero,
      p_loja_id,
      v_promotor_id
    )
    returning * into v_processo;
  end if;

  insert into public.fstd_produtos (
    processo_id,
    produto_id,
    codigo_produto,
    nome,
    descricao,
    imagem_url,
    quantidade_faturada_galinha,
    quantidade_faturada_codorna
  )
  select
    v_processo.id,
    catalog.produto_id,
    items.codigo_produto,
    coalesce(catalog.nome, items.descricao, items.codigo_produto),
    items.descricao,
    catalog.imagem_url,
    items.quantidade_galinha,
    items.quantidade_codorna
  from (
    select
      upper(btrim(ni.codigo_produto)) as codigo_produto,
      max(nullif(btrim(ni.descricao_produto), '')) as descricao,
      sum(greatest(coalesce(ni.quantidade_galinha, 0), 0))::integer as quantidade_galinha,
      sum(greatest(coalesce(ni.quantidade_codorna, 0), 0))::integer as quantidade_codorna
    from public.nfd_itens as ni
    where ni.chave_acesso::text = v_chave_acesso
      and ni.codigo_cliente::text = v_loja_codigo
      and nullif(btrim(ni.codigo_produto), '') is not null
    group by upper(btrim(ni.codigo_produto))
  ) as items
  left join public.produtos_expandidos as catalog
    on catalog.codigo_produto = items.codigo_produto
  on conflict (processo_id, codigo_produto) do nothing;

  if not exists (
    select 1
    from public.fstd_produtos as fp
    where fp.processo_id = v_processo.id
  ) then
    raise exception 'Nenhum produto valido foi encontrado para esta NFD.';
  end if;

  return v_processo.id;
end;
$function$;

revoke all on function public.iniciar_fstd_produtos_v2(uuid, text) from public, anon;
grant execute on function public.iniciar_fstd_produtos_v2(uuid, text) to authenticated;

-- Rollback: create a forward-only migration restoring the previous function
-- body from 20260724034407_stabilize_security_integrity.sql plus the access
-- changes introduced by the Gerencial/Admin migrations.
