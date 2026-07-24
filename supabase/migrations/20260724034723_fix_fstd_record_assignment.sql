-- Postgres composite variables must receive the expanded row when they are
-- populated alongside joins. Keep this migration idempotent for fresh
-- environments where the canonical migration already contains the correction.
do $migration$
declare
  v_signature regprocedure;
  v_definition text;
  v_fixed_definition text;
begin
  foreach v_signature in array array[
    'public.concluir_fstd_produto(uuid,jsonb,text,jsonb)'::regprocedure,
    'public.editar_fstd_produto(uuid,jsonb,integer,integer,text,jsonb)'::regprocedure
  ]
  loop
    select pg_get_functiondef(v_signature)
    into v_definition;

    if position(E'select fp.*\n  into v_item' in v_definition) > 0 then
      continue;
    end if;

    v_fixed_definition := replace(
      v_definition,
      E'select fp\n  into v_item',
      E'select fp.*\n  into v_item'
    );

    if v_fixed_definition = v_definition then
      raise exception 'Unexpected function body for %.', v_signature;
    end if;

    execute v_fixed_definition;
  end loop;
end
$migration$;
