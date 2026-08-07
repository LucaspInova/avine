-- Remove os dados de teste das NFDs 225879 e 225709 da loja MERC KALILAN.
--
-- A migration valida o estado esperado antes de apagar qualquer linha. As
-- notas importadas de nfd_itens/nfd_notas sao preservadas para que ambas
-- voltem ao status derivado de Atrasada.
do $migration$
declare
  v_loja_id uuid;
  v_finalizada_id uuid;
  v_count integer;
begin
  select l.id
  into v_loja_id
  from public.lojas as l
  where l.codigo::text = '12730'
    and l.nome = 'MERC KALILAN';

  if v_loja_id is null then
    raise exception 'Loja MERC KALILAN (12730) nao encontrada.';
  end if;

  if (
    select count(*)
    from public.lojas as l
    where l.codigo::text = '12730'
  ) <> 1 then
    raise exception 'Codigo de loja 12730 nao e univoco; limpeza abortada.';
  end if;

  select count(*)
  into v_count
  from public.fstd_processos as p
  where p.loja_id = v_loja_id
    and p.nfd_numero = '225879';

  if v_count <> 1 then
    raise exception 'Esperado exatamente um processo FSTD para a NFD 225879; encontrados %.', v_count;
  end if;

  select p.id
  into v_finalizada_id
  from public.fstd_processos as p
  where p.loja_id = v_loja_id
    and p.nfd_numero = '225879'
    and p.nfd_chave_acesso = '29260709182947000216550010002258791739324635'
    and p.is_avulsa is false
    and p.status = 'concluida';

  if v_finalizada_id is null then
    raise exception 'A NFD 225879 nao esta no estado esperado (Finalizada).';
  end if;

  select count(*)
  into v_count
  from public.fstd_processos as p
  where p.loja_id = v_loja_id
    and p.nfd_numero = '225709';

  if v_count <> 0 then
    raise exception 'A NFD Desconhecida 225709 possui processo FSTD inesperado.';
  end if;

  select count(*)
  into v_count
  from public.nfd_desconhecimentos as nd
  where nd.loja_id = v_loja_id
    and nd.nfd_referencia = '12730:225709'
    and nd.nfd_chave_acesso = '29260709182947000216550010002257091359534379'
    and nd.nfd_numero = '225709';

  if v_count <> 1 then
    raise exception 'Esperada exatamente uma marcacao de desconhecida para a NFD 225709; encontradas %.', v_count;
  end if;

  if not exists (
    select 1
    from public.nfd_notas as n
    where n.codigo_cliente = 12730
      and n.nota_fiscal = 225879
      and n.chave_acesso = '29260709182947000216550010002258791739324635'
  ) then
    raise exception 'NFD importada 225879 nao encontrada; nao e seguro restaurar Atrasada.';
  end if;

  if not exists (
    select 1
    from public.nfd_notas as n
    where n.codigo_cliente = 12730
      and n.nota_fiscal = 225709
      and n.chave_acesso = '29260709182947000216550010002257091359534379'
  ) then
    raise exception 'NFD importada 225709 nao encontrada; nao e seguro restaurar Atrasada.';
  end if;

  -- Os caminhos sao derivados exclusivamente do processo de teste validado.
  set local storage.allow_delete_query = 'true';

  delete from storage.objects as so
  where (
      so.bucket_id = 'fstd-pdfs'
      and so.name in (
        select d.pdf_path
        from public.fstd_documentos as d
        where d.processo_id = v_finalizada_id
          and d.pdf_path is not null
      )
    )
    or (
      so.bucket_id = 'fstd-fotos'
      and so.name in (
        select jsonb_array_elements_text(coalesce(fp.fotos, '[]'::jsonb))
        from public.fstd_produtos as fp
        where fp.processo_id = v_finalizada_id
      )
    );

  -- Remove em cascata produtos, motivos e documento da NFD Finalizada.
  delete from public.fstd_processos
  where id = v_finalizada_id;

  -- Remove toda a informacao/historico da marcacao Desconhecida.
  delete from public.nfd_desconhecimentos
  where loja_id = v_loja_id
    and nfd_referencia = '12730:225709'
    and nfd_chave_acesso = '29260709182947000216550010002257091359534379'
    and nfd_numero = '225709';

  if exists (
    select 1
    from public.fstd_processos as p
    where p.id = v_finalizada_id
  ) then
    raise exception 'A limpeza da NFD 225879 nao foi concluida.';
  end if;

  if exists (
    select 1
    from public.nfd_desconhecimentos as nd
    where nd.loja_id = v_loja_id
      and nd.nfd_referencia = '12730:225709'
      and nd.nfd_chave_acesso = '29260709182947000216550010002257091359534379'
      and nd.nfd_numero = '225709'
  ) then
    raise exception 'A marcacao da NFD 225709 nao foi removida.';
  end if;
end
$migration$;
