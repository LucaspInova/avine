# Supabase

O Supabase é a fonte operacional principal do FSTD Avine. Sheets, JotForm e Looker Studio devem ser tratados como integrações/importações, não como banco permanente do app.

## Schema Atual

### `usuarios`

Cadastro operacional compartilhado por Gerencial, Promotor e Entregador.

Campos principais: `id`, `auth_user_id`, `email`, `nome`, `perfil`, `estado`, `fotos_habilitadas`, `foto_url`, `ativo`, `created_at`.

Perfis válidos:

- `Gerencial`
- `Promotor`
- `Entregador`

### `lojas`

Cadastro de lojas/PDVs exibido no gerencial.

Campos principais: `id`, `codigo`, `nome`, `uf`, `cidade`, `created_at`.

### `loja_promotores`

Vínculo entre lojas e promotores.

- `loja_id`
- `promotor_id`
- `posicao` com valores 1, 2 ou 3

### Auth Gerencial

- `usuarios.auth_user_id` faz referência a `auth.users`.
- `public.is_current_user_gerencial_ativo()` identifica usuários gerenciais ativos.
- Edge Function `create-gerencial-user` cria usuário de Auth e chama RPC segura para registrar o perfil gerencial.

## Schema FSTD Adicionado

### `motivos_devolucao`

Lista administrável de motivos usados pelo formulário FSTD.

### `nfds`

Notas fiscais de devolução importadas.

Status operacional e calculado pela view `nfds_com_status`.

### `fstds`

Solicitações FSTD vinculadas a loja, promotor, motivo e opcionalmente a uma NFD.

Status:

- `solicitada`
- `validada`
- `cancelada`
- `recolhida`

### `fstd_itens`

Itens por produto:

- `GAL`
- `COD`
- `SIU`

### `fstd_fotos`

Metadados de fotos anexadas. O arquivo deve ficar em Supabase Storage; esta tabela guarda o `storage_path`.

### `recolhimentos`

Fila logística derivada de cada FSTD.

Status:

- `solicitado`
- `roteirizado`
- `recolhido`
- `cancelado`

### `nfd_desconhecimentos`

Histórico das movimentações enviadas pelo promotor no botão **Desconheço NFD**.

O fluxo grava uma linha por envio com:

- `promotor_id` e `loja_id`, protegidos por RLS;
- `nfd_referencia` no formato usado pelo app (`codigo_cliente:nota_fiscal`);
- `nfd_chave_acesso`, `nfd_numero`, `loja_codigo` e `comentario`;
- `created_at` para auditoria do momento do envio.

Promotores só podem inserir e consultar seus próprios registros em lojas atribuídas. Usuários gerenciais ativos podem consultar o histórico.

## View `nfds_com_status`

Classifica NFDs para o gerencial:

- `finalizada`: existe FSTD ativa para a NFD.
- `avulsa`: NFD marcada com `origem = 'avulsa'`.
- `atrasada`: sem FSTD ativa e emissão anterior a 21 dias.
- `outros`: demais NFDs.

A view usa `security_invoker = true` para respeitar RLS das tabelas base.

## RPC `solicitar_fstd(...)`

Usada pelo fluxo FSTD para registrar uma devolução.

Argumentos:

- `p_loja_id`
- `p_motivo_id`
- `p_nfd_id`
- `p_quantidade_gal`
- `p_quantidade_cod`
- `p_quantidade_siu`
- `p_fotos`
- `p_observacao`

Comportamento:

1. Identifica o promotor autenticado por `auth.uid()`.
2. Confirma que a loja está atribuída ao promotor.
3. Valida motivo ativo e NFD da mesma loja.
4. Garante pelo menos uma quantidade positiva.
5. Cria FSTD, itens, fotos e recolhimento na mesma transação.

## RLS e Data API

Regras práticas adotadas:

- RLS habilitado em toda tabela exposta no schema `public`.
- `anon` sem acesso às tabelas operacionais.
- `authenticated` recebe grants explícitos para tabelas e view usadas pelo app.
- Gerencial ativo administra cadastros e dados operacionais.
- Promotor acessa apenas seu próprio usuário, suas lojas vinculadas e NFDs/FSTDs dessas lojas.
- Functions expostas recebem `GRANT EXECUTE` explícito.

Referências oficiais:

- Securing your API: https://supabase.com/docs/guides/api/securing-your-api
- Row Level Security: https://supabase.com/docs/guides/database/postgres/row-level-security
- Changelog Data API/grants: https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically

## Próximas Validações

- Aplicar migrations em banco local/remoto.
- Rodar advisors de segurança/performance.
- Gerar `src/types/database.types.ts` a partir do banco aplicado.
- Testar login Gerencial e Promotor com RLS real.
- Criar bucket e policies de Storage para fotos FSTD.
