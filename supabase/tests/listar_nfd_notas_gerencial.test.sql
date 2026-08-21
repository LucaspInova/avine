begin;
select plan(30);

select has_function('public', 'listar_nfd_notas_gerencial', array['date','date','text','text','text','text','text','text','integer','integer']);
select function_returns('public', 'listar_nfd_notas_gerencial', array['date','date','text','text','text','text','text','text','integer','integer'], 'jsonb');
select has_index('public', 'nfd_itens', 'nfd_itens_gerencial_data_idx', 'data efetiva indexada');
select has_index('public', 'nfd_itens', 'nfd_itens_gerencial_uf_cidade_idx', 'UF/cidade indexadas');
select has_index('public', 'fstd_processos', 'fstd_processos_nfd_created_stable_idx', 'processo ativo indexado');
select has_index('public', 'nfd_desconhecimentos', 'nfd_desconhecimentos_referencia_ativa_idx', 'desconhecimento ativo indexado');
select has_index('public', 'fstd_legado', 'fstd_legado_loja_nfd_idx', 'legado indexado sem cast da coluna legada');
select has_index('public', 'nfd_itens', 'nfd_itens_nota_fiscal_trgm_idx', 'NFD textual parcial indexada');
select has_index('public', 'nfd_itens', 'nfd_itens_codigo_cliente_trgm_idx', 'cliente textual parcial indexado');
select has_index('public', 'nfd_itens', 'nfd_itens_nome_abreviado_trgm_idx', 'nome abreviado textual parcial indexado');
select has_index('public', 'nfd_itens', 'nfd_itens_estabelecimento_trgm_idx', 'estabelecimento textual parcial indexado');
select function_privs_are('public', 'listar_nfd_notas_gerencial', array['date','date','text','text','text','text','text','text','integer','integer'], 'authenticated', array['EXECUTE'], 'somente usuário autenticado executa');
select has_function('public', 'carregar_fontes_dashboard_gerencial', array['text[]', 'jsonb'], 'RPC da dashboard consolidada existe');
select function_returns('public', 'carregar_fontes_dashboard_gerencial', array['text[]', 'jsonb'], 'jsonb', 'RPC da dashboard consolidada retorna JSON');
select function_privs_are('public', 'carregar_fontes_dashboard_gerencial', array['text[]', 'jsonb'], 'authenticated', array['EXECUTE'], 'somente autenticado carrega fontes da dashboard');
select has_function('public', 'carregar_dashboard_gerencial', array['date', 'date', 'text', 'text'], 'RPC unica da dashboard existe');
select function_returns('public', 'carregar_dashboard_gerencial', array['date', 'date', 'text', 'text'], 'jsonb', 'RPC unica da dashboard retorna JSON');
select function_privs_are('public', 'carregar_dashboard_gerencial', array['date', 'date', 'text', 'text'], 'authenticated', array['EXECUTE'], 'somente autenticado carrega a dashboard completa');
select has_function('app_private', 'search_nfd_chaves_numeric', array['text'], 'helper numerico privado existe');
select function_privs_are('app_private', 'search_nfd_chaves_numeric', array['text'], 'authenticated', array['EXECUTE'], 'usuário autenticado pode usar o helper pelo RPC');
select has_function('app_private', 'search_nfd_chaves_by_name', array['text'], 'helper textual privado existe');
select function_privs_are('app_private', 'search_nfd_chaves_by_name', array['text'], 'authenticated', array['EXECUTE'], 'usuário autenticado pode usar a busca por nome pelo RPC');

select matches(
  pg_get_functiondef('app_private.search_nfd_chaves_numeric(text)'::regprocedure),
  E'ni\\.nota_fiscal::text\\s+like\\s+''%''\\s*\\|\\|\\s*v_search\\s*\\|\\|\\s*''%''',
  'pesquisa numerica encontra ocorrencias parciais na NFD'
);

select matches(
  pg_get_functiondef('app_private.search_nfd_chaves_numeric(text)'::regprocedure),
  E'ni\\.codigo_cliente::text\\s+like\\s+''%''\\s*\\|\\|\\s*v_search\\s*\\|\\|\\s*''%''',
  'pesquisa numerica encontra ocorrencias parciais no cliente'
);

select matches(
  pg_get_functiondef('public.listar_nfd_notas_gerencial(date,date,text,text,text,text,text,text,integer,integer)'::regprocedure),
  E'app_private\\.search_nfd_chaves_numeric\\(\\$6\\)',
  'RPC resolve chaves numericas antes de consultar a view protegida por RLS'
);

select matches(
  pg_get_functiondef('public.listar_nfd_notas_gerencial(date,date,text,text,text,text,text,text,integer,integer)'::regprocedure),
  E'app_private\\.search_nfd_chaves_by_name\\(\\$6\\)',
  'RPC resolve chaves por nome antes de consultar os itens protegidos por RLS'
);

select matches(
  pg_get_functiondef('public.listar_nfd_notas_gerencial(date,date,text,text,text,text,text,text,integer,integer)'::regprocedure),
  E'from public\\.nfd_itens ni',
  'RPC agrega diretamente os itens protegidos, sem montar detalhes JSON da view completa'
);

select ok(
  position('from public.nfd_notas n' in pg_get_functiondef('public.listar_nfd_notas_gerencial(date,date,text,text,text,text,text,text,integer,integer)'::regprocedure)) = 0,
  'RPC nao consulta nfd_notas, cuja agregacao de detalhes inviabiliza filtros amplos'
);

select matches(
  pg_get_functiondef('app_private.search_nfd_chaves_numeric(text)'::regprocedure),
  E'SECURITY DEFINER',
  'helper privado contorna apenas a barreira de planejamento RLS'
);

select matches(
  pg_get_functiondef('public.listar_nfd_notas_gerencial(date,date,text,text,text,text,text,text,integer,integer)'::regprocedure),
  E'when legado\\.legado_id is not null or processo\\.status = ''concluida'' then ''Finalizada''[[:space:]]+when desconhecida\\.encontrada then ''Desconhecida''',
  'finalizacao legada ou moderna prevalece sobre marcacao desconhecida'
);

-- Fixture-based environments should additionally run the statement below with
-- >=100k nfd_itens and inspect that date/location and lateral lookups use the
-- indexes asserted above:
-- EXPLAIN (ANALYZE, BUFFERS) SELECT public.listar_nfd_notas_gerencial(
--   current_date-interval '30 days', current_date, 'Pendente', 'CE',
--   'Fortaleza', 'mercado', 'data_emissao', 'desc', 50, 5000);
select * from finish();
rollback;
