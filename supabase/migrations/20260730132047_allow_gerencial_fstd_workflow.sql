-- Allow an active Gerencial user to take ownership of an NFD and complete the
-- same FSTD workflow already used by Promotores. The existing validation,
-- photo ownership checks and RLS policies remain in place.
do $migration$
declare
  v_definition text;
begin
  select pg_get_functiondef('public.iniciar_fstd_produtos_v2(uuid, text)'::regprocedure)
  into v_definition;

  v_definition := replace(
    v_definition,
    $$and u.perfil = 'Promotor'$$,
    $$and u.perfil in ('Promotor', 'Gerencial')$$
  );
  v_definition := replace(
    v_definition,
    $old$
  select l.codigo
  into v_loja_codigo
  from public.lojas as l
  join public.loja_promotores as lp
    on lp.loja_id = l.id
   and lp.promotor_id = v_promotor_id
  where l.id = p_loja_id
  limit 1;
$old$,
    $new$
  select l.codigo
  into v_loja_codigo
  from public.lojas as l
  where l.id = p_loja_id
    and (
      public.is_current_user_gerencial_ativo()
      or exists (
        select 1
        from public.loja_promotores as lp
        where lp.loja_id = l.id
          and lp.promotor_id = v_promotor_id
      )
    )
  limit 1;
$new$
  );
  v_definition := replace(
    v_definition,
    $$raise exception 'Loja nao atribuida ao promotor autenticado.';$$,
    $$raise exception 'Loja nao encontrada ou sem acesso para o usuario autenticado.';$$
  );
  v_definition := replace(
    v_definition,
    $old$
  if v_processo.id is not null then
    if v_processo.promotor_id <> v_promotor_id
      or v_processo.loja_id <> p_loja_id then
      raise exception 'Esta NFD ja pertence a outro Promotor ou loja.';
    end if;

    return v_processo.id;
  end if;
$old$,
    $new$
  if v_processo.id is not null then
    if v_processo.promotor_id <> v_promotor_id
      or v_processo.loja_id <> p_loja_id then
      if public.is_current_user_gerencial_ativo()
        and v_processo.loja_id = p_loja_id then
        update public.fstd_processos
        set promotor_id = v_promotor_id,
            updated_at = now()
        where id = v_processo.id;
      else
        raise exception 'Esta NFD ja pertence a outro Promotor ou loja.';
      end if;
    end if;

    return v_processo.id;
  end if;
$new$
  );
  execute v_definition;

  select pg_get_functiondef('public.concluir_fstd_produto(uuid, jsonb, text, jsonb)'::regprocedure)
  into v_definition;
  v_definition := replace(
    v_definition,
    $$and u.perfil = 'Promotor'$$,
    $$and u.perfil in ('Promotor', 'Gerencial')$$
  );
  v_definition := replace(
    v_definition,
    $old$
    and p.promotor_id = v_promotor_id
    and p.status = 'em_andamento'
    and exists (
      select 1
      from public.loja_promotores as lp
      where lp.loja_id = p.loja_id
        and lp.promotor_id = v_promotor_id
    )
$old$,
    $new$
    and p.status = 'em_andamento'
    and (
      public.is_current_user_gerencial_ativo()
      or (
        p.promotor_id = v_promotor_id
        and exists (
          select 1
          from public.loja_promotores as lp
          where lp.loja_id = p.loja_id
            and lp.promotor_id = v_promotor_id
        )
      )
    )
$new$
  );
  execute v_definition;

  select pg_get_functiondef('public.editar_fstd_produto(uuid, jsonb, integer, integer, text, jsonb)'::regprocedure)
  into v_definition;
  v_definition := replace(
    v_definition,
    $$and u.perfil = 'Promotor'$$,
    $$and u.perfil in ('Promotor', 'Gerencial')$$
  );
  v_definition := replace(
    v_definition,
    $old$
    and p.promotor_id = v_promotor_id
    and p.status = 'em_andamento'
    and exists (
      select 1
      from public.loja_promotores as lp
      where lp.loja_id = p.loja_id
        and lp.promotor_id = v_promotor_id
    )
$old$,
    $new$
    and p.status = 'em_andamento'
    and (
      public.is_current_user_gerencial_ativo()
      or (
        p.promotor_id = v_promotor_id
        and exists (
          select 1
          from public.loja_promotores as lp
          where lp.loja_id = p.loja_id
            and lp.promotor_id = v_promotor_id
        )
      )
    )
$new$
  );
  execute v_definition;

  select pg_get_functiondef('public.finalizar_fstd_produtos(uuid)'::regprocedure)
  into v_definition;
  v_definition := replace(
    v_definition,
    $$and u.perfil = 'Promotor'$$,
    $$and u.perfil in ('Promotor', 'Gerencial')$$
  );
  v_definition := replace(
    v_definition,
    $old$
    and p.promotor_id = v_promotor_id
    and p.status = 'em_andamento'
    and exists (
      select 1
      from public.loja_promotores as lp
      where lp.loja_id = p.loja_id
        and lp.promotor_id = v_promotor_id
    )
$old$,
    $new$
    and p.status = 'em_andamento'
    and (
      public.is_current_user_gerencial_ativo()
      or (
        p.promotor_id = v_promotor_id
        and exists (
          select 1
          from public.loja_promotores as lp
          where lp.loja_id = p.loja_id
            and lp.promotor_id = v_promotor_id
        )
      )
    )
$new$
  );
  execute v_definition;
end
$migration$;
