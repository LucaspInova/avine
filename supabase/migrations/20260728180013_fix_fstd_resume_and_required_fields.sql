-- Keep the workflow entry point safe when an unfinished process is resumed.
-- The browser must never need INSERT privileges on the workflow tables.
alter function public.iniciar_fstd_produtos_v2(uuid, text) security definer;
alter function public.iniciar_fstd_produtos_v2(uuid, text) set search_path = '';
alter function public.concluir_fstd_produto(uuid, jsonb, text, jsonb) security definer;
alter function public.concluir_fstd_produto(uuid, jsonb, text, jsonb) set search_path = '';
alter function public.editar_fstd_produto(uuid, jsonb, integer, integer, text, jsonb) security definer;
alter function public.editar_fstd_produto(uuid, jsonb, integer, integer, text, jsonb) set search_path = '';
alter function public.concluir_fstd_produto_avulso(uuid, jsonb, integer, integer, text, jsonb) security definer;
alter function public.concluir_fstd_produto_avulso(uuid, jsonb, integer, integer, text, jsonb) set search_path = '';

-- The PDF is created with INSERT on the first generation and only replaced
-- with UPDATE when a document already has a stored path. Keep the bucket
-- policy explicit so the authenticated owner can create that first object.
drop policy if exists fstd_pdfs_insert_authorized on storage.objects;
create policy fstd_pdfs_insert_authorized
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'fstd-pdfs'
  and (
    (select app_private.is_current_user_gerencial_ativo())
    or (
      name ~ ('^' || (select auth.uid())::text || '/[0-9a-fA-F-]{36}/[0-9]{6,7}[.]pdf$')
      and exists (
        select 1
        from public.fstd_processos p
        join public.usuarios u on u.id = p.promotor_id
        where p.id = split_part(storage.objects.name, '/', 2)::uuid
          and p.status = 'concluida'
          and u.auth_user_id = (select auth.uid())
          and u.ativo is true
      )
    )
  )
);

grant insert, select, update on table storage.objects to authenticated;

-- Enforce the same required-field contract at the database boundary. A typed
-- zero remains valid; only a missing/null return is rejected.
do $migration$
declare
  v_signature regprocedure;
  v_definition text;
  v_fixed_definition text;
  v_required_block text := $required$
  if jsonb_array_length(coalesce(p_fotos, '[]'::jsonb)) = 0 then
    raise exception 'Ao menos uma foto e obrigatoria para concluir o FSTD.';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_divisoes) as division(
      motivo_id uuid,
      quantidade_faturada integer,
      quantidade_retorno integer,
      quantidade integer
    )
    where division.motivo_id is null
      or division.quantidade_faturada is null
      or division.quantidade_retorno is null
  ) then
    raise exception 'Motivo, faturado e retorno sao obrigatorios em todos os campos.';
  end if;

$required$;
begin
  foreach v_signature in array array[
    'public.concluir_fstd_produto(uuid,jsonb,text,jsonb)'::regprocedure,
    'public.editar_fstd_produto(uuid,jsonb,integer,integer,text,jsonb)'::regprocedure
  ]
  loop
    select pg_get_functiondef(v_signature) into v_definition;

    if position(v_required_block in v_definition) > 0 then
      continue;
    end if;

    v_fixed_definition := replace(
      v_definition,
      E'  if jsonb_typeof(coalesce(p_fotos, ''[]''::jsonb)) <> ''array'' then\n    raise exception ''As fotos devem ser enviadas como uma lista.'';\n  end if;\n',
      E'  if jsonb_typeof(coalesce(p_fotos, ''[]''::jsonb)) <> ''array'' then\n    raise exception ''As fotos devem ser enviadas como uma lista.'';\n  end if;\n\n' || v_required_block
    );

    if v_fixed_definition = v_definition then
      raise exception 'Nao foi possivel atualizar a validacao do workflow %.', v_signature;
    end if;

    execute v_fixed_definition;
  end loop;
end
$migration$;

notify pgrst, 'reload schema';
