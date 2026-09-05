begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(25);

select has_column('public', 'usuarios', 'modo_coleta', 'usuario possui preferencia de coleta');
select has_column('public', 'fstd_processos', 'modo_coleta', 'processo preserva snapshot do modo');
select has_table('public', 'fstd_resumos_agregados', 'resumo agregado possui armazenamento proprio');
select has_function('public', 'iniciar_fstd_agregada', array['uuid', 'text'], 'RPC de inicio agregado existe');
select has_function('public', 'salvar_fstd_agregada', array['uuid', 'uuid', 'integer', 'integer', 'text', 'jsonb', 'boolean'], 'RPC de gravacao agregada existe');

update public.usuarios
set modo_coleta = 'agregado'
where id = '10000000-0000-4000-8000-000000000004';

set local role authenticated;
set local request.jwt.claim.sub = '20000000-0000-4000-8000-000000000004';
set local request.jwt.claims = '{"sub":"20000000-0000-4000-8000-000000000004","app_metadata":{"role":"promotor"}}';

select lives_ok(
  $$select public.iniciar_fstd_agregada('30000000-0000-4000-8000-000000000002', 'HOM-900002-990002')$$,
  'Promotor agregado inicia uma NFD da propria rota'
);
select is(
  (select modo_coleta from public.fstd_processos where nfd_chave_acesso = 'HOM-900002-990002'),
  'agregado',
  'processo congela o modo agregado'
);
select results_eq(
  $$select quantidade_faturada_galinha, quantidade_faturada_codorna from public.fstd_resumos_agregados where processo_id = (select id from public.fstd_processos where nfd_chave_acesso = 'HOM-900002-990002')$$,
  $$values (6, 0)$$,
  'resumo usa os totais reais da nota'
);
select is(
  (select count(*) from public.fstd_produtos where processo_id = (select id from public.fstd_processos where nfd_chave_acesso = 'HOM-900002-990002')),
  0::bigint,
  'modo agregado nao cria produtos artificiais'
);
select is(
  (select count(*) from public.fstd_documentos where processo_id = (select id from public.fstd_processos where nfd_chave_acesso = 'HOM-900002-990002')),
  0::bigint,
  'processo agregado ainda nao gera documento durante o preenchimento'
);
select throws_ok(
  $$select public.salvar_fstd_agregada((select id from public.fstd_processos where nfd_chave_acesso = 'HOM-900002-990002'), '50000000-0000-4000-8000-000000000001', 7, 0, null, '["teste/foto.webp"]', true)$$,
  'P0001',
  'O retorno nao pode ser maior que a quantidade faturada.',
  'banco impede retorno maior que faturado'
);
select throws_ok(
  $$select public.salvar_fstd_agregada((select id from public.fstd_processos where nfd_chave_acesso = 'HOM-900002-990002'), '50000000-0000-4000-8000-000000000001', 2, 0, null, '[]', true)$$,
  'P0001',
  'Ao menos uma foto e obrigatoria para finalizar a FSTD.',
  'foto permanece obrigatoria nas novas FSTDs agregadas'
);
select lives_ok(
  $$select public.salvar_fstd_agregada((select id from public.fstd_processos where nfd_chave_acesso = 'HOM-900002-990002'), '50000000-0000-4000-8000-000000000001', 2, 0, 'Observacao agregada', '["teste/foto.webp"]', true)$$,
  'Promotor finaliza o resumo agregado valido'
);
select is(
  (select status from public.fstd_processos where nfd_chave_acesso = 'HOM-900002-990002'),
  'concluida',
  'processo agregado fica concluido'
);
select is(
  (select count(*) from public.fstd_documentos where processo_id = (select id from public.fstd_processos where nfd_chave_acesso = 'HOM-900002-990002')),
  1::bigint,
  'processo agregado entra no ciclo de documentos depois de concluido'
);
select results_eq(
  $$select galinha_nfd, galinha_retorno from public.fstd_relatorio where nfd = '990002'$$,
  $$values (6::bigint, 2::bigint)$$,
  'relatorio geral inclui os totais agregados'
);
select is(
  (select count(*) from public.fstd_relatorio_produtos where nfd = '990002'),
  0::bigint,
  'relatorio por produto exclui o agregado'
);

reset role;
update public.usuarios
set modo_coleta = 'produto'
where id = '10000000-0000-4000-8000-000000000004';

select is(
  (select modo_coleta from public.fstd_processos where nfd_chave_acesso = 'HOM-900002-990002'),
  'agregado',
  'troca posterior do usuario nao altera a FSTD existente'
);
select throws_ok(
  $$update public.fstd_processos set modo_coleta = 'produto' where nfd_chave_acesso = 'HOM-900002-990002'$$,
  '23514',
  'O modo de coleta de uma FSTD existente nao pode ser alterado.',
  'snapshot do processo e imutavel'
);

set local role authenticated;
set local request.jwt.claim.sub = '20000000-0000-4000-8000-000000000004';
set local request.jwt.claims = '{"sub":"20000000-0000-4000-8000-000000000004","app_metadata":{"role":"promotor"}}';
select throws_ok(
  $$select public.iniciar_fstd_agregada('30000000-0000-4000-8000-000000000002', 'HOM-900002-990002')$$,
  '42501',
  'Este Promotor esta habilitado para coleta por produto.',
  'Promotor em V2 nao inicia novo fluxo agregado'
);

reset role;
update public.fstd_documentos
set pdf_path = 'teste/agregada-v1.pdf', pdf_status = 'disponivel',
    conteudo_versao = 1, versao_publicada = 1
where processo_id = (select id from public.fstd_processos where nfd_chave_acesso = 'HOM-900002-990002');

set local role authenticated;
set local request.jwt.claim.sub = '20000000-0000-4000-8000-000000000002';
set local request.jwt.claims = '{"sub":"20000000-0000-4000-8000-000000000002","app_metadata":{"role":"gerencial"}}';
select lives_ok(
  $$select public.salvar_fstd_agregada((select id from public.fstd_processos where nfd_chave_acesso = 'HOM-900002-990002'), '50000000-0000-4000-8000-000000000002', 1, 0, 'Corrigida pelo gerencial', '["teste/foto.webp"]', false)$$,
  'Gerencial da UF edita FSTD agregada concluida'
);
select results_eq(
  $$select quantidade_retorno_galinha, observacao from public.fstd_resumos_agregados where processo_id = (select id from public.fstd_processos where nfd_chave_acesso = 'HOM-900002-990002')$$,
  $$values (1, 'Corrigida pelo gerencial'::text)$$,
  'edicao gerencial altera apenas o resumo existente'
);
select results_eq(
  $$select pdf_status, pdf_path is null, conteudo_versao, versao_publicada from public.fstd_documentos where processo_id = (select id from public.fstd_processos where nfd_chave_acesso = 'HOM-900002-990002')$$,
  $$values ('pendente'::text, true, 2, 1)$$,
  'edicao posterior invalida o PDF atual e preserva a versao publicada'
);

reset role;
select is(
  (select atualizado_por from public.fstd_processos where nfd_chave_acesso = 'HOM-900002-990002'),
  '10000000-0000-4000-8000-000000000002'::uuid,
  'ultimo editor gerencial fica registrado'
);
select is(
  (select criado_por from public.fstd_processos where nfd_chave_acesso = 'HOM-900002-990002'),
  '10000000-0000-4000-8000-000000000004'::uuid,
  'autor Promotor permanece imutavel'
);

select * from finish();
rollback;
