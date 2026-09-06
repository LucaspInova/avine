begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(29);

select has_function('app_private', 'normalize_invoice_number', array['text']);
select has_table(
  'public',
  'nfd_desconhecimento_comentarios',
  'comentarios de desconhecimento possuem historico proprio'
);
select has_view(
  'public',
  'nfd_desconhecimento_historico',
  'historico consolidado de desconhecimentos esta disponivel'
);
select has_index(
  'public',
  'nfd_desconhecimentos',
  'nfd_desconhecimentos_loja_numero_ativo_uidx',
  'Um unico caso ativo por loja e numero normalizado'
);
select has_function(
  'public',
  'registrar_desconhecimento_nfd',
  array['uuid', 'text', 'text', 'text', 'text', 'text', 'text']
);
select has_function('public', 'salvar_rota_loja', array['uuid', 'uuid[]']);

insert into auth.users (id, email)
values
  ('20000000-0000-4000-8000-000000000008', 'promotor.ce3@homologacao.avine.test'),
  ('20000000-0000-4000-8000-000000000009', 'promotor.ce4@homologacao.avine.test'),
  ('20000000-0000-4000-8000-000000000010', 'promotor.ba2@homologacao.avine.test')
on conflict (id) do nothing;

insert into public.usuarios (
  id, email, nome, perfil, estado, ufs, auth_user_id, ativo, acesso_habilitado
)
values
  ('10000000-0000-4000-8000-000000000008', 'promotor.ce3@homologacao.avine.test', 'PROMOTOR CE TRES', 'Promotor', 'CE', array['CE'], '20000000-0000-4000-8000-000000000008', true, true),
  ('10000000-0000-4000-8000-000000000009', 'promotor.ce4@homologacao.avine.test', 'PROMOTOR CE QUATRO', 'Promotor', 'CE', array['CE'], '20000000-0000-4000-8000-000000000009', true, true),
  ('10000000-0000-4000-8000-000000000010', 'promotor.ba2@homologacao.avine.test', 'PROMOTOR BA DOIS', 'Promotor', 'BA', array['BA'], '20000000-0000-4000-8000-000000000010', true, true)
on conflict (id) do update set
  perfil = excluded.perfil,
  estado = excluded.estado,
  ufs = excluded.ufs,
  ativo = excluded.ativo,
  acesso_habilitado = excluded.acesso_habilitado;

set local role authenticated;
set local request.jwt.claim.sub = '20000000-0000-4000-8000-000000000004';
set local request.jwt.claims = '{"sub":"20000000-0000-4000-8000-000000000004","app_metadata":{"role":"promotor"}}';

select is(
  public.registrar_desconhecimento_nfd(
    '30000000-0000-4000-8000-000000000001', '900001:001234', 'CHAVE-1234',
    '001.234', '900001', 'Comentario inicial do Promotor', 'comentario'
  ),
  public.registrar_desconhecimento_nfd(
    '30000000-0000-4000-8000-000000000001', '900001:1234', 'CHAVE-1234',
    '1234', '900001', 'Retificacao do mesmo Promotor', 'retificacao'
  ),
  'Numero formatado e sem zeros reutiliza o mesmo caso ativo'
);

select is(
  (select count(*) from public.nfd_desconhecimentos
    where loja_id = '30000000-0000-4000-8000-000000000001'
      and nfd_numero_normalizado = '1234'
      and reconhecida_em is null),
  1::bigint,
  'Permanece somente um caso ativo'
);

select is(
  (select count(*) from public.nfd_desconhecimento_historico
    where loja_id = '30000000-0000-4000-8000-000000000001'
      and nfd_numero_normalizado = '1234'),
  2::bigint,
  'Abertura e retificacao ficam no historico'
);

select is(
  (select count(distinct desconhecimento_id) from public.nfd_desconhecimento_historico
    where loja_id = '30000000-0000-4000-8000-000000000001'
      and nfd_numero_normalizado = '1234'),
  1::bigint,
  'Comentarios pertencem ao mesmo caso'
);

select throws_ok(
  $$
    insert into public.nfd_desconhecimentos (
      loja_id, usuario_id, nfd_referencia, nfd_numero, comentario
    ) values (
      '30000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000004',
      '900001:9991', '9991', 'Tentativa direta'
    )
  $$,
  '42501',
  null,
  'Usuario autenticado nao contorna o historico com insert direto'
);

select throws_ok(
  $$select public.registrar_desconhecimento_nfd(
    '30000000-0000-4000-8000-000000000003', '900003:1234', null,
    '1234', '900003', 'Fora da rota', 'comentario'
  )$$,
  '42501',
  'Usuario ativo sem acesso a loja informada.',
  'Promotor nao cria caso fora da propria rota'
);

set local request.jwt.claim.sub = '20000000-0000-4000-8000-000000000002';
set local request.jwt.claims = '{"sub":"20000000-0000-4000-8000-000000000002","app_metadata":{"role":"gerencial"}}';

select lives_ok(
  $$select public.registrar_desconhecimento_nfd(
    '30000000-0000-4000-8000-000000000001', '900001:1234', 'CHAVE-1234',
    '1234', '900001', 'Coordenador corrigiu a informacao', 'retificacao'
  )$$,
  'Gerencial adiciona retificacao sem abrir outro caso'
);

select is(
  (select count(*) from public.nfd_desconhecimento_historico
    where loja_id = '30000000-0000-4000-8000-000000000001'
      and nfd_numero_normalizado = '1234'),
  3::bigint,
  'Historico exibe tambem a retificacao gerencial'
);

select is(
  (select autor_nome from public.nfd_desconhecimento_historico
    where loja_id = '30000000-0000-4000-8000-000000000001'
      and nfd_numero_normalizado = '1234'
      and tipo = 'retificacao'
    order by created_at desc, comentario_id desc limit 1),
  'GERENCIAL CE HOMOLOGACAO',
  'Historico preserva o autor da retificacao'
);

select is(
  public.reconhecer_nfd_gerencial('900001:1234', 'CHAVE-1234', '1234'),
  1,
  'Gerencial encerra exatamente o caso ativo'
);

select is(
  (select count(*) from public.nfd_desconhecimentos
    where loja_id = '30000000-0000-4000-8000-000000000001'
      and nfd_numero_normalizado = '1234'
      and reconhecida_em is null),
  0::bigint,
  'Caso reconhecido deixa de estar ativo'
);

select is(
  (select count(*) from public.nfd_desconhecimento_historico
    where loja_id = '30000000-0000-4000-8000-000000000001'
      and nfd_numero_normalizado = '1234'),
  4::bigint,
  'Reconhecimento acrescenta evento e nao apaga comentarios'
);

set local request.jwt.claim.sub = '20000000-0000-4000-8000-000000000004';
set local request.jwt.claims = '{"sub":"20000000-0000-4000-8000-000000000004","app_metadata":{"role":"promotor"}}';

select lives_ok(
  $$select public.registrar_desconhecimento_nfd(
    '30000000-0000-4000-8000-000000000001', '900001:1234', 'CHAVE-1234',
    '1234', '900001', 'Novo caso depois do reconhecimento', 'comentario'
  )$$,
  'Uma nova ocorrencia pode reabrir a identidade depois do reconhecimento'
);

select is(
  (select count(distinct desconhecimento_id) from public.nfd_desconhecimento_historico
    where loja_id = '30000000-0000-4000-8000-000000000001'
      and nfd_numero_normalizado = '1234'),
  2::bigint,
  'Reabertura cria novo caso sem alterar o historico encerrado'
);

set local request.jwt.claim.sub = '20000000-0000-4000-8000-000000000001';
set local request.jwt.claims = '{"sub":"20000000-0000-4000-8000-000000000001","app_metadata":{"role":"admin"}}';

select lives_ok(
  $$select * from public.salvar_rota_loja(
    '30000000-0000-4000-8000-000000000001',
    array[
      '10000000-0000-4000-8000-000000000004',
      '10000000-0000-4000-8000-000000000005',
      '10000000-0000-4000-8000-000000000008',
      '10000000-0000-4000-8000-000000000009'
    ]::uuid[]
  )$$,
  'Rota aceita quatro Promotores'
);

select is(
  (select count(*) from public.loja_promotores
    where loja_id = '30000000-0000-4000-8000-000000000001'),
  4::bigint,
  'Quatro vinculos foram persistidos'
);

select is(
  (select max(posicao) from public.loja_promotores
    where loja_id = '30000000-0000-4000-8000-000000000001'),
  4,
  'Ordem dinamica nao para na terceira posicao'
);

select throws_ok(
  $$select * from public.salvar_rota_loja(
    '30000000-0000-4000-8000-000000000001',
    array[
      '10000000-0000-4000-8000-000000000004',
      '10000000-0000-4000-8000-000000000004'
    ]::uuid[]
  )$$,
  '22023',
  'O mesmo Promotor nao pode aparecer duas vezes na rota.',
  'RPC rejeita Promotor duplicado'
);

select throws_ok(
  $$select * from public.salvar_rota_loja(
    '30000000-0000-4000-8000-000000000001',
    array['10000000-0000-4000-8000-000000000010']::uuid[]
  )$$,
  '42501',
  'A rota aceita somente Promotores ativos da mesma UF da loja.',
  'RPC rejeita Promotor de outra UF'
);

select lives_ok(
  $$select * from public.salvar_rota_loja(
    '30000000-0000-4000-8000-000000000001',
    array[
      '10000000-0000-4000-8000-000000000009',
      '10000000-0000-4000-8000-000000000008',
      '10000000-0000-4000-8000-000000000005',
      '10000000-0000-4000-8000-000000000004'
    ]::uuid[]
  )$$,
  'Rota pode ser reordenada atomicamente'
);

select is(
  (select promotor_id from public.loja_promotores
    where loja_id = '30000000-0000-4000-8000-000000000001' and posicao = 1),
  '10000000-0000-4000-8000-000000000009'::uuid,
  'Nova ordem fica persistida'
);

select lives_ok(
  $$select * from public.salvar_rota_loja(
    '30000000-0000-4000-8000-000000000001', array[]::uuid[]
  )$$,
  'Rota pode ficar sem Promotor'
);

select is(
  (select count(*) from public.loja_promotores
    where loja_id = '30000000-0000-4000-8000-000000000001'),
  0::bigint,
  'Lista vazia remove todos os vinculos da loja'
);

select * from finish();
rollback;
