-- Remove o processo FSTD avulso de teste 6425252 da loja MERC KALILAN.
-- Também garante que a NFD 225709 não possua uma marcação ativa de
-- desconhecida. As notas importadas de nfd_notas são preservadas.
do $migration$
declare
  v_loja_id uuid;
  v_processo_id uuid;
  v_count integer;
begin
  select l.id
  into v_loja_id
  from public.lojas as l
  where l.codigo::text = '12730'
    and l.nome = 'MERC KALILAN';

  if v_loja_id is null then
    raise exception 'Loja MERC KALILAN (12730) não encontrada.';
  end if;

  if (
    select count(*)
    from public.lojas as l
    where l.codigo::text = '12730'
  ) <> 1 then
    raise exception 'Código de loja 12730 não é unívoco; limpeza abortada.';
  end if;

  select count(*)
  into v_count
  from public.fstd_processos as p
  where p.loja_id = v_loja_id
    and p.nfd_numero = '6425252'
    and p.nfd_chave_acesso = 'AVULSA:4e7024a933c55a6c970f7ce55092e1bd'
    and p.is_avulsa is true
    and p.status = 'em_andamento';

  if v_count > 1 then
    raise exception 'Mais de um processo corresponde à NFD avulsa 6425252; limpeza abortada.';
  end if;

  if v_count = 1 then
    select p.id
    into v_processo_id
    from public.fstd_processos as p
    where p.loja_id = v_loja_id
      and p.nfd_numero = '6425252'
      and p.nfd_chave_acesso = 'AVULSA:4e7024a933c55a6c970f7ce55092e1bd'
      and p.is_avulsa is true
      and p.status = 'em_andamento';
  end if;

  -- Os caminhos são derivados exclusivamente do processo de teste validado.
  set local storage.allow_delete_query = 'true';

  delete from storage.objects as so
  where (
      so.bucket_id = 'fstd-pdfs'
      and so.name in (
        select d.pdf_path
        from public.fstd_documentos as d
        where d.processo_id = v_processo_id
          and d.pdf_path is not null
      )
    )
    or (
      so.bucket_id = 'fstd-fotos'
      and so.name in (
        select jsonb_array_elements_text(coalesce(fp.fotos, '[]'::jsonb))
        from public.fstd_produtos as fp
        where fp.processo_id = v_processo_id
      )
    );

  delete from public.fstd_documentos
  where processo_id = v_processo_id;

  delete from public.fstd_produto_motivos
  where produto_id in (
    select fp.id
    from public.fstd_produtos as fp
    where fp.processo_id = v_processo_id
  );

  delete from public.fstd_produtos
  where processo_id = v_processo_id;

  delete from public.fstd_processos
  where id = v_processo_id;

  -- Idempotente: remove qualquer marcação residual da NFD importada 225709.
  delete from public.nfd_desconhecimentos
  where loja_id = v_loja_id
    and nfd_referencia = '12730:225709'
    and nfd_numero = '225709';

  if exists (
    select 1
    from public.fstd_processos as p
    where p.id = v_processo_id
  ) then
    raise exception 'O processo FSTD da NFD 6425252 não foi removido.';
  end if;

  if exists (
    select 1
    from public.fstd_produtos as fp
    where fp.processo_id = v_processo_id
  ) then
    raise exception 'Os produtos da NFD 6425252 não foram removidos.';
  end if;

  if exists (
    select 1
    from public.fstd_documentos as d
    where d.processo_id = v_processo_id
  ) then
    raise exception 'Os documentos da NFD 6425252 não foram removidos.';
  end if;

  if exists (
    select 1
    from public.nfd_desconhecimentos as nd
    where nd.loja_id = v_loja_id
      and nd.nfd_referencia = '12730:225709'
      and nd.nfd_numero = '225709'
      and nd.reconhecida_em is null
  ) then
    raise exception 'A marcação Desconhecida da NFD 225709 não foi removida.';
  end if;
end
$migration$;
