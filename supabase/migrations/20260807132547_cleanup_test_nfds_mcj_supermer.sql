-- Remove os dados de teste das tres NFDs da loja MCJ SUPERMER.
--
-- A migration valida o estado esperado antes de apagar qualquer linha. As
-- notas importadas de nfd_itens/nfd_notas sao preservadas para que 3786 e
-- 3815 voltem ao status derivado de Atrasada.
do $migration$
declare
  v_loja_id uuid;
  v_avulsa_id uuid;
  v_finalizada_id uuid;
  v_count integer;
begin
  select l.id
  into v_loja_id
  from public.lojas as l
  where l.codigo::text = '24642'
    and l.nome = 'MCJ SUPERMER';

  if v_loja_id is null then
    raise exception 'Loja MCJ SUPERMER (24642) nao encontrada.';
  end if;

  if (
    select count(*)
    from public.lojas as l
    where l.codigo::text = '24642'
  ) <> 1 then
    raise exception 'Codigo de loja 24642 nao e univoco; limpeza abortada.';
  end if;

  select count(*)
  into v_count
  from public.fstd_processos as p
  where p.loja_id = v_loja_id
    and p.nfd_numero = '128397324';

  if v_count <> 1 then
    raise exception 'Esperada exatamente uma NFD avulsa 128397324; encontradas %.', v_count;
  end if;

  select p.id
  into v_avulsa_id
  from public.fstd_processos as p
  where p.loja_id = v_loja_id
    and p.nfd_numero = '128397324'
    and p.is_avulsa is true
    and p.status = 'em_andamento';

  if v_avulsa_id is null then
    raise exception 'A NFD avulsa 128397324 nao esta no estado esperado (em andamento).';
  end if;

  select count(*)
  into v_count
  from public.fstd_processos as p
  where p.loja_id = v_loja_id
    and p.nfd_numero = '3786';

  if v_count <> 1 then
    raise exception 'Esperada exatamente uma NFD 3786; encontradas %.', v_count;
  end if;

  select p.id
  into v_finalizada_id
  from public.fstd_processos as p
  where p.loja_id = v_loja_id
    and p.nfd_numero = '3786'
    and p.is_avulsa is false
    and p.status = 'concluida';

  if v_finalizada_id is null then
    raise exception 'A NFD 3786 nao esta no estado esperado (finalizada).';
  end if;

  select count(*)
  into v_count
  from public.fstd_processos as p
  where p.loja_id = v_loja_id
    and p.nfd_numero = '3815';

  if v_count <> 0 then
    raise exception 'A NFD desconhecida 3815 possui processo FSTD inesperado; limpeza abortada.';
  end if;

  select count(*)
  into v_count
  from public.nfd_desconhecimentos as nd
  where nd.loja_id = v_loja_id
    and nd.nfd_referencia = '24642:3815'
    and nd.nfd_numero = '3815'
    and nd.nfd_chave_acesso = '21260755167151000201550020000038151104569130';

  if v_count <> 1 then
    raise exception 'Esperada exatamente uma marcacao de desconhecida para a NFD 3815; encontradas %.', v_count;
  end if;

  if not exists (
    select 1
    from public.nfd_notas as n
    where n.codigo_cliente = 24642
      and n.nota_fiscal::text = '3786'
      and n.chave_acesso = '21260755167151000201550020000037861104548031'
  ) then
    raise exception 'NFD importada 3786 nao encontrada; nao e seguro restaurar Atrasada.';
  end if;

  if not exists (
    select 1
    from public.nfd_notas as n
    where n.codigo_cliente = 24642
      and n.nota_fiscal::text = '3815'
      and n.chave_acesso = '21260755167151000201550020000038151104569130'
  ) then
    raise exception 'NFD importada 3815 nao encontrada; nao e seguro restaurar Atrasada.';
  end if;

  -- Storage protege exclusoes diretas por padrao. Aqui os caminhos sao
  -- derivados exclusivamente dos dois processos de teste validados acima.
  set local storage.allow_delete_query = 'true';

  delete from storage.objects as so
  where (
      so.bucket_id = 'fstd-pdfs'
      and so.name in (
        select d.pdf_path
        from public.fstd_documentos as d
        where d.processo_id in (v_avulsa_id, v_finalizada_id)
          and d.pdf_path is not null
      )
    )
    or (
      so.bucket_id = 'fstd-fotos'
      and so.name in (
        select jsonb_array_elements_text(coalesce(fp.fotos, '[]'::jsonb))
        from public.fstd_produtos as fp
        where fp.processo_id in (v_avulsa_id, v_finalizada_id)
      )
    );

  -- A exclusao do processo remove em cascata produtos, motivos e documento.
  delete from public.fstd_processos
  where id in (v_avulsa_id, v_finalizada_id);

  -- Remove toda a informacao/historico da marcacao de desconhecida de teste.
  delete from public.nfd_desconhecimentos
  where loja_id = v_loja_id
    and nfd_referencia = '24642:3815'
    and nfd_numero = '3815'
    and nfd_chave_acesso = '21260755167151000201550020000038151104569130';

  if exists (
    select 1
    from public.fstd_processos as p
    where p.id in (v_avulsa_id, v_finalizada_id)
  ) then
    raise exception 'A limpeza dos processos FSTD nao foi concluida.';
  end if;

  if exists (
    select 1
    from public.nfd_desconhecimentos as nd
    where nd.loja_id = v_loja_id
      and nd.nfd_referencia = '24642:3815'
      and nd.nfd_numero = '3815'
      and nd.nfd_chave_acesso = '21260755167151000201550020000038151104569130'
  ) then
    raise exception 'A marcacao de desconhecida da NFD 3815 nao foi removida.';
  end if;
end
$migration$;
