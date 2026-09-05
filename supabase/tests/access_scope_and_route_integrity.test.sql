begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(38);

insert into auth.users (id, email)
values ('20000000-0000-4000-8000-000000000007', 'promotor.ba@homologacao.avine.test')
on conflict (id) do nothing;

insert into public.usuarios (
  id, email, nome, perfil, estado, ufs, auth_user_id, ativo, acesso_habilitado
)
values (
  '10000000-0000-4000-8000-000000000007',
  'promotor.ba@homologacao.avine.test',
  'PROMOTOR BA TESTE',
  'Promotor',
  'BA',
  array['BA'],
  '20000000-0000-4000-8000-000000000007',
  true,
  true
)
on conflict (id) do update set
  perfil = excluded.perfil,
  estado = excluded.estado,
  ufs = excluded.ufs,
  ativo = excluded.ativo,
  acesso_habilitado = excluded.acesso_habilitado;

insert into public.loja_promotores (id, loja_id, promotor_id, posicao)
values (
  '31000000-0000-4000-8000-000000000004',
  '30000000-0000-4000-8000-000000000003',
  '10000000-0000-4000-8000-000000000007',
  1
)
on conflict (id) do update set
  loja_id = excluded.loja_id,
  promotor_id = excluded.promotor_id,
  posicao = excluded.posicao;

insert into public.fstd_processos (
  id, nfd_chave_acesso, nfd_numero, loja_id, promotor_id, status, is_avulsa
)
values (
  '60000000-0000-4000-8000-000000000003',
  'HOM-900003-990003',
  '990003',
  '30000000-0000-4000-8000-000000000003',
  '10000000-0000-4000-8000-000000000007',
  'em_andamento',
  false
)
on conflict (id) do nothing;

insert into public.fstd_produtos (
  id, processo_id, codigo_produto, nome, quantidade_faturada_galinha,
  quantidade_faturada_codorna, quantidade_retorno, status, fotos
)
values (
  '61000000-0000-4000-8000-000000000004',
  '60000000-0000-4000-8000-000000000003',
  'TESTE-NAO-CLASSIFICADO',
  'PRODUTO BA TESTE',
  7,
  0,
  0,
  'pendente',
  '[]'::jsonb
)
on conflict (id) do nothing;

insert into public.nfd_desconhecimentos (
  id, loja_id, usuario_id, nfd_referencia, nfd_chave_acesso,
  nfd_numero, loja_codigo, comentario
)
values (
  '70000000-0000-4000-8000-000000000002',
  '30000000-0000-4000-8000-000000000003',
  '10000000-0000-4000-8000-000000000007',
  'HOM-900003-990099',
  'HOM-900003-990099',
  '990099',
  '900003',
  'DESCONHECIMENTO BA TESTE'
)
on conflict (id) do nothing;

insert into public.fstd_legado (
  legado_id, codigo_loja, numero_nfd, id, origem
)
values
  (990001, '900001', '980001', '900001980001', 'TESTE RLS'),
  (990002, '900003', '980002', '900003980002', 'TESTE RLS')
on conflict (legado_id) do nothing;

select has_function('app_private', 'is_current_user_active', array[]::text[]);
select has_function('app_private', 'is_current_user_promotor_ativo', array[]::text[]);
select has_function('app_private', 'can_current_user_read_loja', array['uuid']);
select has_trigger(
  'public',
  'usuarios',
  'detach_invalid_promotor_routes',
  'Trigger remove rotas quando o perfil deixa de ser Promotor'
);

set local role authenticated;
set local request.jwt.claim.sub = '20000000-0000-4000-8000-000000000001';
set local request.jwt.claims = '{"sub":"20000000-0000-4000-8000-000000000001","app_metadata":{"role":"admin"}}';

select ok(app_private.is_current_user_active(), 'Admin coerente e ativo passa pelo gate geral');
select is((select count(*) from public.lojas), 3::bigint, 'Admin ve todas as lojas');
select is((select count(*) from public.nfd_itens), 4::bigint, 'Admin ve todos os itens fiscais');
select is((select count(*) from public.fstd_legado where origem = 'TESTE RLS'), 2::bigint, 'Admin ve todo o legado');

set local request.jwt.claim.sub = '20000000-0000-4000-8000-000000000002';
set local request.jwt.claims = '{"sub":"20000000-0000-4000-8000-000000000002","app_metadata":{"role":"gerencial"}}';

select is((select count(*) from public.lojas), 2::bigint, 'Gerencial CE ve somente lojas do CE');
select is((select count(*) from public.nfd_itens), 3::bigint, 'Gerencial CE ve somente itens do CE');
select is((select count(*) from public.nfd_desconhecimentos where loja_codigo = '900003'), 0::bigint, 'Gerencial CE nao ve desconhecimento da BA');
select is((select count(*) from public.fstd_processos where loja_id = '30000000-0000-4000-8000-000000000003'), 0::bigint, 'Gerencial CE nao ve processo da BA');
select is((select count(*) from public.fstd_legado where origem = 'TESTE RLS'), 1::bigint, 'Gerencial CE ve somente legado da sua UF');

set local request.jwt.claim.sub = '20000000-0000-4000-8000-000000000003';
set local request.jwt.claims = '{"sub":"20000000-0000-4000-8000-000000000003","app_metadata":{"role":"gerencial"}}';

select is((select count(*) from public.lojas), 1::bigint, 'Gerencial BA ve somente loja da BA');
select is((select count(*) from public.nfd_itens), 1::bigint, 'Gerencial BA ve somente item da BA');
select is((select count(*) from public.fstd_processos where loja_id <> '30000000-0000-4000-8000-000000000003'), 0::bigint, 'Gerencial BA nao ve processos do CE');
select is((select count(*) from public.fstd_legado where origem = 'TESTE RLS'), 1::bigint, 'Gerencial BA ve somente legado da sua UF');

set local request.jwt.claim.sub = '20000000-0000-4000-8000-000000000004';
set local request.jwt.claims = '{"sub":"20000000-0000-4000-8000-000000000004","app_metadata":{"role":"promotor"}}';

select ok(app_private.is_current_user_promotor_ativo(), 'Promotor coerente e ativo passa pelo gate do perfil');
select is((select count(*) from public.lojas), 2::bigint, 'Promotor ve somente lojas da propria rota');
select is((select count(*) from public.nfd_itens), 3::bigint, 'Promotor ve somente itens fiscais das suas lojas');
select is((select count(*) from public.fstd_processos), 2::bigint, 'Promotor ve somente processos de sua autoria');
select is((select count(*) from public.fstd_legado where origem = 'TESTE RLS'), 1::bigint, 'Promotor ve legado somente das lojas da rota');

set local request.jwt.claim.sub = '20000000-0000-4000-8000-000000000005';
set local request.jwt.claims = '{"sub":"20000000-0000-4000-8000-000000000005","app_metadata":{"role":"promotor"}}';

select is((select count(*) from public.lojas), 1::bigint, 'Segundo Promotor ve somente sua loja da rota');
select is((select count(*) from public.fstd_processos), 0::bigint, 'Segundo Promotor nao herda processos de outro Promotor na mesma loja');

set local request.jwt.claim.sub = '20000000-0000-4000-8000-000000000006';
set local request.jwt.claims = '{"sub":"20000000-0000-4000-8000-000000000006","app_metadata":{"role":"promotor"}}';

select is(app_private.is_current_user_active(), false, 'Usuario desativado falha no gate geral');
select is((select count(*) from public.lojas), 0::bigint, 'Usuario desativado nao ve lojas');
select is((select count(*) from public.nfd_itens), 0::bigint, 'Usuario desativado nao ve notas');
select throws_ok(
  $$select public.record_usuario_access()$$,
  '42501',
  'Usuario ativo e com acesso habilitado obrigatorio.',
  'Usuario desativado nao consegue registrar atividade por RPC'
);

set local request.jwt.claim.sub = '20000000-0000-4000-8000-000000000002';
set local request.jwt.claims = '{"sub":"20000000-0000-4000-8000-000000000002","app_metadata":{"role":"admin"}}';

select is(app_private.is_current_user_active(), false, 'Role Auth divergente do perfil bloqueia o acesso');
select is((select count(*) from public.lojas), 0::bigint, 'Role divergente nao contorna RLS');

reset role;

select throws_ok(
  $$
    insert into public.loja_promotores (loja_id, promotor_id, posicao)
    values (
      '30000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000002',
      3
    )
  $$,
  '23514',
  'A rota aceita somente Promotor com a mesma UF da loja.',
  'Banco rejeita perfil Gerencial em rota mesmo por chamada direta'
);

set local role authenticated;
set local request.jwt.claim.sub = '20000000-0000-4000-8000-000000000001';
set local request.jwt.claims = '{"sub":"20000000-0000-4000-8000-000000000001","app_metadata":{"role":"admin"}}';

select throws_ok(
  $$
    insert into public.loja_promotores (loja_id, promotor_id, posicao)
    values (
      '30000000-0000-4000-8000-000000000002',
      '10000000-0000-4000-8000-000000000006',
      2
    )
  $$,
  '42501',
  null,
  'RLS impede atribuir Promotor desativado a uma rota'
);

reset role;

update public.usuarios
set ativo = false, acesso_habilitado = false
where id = '10000000-0000-4000-8000-000000000004';

select is(
  (select count(*) from public.loja_promotores where promotor_id = '10000000-0000-4000-8000-000000000004'),
  2::bigint,
  'Desativacao preserva os vinculos de rota para futura reativacao'
);

set local role authenticated;
set local request.jwt.claim.sub = '20000000-0000-4000-8000-000000000004';
set local request.jwt.claims = '{"sub":"20000000-0000-4000-8000-000000000004","app_metadata":{"role":"promotor"}}';
select is((select count(*) from public.lojas), 0::bigint, 'Desativacao bloqueia imediatamente uma sessao ja emitida');

reset role;
set local request.jwt.claim.sub = '';
set local request.jwt.claims = '{}';
update public.usuarios
set ativo = true, acesso_habilitado = true
where id = '10000000-0000-4000-8000-000000000004';

set local role authenticated;
set local request.jwt.claim.sub = '20000000-0000-4000-8000-000000000004';
set local request.jwt.claims = '{"sub":"20000000-0000-4000-8000-000000000004","app_metadata":{"role":"promotor"}}';
select is((select count(*) from public.lojas), 2::bigint, 'Reativacao recupera o mesmo escopo de rota');

reset role;
update public.usuarios
set perfil = 'Gerencial', ufs = array['CE']
where id = '10000000-0000-4000-8000-000000000005';

select is(
  (select count(*) from public.loja_promotores where promotor_id = '10000000-0000-4000-8000-000000000005'),
  0::bigint,
  'Promocao para Gerencial remove somente os vinculos de rota agora invalidos'
);

set local role authenticated;
set local request.jwt.claim.sub = '20000000-0000-4000-8000-000000000002';
set local request.jwt.claims = '{"sub":"20000000-0000-4000-8000-000000000002","app_metadata":{"role":"gerencial"}}';

select is(
  app_private.can_current_user_access_process('60000000-0000-4000-8000-000000000003'),
  false,
  'Gerencial fora da UF falha no gate usado pelas RPCs de alteracao'
);

set local request.jwt.claim.sub = '20000000-0000-4000-8000-000000000001';
set local request.jwt.claims = '{"sub":"20000000-0000-4000-8000-000000000001","app_metadata":{"role":"admin"}}';

select ok(
  app_private.can_current_user_access_process('60000000-0000-4000-8000-000000000003'),
  'Admin preserva o gate global usado pelas RPCs de alteracao'
);

select * from finish();
rollback;
