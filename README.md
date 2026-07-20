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

- Painel gerencial implementado para login, perfil, usuarios, lojas e ate 3 promotores por loja.
- Roteamento React adicionado para separar `/gerencial` e `/promotor`.
- App Promotor inicial implementado com login, lojas vinculadas por RLS, NFDs por status e formulario de solicitacao via RPC `solicitar_fstd`.
- TanStack Query adicionado para cache e invalidacao de consultas operacionais.
- Edge Function `create-gerencial-user` usada para criar usuarios de Auth gerencial de forma controlada.
- Migrations existentes criam `usuarios`, `lojas`, `loja_promotores`, auth gerencial e RLS base.
- Nova base de dominio FSTD adiciona `motivos_devolucao`, `nfds`, `fstds`, `fstd_itens`, `fstd_fotos`, `recolhimentos`, view `nfds_com_status` e RPC `solicitar_fstd`.
- Docs em `docs/` descrevem contexto de negocio e Supabase.

## Comandos

```bash
npm install
npm run dev
npm run lint
npm run build
```

Supabase:

```bash
supabase migration list --local
supabase db reset
```

Depois de aplicar migrations no banco alvo, gere novamente os tipos:

```bash
supabase gen types typescript --linked --schema public > src/types/database.types.ts
```

## Documentacao

- [Contexto](docs/CONTEXTO.md)
- [Supabase](docs/SUPABASE.md)

## Modelo Operacional

1. Importacoes alimentam NFDs e dados auxiliares no Supabase.
2. Gerencial administra usuarios, lojas, vinculos, notas, motivos e fotos.
3. Promotor acessa `/promotor`, ve apenas lojas liberadas pela RLS e solicita FSTD.
4. RPC `solicitar_fstd` grava FSTD, itens, fotos e recolhimento na mesma transacao quando o fluxo de solicitacao for usado.
5. Gerencial acompanha validacao, recolhimento, relatorios, fotos e logs.

## Referencias Supabase

- Securing your API: https://supabase.com/docs/guides/api/securing-your-api
- Row Level Security: https://supabase.com/docs/guides/database/postgres/row-level-security
- Changelog de grants/Data API: https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically
