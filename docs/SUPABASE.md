# Supabase

O Supabase e a fonte operacional principal do FSTD Avine. Sheets, JotForm e Looker Studio devem ser tratados como integracoes/importacoes, nao como banco permanente do app.

## Schema Atual

### `usuarios`

Cadastro operacional compartilhado por Gerencial, Promotor e Entregador.

Campos principais: `id`, `auth_user_id`, `email`, `nome`, `perfil`, `estado`, `fotos_habilitadas`, `foto_url`, `ativo`, `created_at`.

Perfis validos:

- `Gerencial`
- `Promotor`
- `Entregador`

### `lojas`

Cadastro de lojas/PDVs exibido no gerencial e no mobile.

Campos principais: `id`, `codigo`, `nome`, `uf`, `cidade`, `created_at`.

### `loja_promotores`

Vinculo entre lojas e promotores.

- `loja_id`
- `promotor_id`
- `posicao` com valores 1, 2 ou 3

### Auth Gerencial

- `usuarios.auth_user_id` referencia `auth.users`.
- `public.is_current_user_gerencial_ativo()` identifica usuarios gerenciais ativos.
- Edge Function `create-gerencial-user` cria usuario de Auth e chama RPC segura para registrar o perfil gerencial.

## Schema FSTD Adicionado

### `motivos_devolucao`

Lista administravel de motivos usados pelo formulario FSTD.

### `nfds`

Notas fiscais de devolucao importadas.

Status operacional e calculado pela view `nfds_com_status`.

### `fstds`

Solicitacoes FSTD vinculadas a loja, promotor, motivo e opcionalmente a uma NFD.

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

Fila logistica derivada de cada FSTD.

Status:

- `solicitado`
- `roteirizado`
- `recolhido`
- `cancelado`

## View `nfds_com_status`

Classifica NFDs para o mobile e gerencial:

- `finalizada`: existe FSTD ativa para a NFD.
- `avulsa`: NFD marcada com `origem = 'avulsa'`.
- `atrasada`: sem FSTD ativa e emissao anterior a 21 dias.
- `outros`: demais NFDs.

A view usa `security_invoker = true` para respeitar RLS das tabelas base.

## RPC `solicitar_fstd(...)`

Usada pelo PWA Promotor para registrar uma devolucao.

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
2. Confirma que a loja esta atribuida ao promotor.
3. Valida motivo ativo e NFD da mesma loja.
4. Garante pelo menos uma quantidade positiva.
5. Cria FSTD, itens, fotos e recolhimento na mesma transacao.

## RLS E Data API

Regras praticas adotadas:

- RLS habilitado em toda tabela exposta no schema `public`.
- `anon` sem acesso as tabelas operacionais.
- `authenticated` recebe grants explicitos para tabelas e view usadas pelo app.
- Gerencial ativo administra cadastros e dados operacionais.
- Promotor acessa apenas seu proprio usuario, suas lojas vinculadas e NFDs/FSTDs dessas lojas.
- Functions expostas recebem `GRANT EXECUTE` explicito.

Referencias oficiais:

- Securing your API: https://supabase.com/docs/guides/api/securing-your-api
- Row Level Security: https://supabase.com/docs/guides/database/postgres/row-level-security
- Changelog Data API/grants: https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically

## Proximas Validacoes

- Aplicar migrations em banco local/remoto.
- Rodar advisors de seguranca/performance.
- Gerar `src/types/database.types.ts` a partir do banco aplicado.
- Testar login Gerencial e Promotor com RLS real.
- Criar bucket e policies de Storage para fotos FSTD.
