-- Dados exclusivamente sintéticos para desenvolvimento e homologação.
-- Senha comum das contas abaixo: FstdTeste2026!
-- Nunca executar este seed no projeto de produção.

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, reauthentication_token, is_sso_user, is_anonymous
)
values
  ('00000000-0000-0000-0000-000000000000', '20000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'admin@homologacao.avine.test', extensions.crypt('FstdTeste2026!', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"],"role":"admin"}', '{"nome":"ADMIN HOMOLOGACAO"}', now(), now(), '', '', '', '', '', '', false, false),
  ('00000000-0000-0000-0000-000000000000', '20000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'gerencial.ce@homologacao.avine.test', extensions.crypt('FstdTeste2026!', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"],"role":"gerencial"}', '{"nome":"GERENCIAL CE HOMOLOGACAO"}', now(), now(), '', '', '', '', '', '', false, false),
  ('00000000-0000-0000-0000-000000000000', '20000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'gerencial.ba@homologacao.avine.test', extensions.crypt('FstdTeste2026!', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"],"role":"gerencial"}', '{"nome":"GERENCIAL BA HOMOLOGACAO"}', now(), now(), '', '', '', '', '', '', false, false),
  ('00000000-0000-0000-0000-000000000000', '20000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'promotor.ce1@homologacao.avine.test', extensions.crypt('FstdTeste2026!', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"],"role":"promotor"}', '{"nome":"PROMOTOR CE UM"}', now(), now(), '', '', '', '', '', '', false, false),
  ('00000000-0000-0000-0000-000000000000', '20000000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'promotor.ce2@homologacao.avine.test', extensions.crypt('FstdTeste2026!', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"],"role":"promotor"}', '{"nome":"PROMOTOR CE DOIS"}', now(), now(), '', '', '', '', '', '', false, false),
  ('00000000-0000-0000-0000-000000000000', '20000000-0000-4000-8000-000000000006', 'authenticated', 'authenticated', 'promotor.inativo@homologacao.avine.test', extensions.crypt('FstdTeste2026!', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"],"role":"promotor"}', '{"nome":"PROMOTOR INATIVO"}', now(), now(), '', '', '', '', '', '', false, false)
on conflict (id) do update set
  email = excluded.email,
  encrypted_password = excluded.encrypted_password,
  email_confirmed_at = excluded.email_confirmed_at,
  raw_app_meta_data = excluded.raw_app_meta_data,
  raw_user_meta_data = excluded.raw_user_meta_data,
  updated_at = now();

insert into auth.identities (
  id, provider_id, user_id, identity_data, provider,
  last_sign_in_at, created_at, updated_at
)
select
  gen_random_uuid(),
  u.id::text,
  u.id,
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
  'email',
  now(), now(), now()
from auth.users as u
where u.id between '20000000-0000-4000-8000-000000000001'::uuid
               and '20000000-0000-4000-8000-000000000006'::uuid
on conflict (provider_id, provider) do update set
  identity_data = excluded.identity_data,
  updated_at = now();

insert into public.usuarios (
  id, email, nome, perfil, estado, fotos_habilitadas,
  auth_user_id, ativo, acesso_habilitado, ufs
)
values
  ('10000000-0000-4000-8000-000000000001', 'admin@homologacao.avine.test', 'ADMIN HOMOLOGACAO', 'Admin', 'CE', true, '20000000-0000-4000-8000-000000000001', true, true, '{}'),
  ('10000000-0000-4000-8000-000000000002', 'gerencial.ce@homologacao.avine.test', 'GERENCIAL CE HOMOLOGACAO', 'Gerencial', 'CE', true, '20000000-0000-4000-8000-000000000002', true, true, array['CE']),
  ('10000000-0000-4000-8000-000000000003', 'gerencial.ba@homologacao.avine.test', 'GERENCIAL BA HOMOLOGACAO', 'Gerencial', 'BA', true, '20000000-0000-4000-8000-000000000003', true, true, array['BA']),
  ('10000000-0000-4000-8000-000000000004', 'promotor.ce1@homologacao.avine.test', 'PROMOTOR CE UM', 'Promotor', 'CE', true, '20000000-0000-4000-8000-000000000004', true, true, array['CE']),
  ('10000000-0000-4000-8000-000000000005', 'promotor.ce2@homologacao.avine.test', 'PROMOTOR CE DOIS', 'Promotor', 'CE', true, '20000000-0000-4000-8000-000000000005', true, true, array['CE']),
  ('10000000-0000-4000-8000-000000000006', 'promotor.inativo@homologacao.avine.test', 'PROMOTOR INATIVO', 'Promotor', 'CE', false, '20000000-0000-4000-8000-000000000006', false, false, array['CE'])
on conflict (id) do update set
  email=excluded.email, nome=excluded.nome, perfil=excluded.perfil,
  estado=excluded.estado, fotos_habilitadas=excluded.fotos_habilitadas,
  auth_user_id=excluded.auth_user_id, ativo=excluded.ativo,
  acesso_habilitado=excluded.acesso_habilitado, ufs=excluded.ufs;

insert into public.lojas (id, codigo, nome, uf, cidade)
values
  ('30000000-0000-4000-8000-000000000001', '900001', 'LOJA TESTE FORTALEZA', 'CE', 'FORTALEZA'),
  ('30000000-0000-4000-8000-000000000002', '900002', 'LOJA TESTE CAUCAIA', 'CE', 'CAUCAIA'),
  ('30000000-0000-4000-8000-000000000003', '900003', 'LOJA TESTE SALVADOR', 'BA', 'SALVADOR')
on conflict (id) do update set codigo=excluded.codigo, nome=excluded.nome, uf=excluded.uf, cidade=excluded.cidade;

insert into public.loja_promotores (id, loja_id, promotor_id, posicao)
values
  ('31000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000004', 1),
  ('31000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000005', 2),
  ('31000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000004', 1)
on conflict (id) do update set loja_id=excluded.loja_id, promotor_id=excluded.promotor_id, posicao=excluded.posicao;

insert into public.produtos (id, status, nome, codigos_vinculados, ovos_und, categoria, class_ia, color_ia)
values
  ('40000000-0000-4000-8000-000000000001', true, 'OVOS BRANCOS C/30 TESTE', 'TESTE-OVO-30;TESTE-OVO-30-ALIAS', 30, 'Galinha', 'branco', '#F4E7C5'),
  ('40000000-0000-4000-8000-000000000002', true, 'OVOS CODORNA C/30 TESTE', 'TESTE-COD-30', 30, 'Codorna', 'codorna', '#D6B589'),
  ('40000000-0000-4000-8000-000000000003', false, 'PRODUTO INATIVO TESTE', 'TESTE-INATIVO', 12, 'Galinha', 'inativo', '#999999')
on conflict (id) do update set status=excluded.status, nome=excluded.nome,
  codigos_vinculados=excluded.codigos_vinculados, ovos_und=excluded.ovos_und,
  categoria=excluded.categoria, class_ia=excluded.class_ia, color_ia=excluded.color_ia;

insert into public.motivos_devolucao (id, nome, ativo, ordem)
values
  ('50000000-0000-4000-8000-000000000001', 'AVARIA DE TESTE', true, 1),
  ('50000000-0000-4000-8000-000000000002', 'VALIDADE DE TESTE', true, 2)
on conflict (id) do update set nome=excluded.nome, ativo=excluded.ativo, ordem=excluded.ordem;

insert into public.nfd_itens (
  estabelecimento, nota_fiscal, chave_acesso, data_emissao, valor,
  quantidade_galinha, valor_galinha, quantidade_codorna, valor_codorna,
  codigo_cliente, nome_abreviado, uf, cidade, codigo_produto,
  descricao_produto, data_referencia
)
values
  ('HOMOLOGACAO', 990001, 'HOM-900001-990001', '2026-09-01', 120.00, 10, 120.00, 0, 0, 900001, 'LOJA TESTE FORTALEZA', 'CE', 'FORTALEZA', 'TESTE-OVO-30', 'OVOS BRANCOS C/30 TESTE', '2026-09-01'),
  ('HOMOLOGACAO', 990001, 'HOM-900001-990001', '2026-09-01', 45.00, 0, 0, 5, 45.00, 900001, 'LOJA TESTE FORTALEZA', 'CE', 'FORTALEZA', 'TESTE-COD-30', 'OVOS CODORNA C/30 TESTE', '2026-09-01'),
  ('HOMOLOGACAO', 990002, 'HOM-900002-990002', '2026-09-02', 72.00, 6, 72.00, 0, 0, 900002, 'LOJA TESTE CAUCAIA', 'CE', 'CAUCAIA', 'TESTE-OVO-30-ALIAS', 'OVOS BRANCOS C/30 ALIAS TESTE', '2026-09-02'),
  ('HOMOLOGACAO', 990003, 'HOM-900003-990003', '2026-09-03', 84.00, 7, 84.00, 0, 0, 900003, 'LOJA TESTE SALVADOR', 'BA', 'SALVADOR', 'TESTE-NAO-CLASSIFICADO', 'PRODUTO NOVO PENDENTE TESTE', '2026-09-03');

insert into public.fstd_processos (
  id, nfd_chave_acesso, nfd_numero, loja_id, promotor_id, status,
  is_avulsa, nfd_data_emissao, nfd_valor, conferencia_status, conferencia_detalhes
)
values
  ('60000000-0000-4000-8000-000000000001', 'HOM-900001-990001', '990001', '30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000004', 'em_andamento', false, '2026-09-01', 165.00, 'pendente', '{}'),
  ('60000000-0000-4000-8000-000000000002', 'AVULSA:900002:990010', '990010', '30000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000004', 'em_andamento', true, '2026-09-04', 72.00, 'divergente', '{"cenario":"homologacao"}')
on conflict (id) do update set nfd_chave_acesso=excluded.nfd_chave_acesso,
  nfd_numero=excluded.nfd_numero, loja_id=excluded.loja_id,
  promotor_id=excluded.promotor_id, status=excluded.status,
  is_avulsa=excluded.is_avulsa, nfd_data_emissao=excluded.nfd_data_emissao,
  nfd_valor=excluded.nfd_valor, conferencia_status=excluded.conferencia_status,
  conferencia_detalhes=excluded.conferencia_detalhes;

insert into public.fstd_produtos (
  id, processo_id, produto_id, codigo_produto, nome, descricao,
  quantidade_faturada_galinha, quantidade_faturada_codorna,
  quantidade_retorno, motivo_id, observacao, status, fotos
)
values
  ('61000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', 'TESTE-OVO-30', 'OVOS BRANCOS C/30 TESTE', 'CENARIO NORMAL', 10, 0, 1, '50000000-0000-4000-8000-000000000001', 'OBSERVACAO SINTETICA', 'concluido', '["homologacao/foto-teste.webp"]'),
  ('61000000-0000-4000-8000-000000000002', '60000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000002', 'TESTE-COD-30', 'OVOS CODORNA C/30 TESTE', 'CENARIO NORMAL', 0, 5, 0, null, null, 'pendente', '[]'),
  ('61000000-0000-4000-8000-000000000003', '60000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000001', 'TESTE-OVO-30-ALIAS', 'OVOS BRANCOS C/30 ALIAS TESTE', 'CENARIO AVULSA DIVERGENTE', 5, 0, 1, '50000000-0000-4000-8000-000000000002', 'AGUARDANDO CONCILIACAO', 'concluido', '["homologacao/foto-avulsa.webp"]')
on conflict (id) do update set processo_id=excluded.processo_id,
  produto_id=excluded.produto_id, codigo_produto=excluded.codigo_produto,
  nome=excluded.nome, descricao=excluded.descricao,
  quantidade_faturada_galinha=excluded.quantidade_faturada_galinha,
  quantidade_faturada_codorna=excluded.quantidade_faturada_codorna,
  quantidade_retorno=excluded.quantidade_retorno, motivo_id=excluded.motivo_id,
  observacao=excluded.observacao, status=excluded.status, fotos=excluded.fotos;

insert into public.nfd_desconhecimentos (
  id, loja_id, usuario_id, nfd_referencia, nfd_chave_acesso,
  nfd_numero, loja_codigo, comentario
)
values (
  '70000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000004',
  'HOM-900001-990099', 'HOM-900001-990099', '990099', '900001',
  'DESCONHECIMENTO SINTETICO PARA VALIDACAO'
)
on conflict (id) do update set comentario=excluded.comentario;
