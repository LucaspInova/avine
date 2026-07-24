# Supabase

O projeto remoto Avine e tratado como producao. Alteracoes de schema devem ser
feitas por migrations, testadas localmente e nunca por reset do banco remoto.

## Modelo operacional

- `usuarios`: perfil operacional. `ativo` controla o cadastro e
  `acesso_habilitado` controla se o perfil pode autenticar no aplicativo.
- `lojas` e `loja_promotores`: lojas e atribuicoes de Promotores.
- `nfd_itens`: fonte sincronizada de notas e produtos.
- `produtos` e `produtos_expandidos`: catalogo vinculado aos codigos da NFD.
- `fstd_processos`, `fstd_produtos` e `fstd_produto_motivos`: fluxo FSTD atual.
- `nfd_desconhecimentos`: declaracoes de NFD nao reconhecida.
- `motivos_devolucao`: catalogo administravel de motivos.
- `nfd_logs`: log interno da sincronizacao.

`fstds` pertence ao dominio anterior e o cliente nao recebe grants para usa-la.
`solicitar_fstd` e seus overloads antigos ja foram removidos depois da
verificacao de chamadas; a remocao fisica da tabela fica para uma entrega
posterior.

## Autenticacao e usuarios

Contas nao sao criadas em migrations. O frontend Gerencial usa a Edge Function
`manage-users`, que:

1. valida o JWT do chamador;
2. confirma um perfil Gerencial ativo e com acesso habilitado;
3. cria/atualiza a conta pela Admin API;
4. sincroniza o perfil operacional;
5. bloqueia a conta no Auth quando o acesso e desabilitado.

`create-gerencial-user` permanece temporariamente para compatibilidade com o
frontend publicado anteriormente. Novos clientes nao devem usa-la.

## Fluxo Promotor

As quatro operacoes transacionais atuais sao:

- `iniciar_fstd_produtos_v2(uuid, text)`;
- `concluir_fstd_produto(uuid, jsonb, text, jsonb)`;
- `editar_fstd_produto(uuid, jsonb, integer, integer, text, jsonb)`;
- `finalizar_fstd_produtos(uuid)`.

Elas usam `SECURITY DEFINER`, `search_path = ''`, referencias qualificadas e
validacao explicita de `auth.uid()`. A RPC v2 deriva numero, produtos e
quantidades de `nfd_itens`, serializa concorrencia por NFD e valida a atribuicao
da loja.

`iniciar_fstd_produtos(uuid, text, text, jsonb)` e um wrapper temporario. Os
campos controlados pelo cliente sao ignorados, portanto uma versao antiga do
frontend nao consegue forjar produtos ou quantidades.

## RLS, grants e Storage

- `anon` nao tem acesso a tabelas, sequencias ou RPCs operacionais.
- `authenticated` recebe somente os grants usados pelo app.
- o helper recursivo de autorizacao fica em `app_private`, fora da Data API;
- views expostas usam `security_invoker = true`;
- o bucket `fstd-fotos` e privado;
- Promotores escrevem e excluem apenas na propria pasta;
- Promotores leem suas fotos e Gerenciais ativos leem todas as evidencias.

`nfd_logs` tem RLS habilitado sem policy de cliente por decisao intencional. A
tabela e acessada somente pela sincronizacao com service role; o aviso
`rls_enabled_no_policy` do advisor e esperado.

Os defaults de objetos criados por `postgres` no schema `public` revogam
privilegios de `PUBLIC`, `anon` e `authenticated`. Os defaults pertencentes ao
papel gerenciado `supabase_admin` exigem privilegio de owner no painel/plataforma
e devem ser revisados quando esse acesso estiver disponivel.

## Desenvolvimento e verificacao

```bash
npx supabase@2.109.1 start
npx supabase@2.109.1 db reset
npx supabase@2.109.1 test db
npx supabase@2.109.1 db lint --level error
npx supabase@2.109.1 gen types typescript --local > /tmp/database.types.ts
diff --strip-trailing-cr /tmp/database.types.ts src/types/database.types.ts
```

O CI executa esses comandos com PostgreSQL 17 e Node 22. O teste pgTAP cobre
RLS, IDOR, adulteracao de NFD/produto, quantidades, fotos, finalizacao e
integridade.

## Referencias

- [Seguranca da Data API](https://supabase.com/docs/guides/api/securing-your-api)
- [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Testes locais com pgTAP](https://supabase.com/docs/guides/local-development/testing/overview)
- [Protecao de senhas](https://supabase.com/docs/guides/auth/password-security)
