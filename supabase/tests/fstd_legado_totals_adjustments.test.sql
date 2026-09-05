begin;
select plan(18);

select has_table('public', 'fstd_legado_ajustes_totais', 'ajustes legados possuem tabela propria');
select has_column('public', 'fstd_legado_ajustes_totais', 'legado_id', 'ajuste referencia a FSTD legada');
select col_type_is('public', 'fstd_legado_ajustes_totais', 'qtd_retorno_galinha', 'bigint', 'retorno de galinha usa inteiro');
select col_type_is('public', 'fstd_legado_ajustes_totais', 'qtd_retorno_codorna', 'bigint', 'retorno de codorna usa inteiro');
select has_function('public', 'ajustar_fstd_legado_totais', array['bigint', 'bigint', 'bigint'], 'RPC de ajuste agregado existe');
select has_function('public', 'obter_fstd_legado', array['text', 'text'], 'consulta legada efetiva continua disponivel');

insert into public.fstd_legado (
  legado_id, codigo_loja, numero_nfd, id, origem,
  qtd_total_galinha, qtd_retorno_galinha,
  qtd_total_codorna, qtd_retorno_codorna
)
values
  (991001, '900001', '981001', '900001981001', 'TESTE AJUSTE LEGADO', 100, 10, 20, 2),
  (991002, '900003', '981002', '900003981002', 'TESTE AJUSTE LEGADO', 70, 7, 0, 0)
on conflict (legado_id) do nothing;

set local role authenticated;
set local request.jwt.claim.sub = '20000000-0000-4000-8000-000000000002';
set local request.jwt.claims = '{"sub":"20000000-0000-4000-8000-000000000002","app_metadata":{"role":"gerencial"}}';

select is(
  (public.ajustar_fstd_legado_totais(991001, 15, 3)).qtd_retorno_galinha,
  15::bigint,
  'Gerencial da UF ajusta o retorno legado'
);
select is(
  (select qtd_retorno_codorna from public.obter_fstd_legado('900001', '981001')),
  3::bigint,
  'consulta efetiva devolve o ajuste sem alterar a origem'
);
select is(
  (select qtd_retorno_galinha from public.fstd_legado where legado_id = 991001),
  10::bigint,
  'linha importada permanece imutavel'
);
select lives_ok(
  $$select public.ajustar_fstd_legado_totais(991001, 15, 3)$$,
  'repetir o mesmo ajuste e idempotente'
);
select is(
  (select count(*) from public.fstd_legado_ajustes_totais where legado_id = 991001),
  1::bigint,
  'repeticao nao duplica o ajuste'
);
select throws_ok(
  $$select public.ajustar_fstd_legado_totais(991001, 101, 3)$$,
  'P0001',
  'A quantidade de retorno nao pode ser maior que a quantidade faturada.',
  'banco rejeita retorno maior que o faturado'
);
select throws_ok(
  $$select public.ajustar_fstd_legado_totais(991002, 8, 0)$$,
  'P0001',
  'Usuario sem acesso a loja desta FSTD.',
  'Gerencial fora da UF nao ajusta o legado'
);
select is(
  (select count(*) from public.fstd_legado_ajustes_totais),
  1::bigint,
  'Gerencial enxerga somente ajustes de lojas autorizadas'
);

set local request.jwt.claim.sub = '20000000-0000-4000-8000-000000000004';
set local request.jwt.claims = '{"sub":"20000000-0000-4000-8000-000000000004","app_metadata":{"role":"promotor"}}';

select throws_ok(
  $$select public.ajustar_fstd_legado_totais(991001, 16, 3)$$,
  'P0001',
  'Somente usuarios Gerencial ou Admin ativos podem editar uma FSTD finalizada.',
  'Promotor nao ajusta total legado'
);

set local request.jwt.claim.sub = '20000000-0000-4000-8000-000000000001';
set local request.jwt.claims = '{"sub":"20000000-0000-4000-8000-000000000001","app_metadata":{"role":"admin"}}';

select is(
  (public.ajustar_fstd_legado_totais(991002, 8, 0)).qtd_retorno_galinha,
  8::bigint,
  'Admin ajusta o legado de qualquer UF'
);
select is(
  (select count(*) from public.fstd_legado_ajustes_totais),
  2::bigint,
  'Admin enxerga todos os ajustes'
);

set local request.jwt.claim.sub = '20000000-0000-4000-8000-000000000003';
set local request.jwt.claims = '{"sub":"20000000-0000-4000-8000-000000000003","app_metadata":{"role":"gerencial"}}';

select is(
  (select count(*) from public.fstd_legado_ajustes_totais),
  1::bigint,
  'Gerencial BA enxerga somente o ajuste da propria UF'
);

select * from finish();
rollback;
