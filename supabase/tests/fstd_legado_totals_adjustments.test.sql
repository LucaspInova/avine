begin;
select plan(6);

select has_table('public', 'fstd_legado_ajustes_totais', 'ajustes legados possuem tabela propria');
select has_column('public', 'fstd_legado_ajustes_totais', 'legado_id', 'ajuste referencia a FSTD legada');
select col_type_is('public', 'fstd_legado_ajustes_totais', 'qtd_retorno_galinha', 'bigint', 'retorno de galinha usa inteiro');
select col_type_is('public', 'fstd_legado_ajustes_totais', 'qtd_retorno_codorna', 'bigint', 'retorno de codorna usa inteiro');
select has_function('public', 'ajustar_fstd_legado_totais', array['bigint', 'bigint', 'bigint'], 'RPC de ajuste agregado existe');
select has_function('public', 'obter_fstd_legado', array['text', 'text'], 'consulta legada efetiva continua disponivel');

select * from finish();
rollback;
