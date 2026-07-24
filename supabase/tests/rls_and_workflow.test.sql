begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(37);

insert into auth.users (id, email)
values
  ('10000000-0000-0000-0000-000000000001', 'gerencial@test.invalid'),
  ('20000000-0000-0000-0000-000000000001', 'owner@test.invalid'),
  ('30000000-0000-0000-0000-000000000001', 'other@test.invalid'),
  ('40000000-0000-0000-0000-000000000001', 'disabled@test.invalid'),
  ('50000000-0000-0000-0000-000000000001', 'without-profile@test.invalid');

insert into public.usuarios (
  id,
  email,
  nome,
  perfil,
  estado,
  auth_user_id,
  ativo,
  acesso_habilitado
)
values
  (
    '10000000-0000-0000-0000-000000000011',
    'gerencial@test.invalid',
    'Gerencial Teste',
    'Gerencial',
    'CE',
    '10000000-0000-0000-0000-000000000001',
    true,
    true
  ),
  (
    '20000000-0000-0000-0000-000000000011',
    'owner@test.invalid',
    'Promotor Proprietario',
    'Promotor',
    'CE',
    '20000000-0000-0000-0000-000000000001',
    true,
    true
  ),
  (
    '30000000-0000-0000-0000-000000000011',
    'other@test.invalid',
    'Promotor Externo',
    'Promotor',
    'CE',
    '30000000-0000-0000-0000-000000000001',
    true,
    true
  ),
  (
    '40000000-0000-0000-0000-000000000011',
    'disabled@test.invalid',
    'Promotor Bloqueado',
    'Promotor',
    'CE',
    '40000000-0000-0000-0000-000000000001',
    true,
    false
  );

insert into public.lojas (id, codigo, nome, uf, cidade)
values
  (
    '20000000-0000-0000-0000-000000000021',
    '9001',
    'Loja Proprietaria',
    'CE',
    'Fortaleza'
  ),
  (
    '30000000-0000-0000-0000-000000000021',
    '9002',
    'Loja Externa',
    'CE',
    'Fortaleza'
  );

insert into public.loja_promotores (loja_id, promotor_id, posicao)
values
  (
    '20000000-0000-0000-0000-000000000021',
    '20000000-0000-0000-0000-000000000011',
    1
  ),
  (
    '30000000-0000-0000-0000-000000000021',
    '30000000-0000-0000-0000-000000000011',
    1
  );

insert into public.produtos (
  id,
  status,
  nome,
  codigos_vinculados,
  ovos_und,
  categoria
)
values
  (
    '20000000-0000-0000-0000-000000000031',
    true,
    'Produto Um',
    'P1',
    12,
    'Galinha'
  ),
  (
    '20000000-0000-0000-0000-000000000032',
    true,
    'Produto Dois',
    'P2',
    3,
    'Galinha'
  );

insert into public.nfd_itens (
  id,
  estabelecimento,
  nota_fiscal,
  chave_acesso,
  data_emissao,
  codigo_cliente,
  codigo_produto,
  descricao_produto,
  quantidade_galinha,
  quantidade_codorna,
  data_referencia
)
values
  (
    90001,
    'AVINE',
    1234,
    'NFD-OWNER',
    current_date,
    9001,
    'P1',
    'Produto Um',
    10,
    2,
    current_date
  ),
  (
    90002,
    'AVINE',
    1234,
    'NFD-OWNER',
    current_date,
    9001,
    'P2',
    'Produto Dois',
    3,
    0,
    current_date
  ),
  (
    90003,
    'AVINE',
    4321,
    'NFD-OTHER',
    current_date,
    9002,
    'P1',
    'Produto Um',
    1,
    0,
    current_date
  );

insert into public.motivos_devolucao (id, nome, ordem, ativo)
values (
  '20000000-0000-0000-0000-000000000041',
  'Motivo de Teste',
  999,
  true
);

select ok(
  not has_table_privilege('anon', 'public.usuarios', 'SELECT'),
  'anon cannot read operational profiles'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.iniciar_fstd_produtos_v2(uuid,text)',
    'EXECUTE'
  ),
  'anon cannot execute the workflow RPC'
);
select ok(
  to_regprocedure('public.is_current_user_gerencial_ativo()') is null,
  'the authorization helper is not exposed by the Data API'
);
select ok(
  to_regprocedure('app_private.is_current_user_gerencial_ativo()') is not null,
  'the authorization helper exists in a private schema'
);
select is(
  (
    select count(*)::integer
    from pg_proc as p
    join pg_namespace as n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'concluir_fstd_produto'
      and pg_get_function_identity_arguments(p.oid)
        like '%p_motivo_id uuid%'
  ),
  0,
  'legacy concluir_fstd_produto overloads are absent'
);
select ok(
  position(
    'pg_advisory_xact_lock' in pg_get_functiondef(
      'public.iniciar_fstd_produtos_v2(uuid,text)'::regprocedure
    )
  ) > 0,
  'workflow start serializes concurrent requests by NFD'
);

set local role authenticated;
set local request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';

select results_eq(
  'select count(*) from public.usuarios',
  array[4::bigint],
  'active Gerencial can read all profiles'
);
select ok(
  app_private.is_current_user_gerencial_ativo(),
  'private helper accepts an active Gerencial with access'
);

set local request.jwt.claim.sub = '20000000-0000-0000-0000-000000000001';

select results_eq(
  'select count(*) from public.lojas',
  array[1::bigint],
  'Promotor only reads assigned stores'
);
select lives_ok(
  $$
    select public.iniciar_fstd_produtos_v2(
      '20000000-0000-0000-0000-000000000021',
      'NFD-OWNER'
    )
  $$,
  'owner can start an FSTD from server-derived NFD data'
);
select results_eq(
  $$
    select count(*)
    from public.fstd_produtos
    where processo_id = (
      select id from public.fstd_processos
      where nfd_chave_acesso = 'NFD-OWNER'
    )
  $$,
  array[2::bigint],
  'all NFD products are derived server-side'
);
select results_eq(
  $$
    select quantidade_faturada_galinha, quantidade_faturada_codorna
    from public.fstd_produtos
    where codigo_produto = 'P1'
  $$,
  $$
    values (10, 2)
  $$,
  'server-derived quantities match nfd_itens'
);
select lives_ok(
  $$
    select public.iniciar_fstd_produtos(
      '20000000-0000-0000-0000-000000000021',
      'NFD-OWNER',
      'FORGED-NUMBER',
      '[{"codigo_produto":"FORGED","quantidade_galinha":999}]'::jsonb
    )
  $$,
  'legacy wrapper remains safe during the frontend transition'
);
select results_eq(
  $$
    select count(*)
    from public.fstd_produtos
    where processo_id = (
      select id from public.fstd_processos
      where nfd_chave_acesso = 'NFD-OWNER'
    )
  $$,
  array[2::bigint],
  'legacy wrapper ignores forged product data'
);
select throws_ok(
  $$
    select public.iniciar_fstd_produtos_v2(
      '20000000-0000-0000-0000-000000000021',
      'NFD-MISSING'
    )
  $$,
  'missing NFD is rejected'
);
select throws_ok(
  $$
    select public.iniciar_fstd_produtos_v2(
      '30000000-0000-0000-0000-000000000021',
      'NFD-OTHER'
    )
  $$,
  'cross-store IDOR is rejected'
);

reset role;

insert into storage.objects (bucket_id, name)
select
  'fstd-fotos',
  '20000000-0000-0000-0000-000000000001/' ||
    p.id::text || '/owner.webp'
from public.fstd_processos as p
where p.nfd_chave_acesso = 'NFD-OWNER';

insert into storage.objects (bucket_id, name)
select
  'fstd-fotos',
  '30000000-0000-0000-0000-000000000001/' ||
    p.id::text || '/other.webp'
from public.fstd_processos as p
where p.nfd_chave_acesso = 'NFD-OWNER';

set local role authenticated;
set local request.jwt.claim.sub = '20000000-0000-0000-0000-000000000001';

select results_eq(
  $$select count(*) from storage.objects where bucket_id = 'fstd-fotos'$$,
  array[1::bigint],
  'Promotor reads only their own photo folder'
);
select results_eq(
  $$
    select count(*)
    from storage.objects
    where name like '30000000-0000-0000-0000-000000000001/%'
  $$,
  array[0::bigint],
  'Promotor cannot read another user photo'
);
select lives_ok(
  $$
    select public.concluir_fstd_produto(
      (
        select id from public.fstd_produtos
        where codigo_produto = 'P1'
      ),
      jsonb_build_array(
        jsonb_build_object(
          'motivo_id', '20000000-0000-0000-0000-000000000041',
          'quantidade_faturada', 12,
          'quantidade_retorno', 4
        )
      ),
      'teste',
      jsonb_build_array(
        '20000000-0000-0000-0000-000000000001/' ||
          (
            select id::text from public.fstd_processos
            where nfd_chave_acesso = 'NFD-OWNER'
          ) || '/owner.webp'
      )
    )
  $$,
  'owner concludes a product with an owned photo'
);
select lives_ok(
  $$
    select public.editar_fstd_produto(
      (
        select id from public.fstd_produtos
        where codigo_produto = 'P1'
      ),
      jsonb_build_array(
        jsonb_build_object(
          'motivo_id', '20000000-0000-0000-0000-000000000041',
          'quantidade_faturada', 9,
          'quantidade_retorno', 2
        )
      ),
      8,
      1,
      'editado',
      jsonb_build_array(
        '20000000-0000-0000-0000-000000000001/' ||
          (
            select id::text from public.fstd_processos
            where nfd_chave_acesso = 'NFD-OWNER'
          ) || '/owner.webp'
      )
    )
  $$,
  'owner edits billed quantities'
);
select results_eq(
  $$
    select
      quantidade_faturada_galinha,
      quantidade_faturada_codorna,
      quantidade_retorno
    from public.fstd_produtos
    where codigo_produto = 'P1'
  $$,
  $$
    values (8, 1, 2)
  $$,
  'edited quantities are persisted'
);
select throws_ok(
  $$
    select public.finalizar_fstd_produtos(
      (
        select id from public.fstd_processos
        where nfd_chave_acesso = 'NFD-OWNER'
      )
    )
  $$,
  'incomplete workflow cannot be finalized'
);
select throws_ok(
  $$
    select public.concluir_fstd_produto(
      (
        select id from public.fstd_produtos
        where codigo_produto = 'P2'
      ),
      jsonb_build_array(
        jsonb_build_object(
          'motivo_id', '20000000-0000-0000-0000-000000000041',
          'quantidade_faturada', 3,
          'quantidade_retorno', 1
        )
      ),
      null,
      jsonb_build_array(
        '30000000-0000-0000-0000-000000000001/' ||
          (
            select id::text from public.fstd_processos
            where nfd_chave_acesso = 'NFD-OWNER'
          ) || '/other.webp'
      )
    )
  $$,
  'foreign photo path is rejected'
);

set local request.jwt.claim.sub = '30000000-0000-0000-0000-000000000001';

select results_eq(
  $$select count(*) from public.fstd_processos where nfd_chave_acesso = 'NFD-OWNER'$$,
  array[0::bigint],
  'another Promotor cannot read the owner process'
);
select throws_ok(
  $$
    select public.concluir_fstd_produto(
      (
        select id from public.fstd_produtos
        where codigo_produto = 'P2'
      ),
      jsonb_build_array(
        jsonb_build_object(
          'motivo_id', '20000000-0000-0000-0000-000000000041',
          'quantidade_faturada', 3,
          'quantidade_retorno', 1
        )
      ),
      null,
      '[]'::jsonb
    )
  $$,
  'another Promotor cannot mutate the owner product'
);

set local request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';

select results_eq(
  $$select count(*) from storage.objects where bucket_id = 'fstd-fotos'$$,
  array[2::bigint],
  'Gerencial can read FSTD evidence'
);

set local request.jwt.claim.sub = '20000000-0000-0000-0000-000000000001';

select lives_ok(
  $$
    select public.concluir_fstd_produto(
      (
        select id from public.fstd_produtos
        where codigo_produto = 'P2'
      ),
      jsonb_build_array(
        jsonb_build_object(
          'motivo_id', '20000000-0000-0000-0000-000000000041',
          'quantidade_faturada', 3,
          'quantidade_retorno', 1
        )
      ),
      null,
      '[]'::jsonb
    )
  $$,
  'owner concludes the final product'
);
select lives_ok(
  $$
    select public.finalizar_fstd_produtos(
      (
        select id from public.fstd_processos
        where nfd_chave_acesso = 'NFD-OWNER'
      )
    )
  $$,
  'complete workflow can be finalized'
);
select results_eq(
  $$
    select status
    from public.fstd_processos
    where nfd_chave_acesso = 'NFD-OWNER'
  $$,
  $$
    values ('concluida'::text)
  $$,
  'finalized workflow persists the concluded status'
);

reset role;

update public.usuarios
set acesso_habilitado = false
where auth_user_id = '20000000-0000-0000-0000-000000000001';

set local role authenticated;
set local request.jwt.claim.sub = '20000000-0000-0000-0000-000000000001';

select results_eq(
  'select count(*) from public.lojas',
  array[0::bigint],
  'disabled profile cannot read client data'
);
select throws_ok(
  $$
    select public.iniciar_fstd_produtos_v2(
      '20000000-0000-0000-0000-000000000021',
      'NFD-OWNER'
    )
  $$,
  'disabled profile cannot execute workflow RPCs'
);

set local request.jwt.claim.sub = '50000000-0000-0000-0000-000000000001';

select results_eq(
  'select count(*) from public.lojas',
  array[0::bigint],
  'Auth user without a profile cannot read client data'
);
select throws_ok(
  $$
    select public.iniciar_fstd_produtos_v2(
      '20000000-0000-0000-0000-000000000021',
      'NFD-OWNER'
    )
  $$,
  'Auth user without a profile cannot execute workflow RPCs'
);

reset role;

delete from storage.objects
where name like '30000000-0000-0000-0000-000000000001/%';

select is(
  (
    select count(*)::integer
    from public.fstd_produtos as fp
    left join public.fstd_processos as p on p.id = fp.processo_id
    where p.id is null
  ),
  0,
  'there are no orphan workflow products'
);
select is(
  (
    select count(*)::integer
    from public.fstd_processos as p
    where not exists (
      select 1
      from public.nfd_itens as ni
      where ni.chave_acesso = p.nfd_chave_acesso
    )
  ),
  0,
  'there are no workflow processes without an NFD'
);
select is(
  (
    select count(*)::integer
    from public.fstd_produtos as fp
    where fp.status = 'concluido'
      and (
        select coalesce(sum(fpm.quantidade_faturada), 0)
        from public.fstd_produto_motivos as fpm
        where fpm.produto_id = fp.id
      ) <> fp.quantidade_faturada_galinha + fp.quantidade_faturada_codorna
  ),
  0,
  'reason billing totals match the product billing total'
);
select is(
  (
    select count(*)::integer
    from storage.objects as object
    where object.bucket_id = 'fstd-fotos'
      and not exists (
        select 1
        from public.fstd_produtos as fp
        where fp.fotos ? object.name
      )
  ),
  0,
  'there are no orphan FSTD storage objects'
);

select * from finish();
rollback;
