begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(17);

select has_function('app_private', 'conferir_fstd_avulsa', array['uuid'], 'conferencia individual existe no schema privado');
select has_function('public', 'reabrir_fstd_avulsa_revisao', array['uuid'], 'Promotor possui RPC controlada de revisao');
select has_trigger('public', 'fstd_processos', 'fstd_avulsa_conferir_ao_finalizar', 'finalizacao dispara conferencia da avulsa');

insert into public.nfd_itens (
  estabelecimento, nota_fiscal, chave_acesso, data_emissao, valor,
  quantidade_galinha, valor_galinha, quantidade_codorna, valor_codorna,
  codigo_cliente, nome_abreviado, uf, cidade, codigo_produto,
  descricao_produto, data_referencia
)
values
  ('TESTE CONCILIACAO', 992001, 'HOM-CONC-CE-992001', '2026-09-05', 60, 6, 60, 0, 0, 900001, 'LOJA TESTE FORTALEZA', 'CE', 'FORTALEZA', 'TESTE-OVO-30-ALIAS', 'OVOS BRANCOS ALIAS', '2026-09-05'),
  ('TESTE CONCILIACAO', 992001, 'HOM-CONC-BA-992001', '2026-09-05', 70, 7, 70, 0, 0, 900003, 'LOJA TESTE SALVADOR', 'BA', 'SALVADOR', 'TESTE-OVO-30-ALIAS', 'OVOS BRANCOS ALIAS', '2026-09-05');

insert into public.fstd_processos (
  id, nfd_chave_acesso, nfd_numero, loja_id, promotor_id, criado_por,
  atualizado_por, status, is_avulsa, conferencia_status, finalizada_em
)
values
  ('60000000-0000-4000-8000-000000000020', 'AVULSA:CONC:CE', '992001', '30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000004', 'concluida', true, 'pendente', now()),
  ('60000000-0000-4000-8000-000000000021', 'AVULSA:CONC:SEM-LOJA', '992001', '30000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000004', 'concluida', true, 'pendente', now()),
  ('60000000-0000-4000-8000-000000000022', 'AVULSA:CONC:BA', '992001', '30000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000004', 'concluida', true, 'pendente', now());

insert into public.fstd_produtos (
  id, processo_id, produto_id, codigo_produto, nome,
  quantidade_faturada_galinha, quantidade_faturada_codorna,
  quantidade_retorno, status, fotos
)
values
  ('61000000-0000-4000-8000-000000000020', '60000000-0000-4000-8000-000000000020', '40000000-0000-4000-8000-000000000001', 'TESTE-OVO-30', 'OVOS BRANCOS', 5, 0, 1, 'concluido', '[]'),
  ('61000000-0000-4000-8000-000000000021', '60000000-0000-4000-8000-000000000021', '40000000-0000-4000-8000-000000000001', 'TESTE-OVO-30', 'OVOS BRANCOS', 6, 0, 1, 'concluido', '[]'),
  ('61000000-0000-4000-8000-000000000022', '60000000-0000-4000-8000-000000000022', '40000000-0000-4000-8000-000000000001', 'TESTE-OVO-30', 'OVOS BRANCOS', 7, 0, 1, 'concluido', '[]');

insert into public.fstd_documentos (
  id, processo_id, pdf_path, conteudo_versao, versao_publicada, pdf_status
)
values (
  '62000000-0000-4000-8000-000000000020',
  '60000000-0000-4000-8000-000000000020',
  'teste/fstd-avulsa-v1.pdf',
  1,
  1,
  'disponivel'
);

select is(
  app_private.conferir_fstd_avulsa('60000000-0000-4000-8000-000000000020'),
  'revisao_pendente',
  'quantidade diferente envia a mesma FSTD para revisao'
);
select is(
  (select api_nfd_chave_acesso from public.fstd_processos where id = '60000000-0000-4000-8000-000000000020'),
  'HOM-CONC-CE-992001',
  'numero homonimo e conciliado somente com a mesma loja'
);
select is(
  jsonb_array_length((select conferencia_detalhes->'produtos' from public.fstd_processos where id = '60000000-0000-4000-8000-000000000020')),
  1,
  'detalhes guardam a comparacao por produto'
);
select is(
  (select conferencia_detalhes->'produtos'->0->>'tipo' from public.fstd_processos where id = '60000000-0000-4000-8000-000000000020'),
  'quantidade_divergente',
  'detalhe identifica a natureza da divergencia'
);
select is(
  app_private.conferir_fstd_avulsa('60000000-0000-4000-8000-000000000021'),
  'pendente',
  'mesmo numero em outra loja nao produz conciliacao'
);
select is(
  (select api_nfd_chave_acesso from public.fstd_processos where id = '60000000-0000-4000-8000-000000000021'),
  null,
  'avulsa sem par exato permanece sem chave importada'
);
select is(
  app_private.conferir_fstd_avulsa('60000000-0000-4000-8000-000000000022'),
  'conferida',
  'alias do mesmo produto concilia quando a quantidade confere'
);

set local role authenticated;
set local request.jwt.claim.sub = '20000000-0000-4000-8000-000000000005';
set local request.jwt.claims = '{"sub":"20000000-0000-4000-8000-000000000005","app_metadata":{"role":"promotor"}}';

select throws_ok(
  $$select public.reabrir_fstd_avulsa_revisao('60000000-0000-4000-8000-000000000020')$$,
  '42501',
  'FSTD avulsa em revisao nao encontrada ou sem permissao.',
  'outro Promotor nao reabre a FSTD do autor'
);

set local request.jwt.claim.sub = '20000000-0000-4000-8000-000000000004';
set local request.jwt.claims = '{"sub":"20000000-0000-4000-8000-000000000004","app_metadata":{"role":"promotor"}}';

select results_eq(
  $$select id, status from public.reabrir_fstd_avulsa_revisao('60000000-0000-4000-8000-000000000020')$$,
  $$values ('60000000-0000-4000-8000-000000000020'::uuid, 'em_andamento'::text)$$,
  'autor reabre o mesmo processo sem criar outra FSTD'
);
select results_eq(
  $$select criado_por, atualizado_por from public.fstd_processos where id = '60000000-0000-4000-8000-000000000020'$$,
  $$values ('10000000-0000-4000-8000-000000000004'::uuid, '10000000-0000-4000-8000-000000000004'::uuid)$$,
  'reabertura preserva autoria e registra o editor'
);
select results_eq(
  $$select conteudo_versao, versao_publicada, pdf_status, pdf_path is null from public.fstd_documentos where processo_id = '60000000-0000-4000-8000-000000000020'$$,
  $$values (2, 1, 'pendente'::text, true)$$,
  'reabertura invalida somente o PDF atual e preserva sua versao anterior'
);

reset role;
update public.fstd_produtos
set quantidade_faturada_galinha = 6
where id = '61000000-0000-4000-8000-000000000020';
update public.fstd_processos
set status = 'concluida', finalizada_em = now()
where id = '60000000-0000-4000-8000-000000000020';

select is(
  (select conferencia_status from public.fstd_processos where id = '60000000-0000-4000-8000-000000000020'),
  'conferida',
  'nova finalizacao reconcilia imediatamente os produtos corrigidos'
);
select is(
  jsonb_array_length((select conferencia_detalhes->'produtos' from public.fstd_processos where id = '60000000-0000-4000-8000-000000000020')),
  0,
  'conferencia final nao conserva divergencias obsoletas'
);
select is(
  (select count(*) from public.fstd_processos where loja_id = '30000000-0000-4000-8000-000000000001' and nfd_numero = '992001' and is_avulsa),
  1::bigint,
  'revisao nao duplica a ocorrencia da FSTD'
);

select * from finish();
rollback;
