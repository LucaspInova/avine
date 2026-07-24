# FSTD Avine

Sistema de gestao de devolucoes da Avine Alimentos, em migracao dos apps Glide para uma aplicacao React + Supabase. O projeto passa a tratar o Supabase como fonte operacional principal; Google Sheets, JotForm e Looker Studio ficam como integracoes, importacoes ou visualizacoes externas.

## Apps

| App | Rota | Publico | Objetivo |
| --- | --- | --- | --- |
| FSTD Gerencial | `/gerencial` ou `/` | Admin, Comercial, Logistica e Devolucao | Administrar usuarios, lojas, vinculos, notas, motivos, fotos, recolhimento, logs e relatorios. |
| FSTD Digital | `/promotor` | Promotores | Consultar lojas vinculadas, NFDs por status e solicitar FSTD via Supabase RPC. |

## Stack

- React 19 + Vite.
- Supabase Auth, Postgres, RLS, Edge Functions e Data API.
- Integracoes planejadas: importacao de Google Sheets/JotForm e embed ou consulta de indicadores Looker Studio.

## Estado Atual

- Gerencial funcional para usuarios, lojas e vinculos; Relatorio e Notas permanecem ocultos ate terem dados reais.
- Promotor usa `iniciar_fstd_produtos_v2`, que deriva NFD, produtos e quantidades no servidor.
- `manage-users` centraliza criacao, edicao e bloqueio de acesso com validacao Gerencial.
- Cadastro operacional (`usuarios`) e acesso (`acesso_habilitado`) sao estados separados.
- RLS, grants explicitos, Storage privado e funcoes transacionais protegem os dados operacionais.
- Migrations locais e remotas usam a mesma linha do tempo; prototipos nao implantados ficam arquivados fora de `supabase/migrations`.
- Vitest, Playwright, pgTAP, audit, lint, typecheck, build e orçamento de bundle rodam no CI.

## Comandos

```bash
nvm use
npm ci
npm run dev
```

Antes de iniciar, crie o arquivo `.env.local` a partir de `.env.example` e preencha as credenciais publicáveis do projeto Supabase:

```bash
cp .env.example .env.local
npm run dev
npm run verify
npm run test:e2e
```

Supabase:

```bash
supabase migration list --local
supabase db reset
supabase test db
supabase db lint --level error
```

Depois de aplicar migrations no banco alvo, gere novamente os tipos:

```bash
supabase gen types typescript --linked --schema public > src/types/database.types.ts
```

## Documentacao

- [Contexto](docs/CONTEXTO.md)
- [Supabase](docs/SUPABASE.md)

## Modelo Operacional

1. `sync-devolucoes-avine` importa NFDs e atualiza lojas no servidor.
2. Gerencial administra perfis, contas de acesso, lojas e vinculos.
3. Promotor acessa somente lojas e NFDs liberadas pela RLS.
4. `iniciar_fstd_produtos_v2` cria o processo usando exclusivamente dados de `nfd_itens`.
5. As RPCs de conclusao, edicao e finalizacao validam propriedade, somas e fotos.

## Referencias Supabase

- Securing your API: https://supabase.com/docs/guides/api/securing-your-api
- Row Level Security: https://supabase.com/docs/guides/database/postgres/row-level-security
- Changelog de grants/Data API: https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically
