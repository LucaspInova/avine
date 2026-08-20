begin;
select plan(4);

select has_column('public', 'fstd_legado', 'source_hash', 'legado preserva hash da origem');
select col_type_is('public', 'fstd_legado', 'source_hash', 'text', 'hash da origem usa texto');
select has_index('public', 'fstd_legado', 'fstd_legado_source_hash_uidx', 'hash da origem possui indice');
select index_is_unique('public', 'fstd_legado', 'fstd_legado_source_hash_uidx', 'hash da origem nao duplica importacoes');

select * from finish();
rollback;
