begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(32);

select has_table('public', 'loja_import_alertas', 'alertas de loja possuem armazenamento proprio');
select has_function('public', 'sincronizar_lojas_importadas', array['jsonb', 'text'], 'importadores usam RPC transacional de lojas');
select has_function('public', 'salvar_produto_catalogo', array['uuid', 'text', 'text[]', 'bigint', 'text', 'text', 'boolean'], 'CRUD gerencial de produtos existe');
select has_function('public', 'vincular_codigo_produto', array['uuid', 'text'], 'vinculo explicito de alias existe');
select has_view('public', 'produtos_pendentes', 'fila de codigos nao classificados e derivada');
select is(
  (select public from storage.buckets where id = 'product-images'),
  true,
  'bucket publico de imagens de produto existe'
);

select lives_ok(
  $$select public.sincronizar_lojas_importadas(
    '[{"codigo":"900001","nome":"NOME QUE NAO DEVE SOBRESCREVER","uf":"CE","cidade":"OUTRA CIDADE"},{"codigo":"900010","nome":"LOJA IMPORTADA NOVA","uf":"CE","cidade":"FORTALEZA"},{"codigo":"900011","nome":"INCOMPLETA","uf":"XX","cidade":""}]'::jsonb,
    'api'
  )$$,
  'lote com loja nova, divergente e invalida e processado'
);
select is(
  (select nome from public.lojas where codigo = '900001'),
  'LOJA TESTE FORTALEZA',
  'importacao nao sobrescreve a loja existente'
);
select is(
  (select count(*) from public.lojas where codigo = '900010'),
  1::bigint,
  'loja ausente e cadastrada automaticamente'
);
select is(
  (select count(*) from public.lojas where codigo = '900011'),
  0::bigint,
  'loja sem dados obrigatorios nao e criada'
);
select is(
  (select count(*) from public.loja_import_alertas where codigo = '900001' and tipo = 'dados_divergentes'),
  1::bigint,
  'diferenca cadastral fica registrada para revisao'
);
select is(
  (public.sincronizar_lojas_importadas('[{"codigo":"900010","nome":"LOJA IMPORTADA NOVA","uf":"CE","cidade":"FORTALEZA"}]'::jsonb, 'sheets')->>'inseridas')::integer,
  0,
  'reexecutar o mesmo lote nao duplica a loja'
);
select lives_ok(
  $$select public.sincronizar_lojas_importadas('[{"codigo":"900012","nome":"LOJA TESTE FORTALEZA","uf":"CE","cidade":"FORTALEZA"}]'::jsonb, 'sheets')$$,
  'codigo novo com identidade semelhante ainda e cadastrado para roteirizacao'
);
select is(
  (select count(*) from public.loja_import_alertas where codigo = '900012' and tipo = 'possivel_troca_codigo'),
  1::bigint,
  'possivel troca de codigo fica sinalizada sem bloquear o cadastro'
);
select is(
  has_function_privilege('authenticated', 'public.sincronizar_lojas_importadas(jsonb,text)', 'EXECUTE'),
  false,
  'usuarios do frontend nao executam a sincronizacao sistemica'
);
select is(
  has_function_privilege('service_role', 'public.sincronizar_lojas_importadas(jsonb,text)', 'EXECUTE'),
  true,
  'importadores com service role executam a sincronizacao'
);

select is(
  (select count(*) from public.produtos_pendentes where codigo_produto = 'TESTE-NAO-CLASSIFICADO'),
  1::bigint,
  'codigo fiscal sem catalogo aparece na fila pendente'
);

set local role authenticated;
set local request.jwt.claim.sub = '20000000-0000-4000-8000-000000000004';
set local request.jwt.claims = '{"sub":"20000000-0000-4000-8000-000000000004","app_metadata":{"role":"promotor"}}';
select throws_ok(
  $$select public.salvar_produto_catalogo(null, 'PRODUTO NEGADO', array['NEGADO'], 12, 'Grande', null, true)$$,
  '42501',
  'Somente Gerencial ou Admin pode administrar produtos.',
  'Promotor nao administra o catalogo'
);

set local request.jwt.claim.sub = '20000000-0000-4000-8000-000000000002';
set local request.jwt.claims = '{"sub":"20000000-0000-4000-8000-000000000002","app_metadata":{"role":"gerencial"}}';
select lives_ok(
  $$select public.salvar_produto_catalogo(null, 'PRODUTO MANUAL TESTE', array[' manual-b ', 'MANUAL-A', 'manual-a'], 15, 'Grande', null, true)$$,
  'Gerencial cadastra produto manualmente'
);
select results_eq(
  $$select codigos_vinculados, ovos_und, categoria from public.produtos where nome = 'PRODUTO MANUAL TESTE'$$,
  $$values ('MANUAL-A;MANUAL-B'::text, 15::bigint, 'Grande'::text)$$,
  'codigos sao normalizados e duplicatas internas removidas'
);
select is(
  (select usuario_id from public.produto_catalogo_auditoria where produto_id = (select id from public.produtos where nome = 'PRODUTO MANUAL TESTE') order by id desc limit 1),
  '10000000-0000-4000-8000-000000000002'::uuid,
  'auditoria registra o usuario gerencial'
);
select throws_ok(
  $$select public.salvar_produto_catalogo(null, 'PRODUTO DUPLICADO', array['manual-a'], 15, 'Grande', null, true)$$,
  '23505',
  'Um codigo informado ja pertence ao produto PRODUTO MANUAL TESTE.',
  'um codigo nao pode pertencer a dois produtos'
);

reset role;
insert into public.nfd_itens (
  estabelecimento, nota_fiscal, chave_acesso, data_emissao, valor,
  quantidade_galinha, valor_galinha, quantidade_codorna, valor_codorna,
  codigo_cliente, nome_abreviado, uf, cidade, codigo_produto,
  descricao_produto, data_referencia
) values (
  'HOMOLOGACAO', 990020, 'HOM-900001-990020', '2026-09-05', 10,
  1, 10, 0, 0, 900001, 'LOJA TESTE FORTALEZA', 'CE', 'FORTALEZA',
  'TESTE-NOVO-ALIAS', 'OVOS BRANCOS C/30 NOVA EMBALAGEM', '2026-09-05'
);

set local role authenticated;
set local request.jwt.claim.sub = '20000000-0000-4000-8000-000000000002';
set local request.jwt.claims = '{"sub":"20000000-0000-4000-8000-000000000002","app_metadata":{"role":"gerencial"}}';
select is(
  (select count(*) from public.produtos_pendentes where codigo_produto = 'TESTE-NOVO-ALIAS'),
  1::bigint,
  'Gerencial ve codigo pendente de sua UF'
);
select lives_ok(
  $$select public.vincular_codigo_produto('40000000-0000-4000-8000-000000000001', 'TESTE-NOVO-ALIAS')$$,
  'Gerencial classifica pendente como alias'
);
select is(
  (select count(*) from public.produtos_pendentes where codigo_produto = 'TESTE-NOVO-ALIAS'),
  0::bigint,
  'codigo sai automaticamente da fila depois do vinculo'
);
select is(
  (select count(*) from public.produtos_expandidos where codigo_produto = 'TESTE-NOVO-ALIAS' and produto_id = '40000000-0000-4000-8000-000000000001'),
  1::bigint,
  'alias aponta para o produto escolhido'
);
select is(
  (select count(*) from public.produto_catalogo_auditoria
   where produto_id = '40000000-0000-4000-8000-000000000001'
     and acao = 'alterado'
     and usuario_id = '10000000-0000-4000-8000-000000000002'),
  1::bigint,
  'vinculo de alias tambem gera auditoria'
);

select lives_ok(
  $$select public.salvar_produto_catalogo(null, 'GB C/15', array['10PA01.014GD02'], 15, 'Grande', null, true)$$,
  'GB C/15 pode ser criado como produto canonico proprio'
);
select is(
  (select produto_id is not null from public.produtos_expandidos where codigo_produto = '10PA01.014GD02'),
  true,
  'codigo GB C/15 fica resolvido no catalogo'
);
select lives_ok(
  $$select public.salvar_produto_catalogo(null, 'EB C/30', array['10PA01.017EX02'], 30, 'Alto Giro Bco', null, true)$$,
  'produto canonico EB C/30 e preparado no cenario limpo'
);
select lives_ok(
  $$select public.vincular_codigo_produto((select id from public.produtos where nome = 'EB C/30'), '10PA01.017EX23')$$,
  'Cuisine e Co e vinculado como alias do EB C/30'
);
select is(
  (select count(distinct produto_id) from public.produtos_expandidos where codigo_produto in ('10PA01.017EX02', '10PA01.017EX23')),
  1::bigint,
  'codigo novo e codigo anterior compartilham o mesmo produto canonico'
);

select * from finish();
rollback;
