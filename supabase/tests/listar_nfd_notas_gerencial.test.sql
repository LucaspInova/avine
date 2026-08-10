begin;
select plan(8);

select has_function('public', 'listar_nfd_notas_gerencial', array['date','date','text','text','text','text','text','text','integer','integer']);
select function_returns('public', 'listar_nfd_notas_gerencial', array['date','date','text','text','text','text','text','text','integer','integer'], 'jsonb');
select has_index('public', 'nfd_itens', 'nfd_itens_gerencial_data_idx', 'data efetiva indexada');
select has_index('public', 'nfd_itens', 'nfd_itens_gerencial_uf_cidade_idx', 'UF/cidade indexadas');
select has_index('public', 'fstd_processos', 'fstd_processos_nfd_created_stable_idx', 'processo ativo indexado');
select has_index('public', 'nfd_desconhecimentos', 'nfd_desconhecimentos_referencia_ativa_idx', 'desconhecimento ativo indexado');
select has_index('public', 'fstd_legado', 'fstd_legado_loja_nfd_idx', 'legado indexado sem cast da coluna legada');
select function_privs_are('public', 'listar_nfd_notas_gerencial', array['date','date','text','text','text','text','text','text','integer','integer'], 'authenticated', array['EXECUTE'], 'somente usuário autenticado executa');

-- Fixture-based environments should additionally run the statement below with
-- >=100k nfd_itens and inspect that date/location and lateral lookups use the
-- indexes asserted above:
-- EXPLAIN (ANALYZE, BUFFERS) SELECT public.listar_nfd_notas_gerencial(
--   current_date-interval '30 days', current_date, 'Pendente', 'CE',
--   'Fortaleza', 'mercado', 'data_emissao', 'desc', 50, 5000);
select * from finish();
rollback;
