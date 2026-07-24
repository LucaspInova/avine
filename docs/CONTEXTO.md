# Contexto FSTD Avine

Este documento registra o negocio e o mapa de migracao dos apps Glide para o sistema React + Supabase.

## Negocio

- Empresa atendida: Avine Alimentos.
- Processo: gestao de devolucao de produtos, especialmente ovos GAL/GL, COD/CD e retornos SIU.
- Tipo padrao de devolucao: `Devolucao`.
- Forma de envio padrao: `pos`.
- UFs em operacao inicial: CE, AL, BA, MA, PA, PE, PB, PI, RN e demais estados conforme expansao.
- Motivos padrao: Avaria na Entrega, Avaria no PDV, Avaria no Deposito, Ovos Vencidos e Ovos Podres.

## Ecossistema Original

| App Glide | Tipo | Usuario | Papel |
| --- | --- | --- | --- |
| FSTD Gerencial | Web desktop | Admin, Comercial, Logistica, Devolucao | Acompanha NFDs, valida FSTD, gerencia usuarios/lojas/rotas, fotos, recolhimento e BI. |
| FSTD Digital | Mobile | Promotores e motoristas | Consulta lojas atribuidas e solicita retorno/FSTD em campo. |

Os apps originais compartilhavam dados por Google Sheets (`FSTD Digital`) e Glide Tables da Inova Enterprise. Na migracao, esses dados passam para o Supabase.

## Papeis

- Gerencial: usuario interno ativo com `usuarios.perfil = 'Gerencial'`; administra cadastros e dados operacionais.
- Promotor: usuario operacional com `usuarios.perfil = 'Promotor'`; acessa apenas suas lojas vinculadas em `loja_promotores`.
- Entregador: usuario operacional previsto para fluxo logistico/recolhimento; inicialmente cadastrado no mesmo modulo de usuarios.

## Fluxo Devolucao

1. Importacao cria ou atualiza NFDs no Supabase.
2. Promotor faz login no PWA.
3. App lista apenas lojas vinculadas ao promotor.
4. Promotor abre loja e visualiza NFDs por status: atrasada, finalizada, avulsa ou outros.
5. O servidor deriva produtos e quantidades diretamente de `nfd_itens`.
6. Promotor informa motivos, retornos, observacao e fotos produto a produto.
7. Supabase valida propriedade, somas e evidencias antes de finalizar o processo.

## Mapa Glide -> Sistema Programado

| Glide / Sheets | React + Supabase |
| --- | --- |
| `AVINE - USERS` | `usuarios` |
| `AVINE - LOJAS` / `Rota Geral` | `lojas` |
| `PROMOTOR1/2/3` | `loja_promotores.posicao` |
| `AVINE - MOTIVOS` | `motivos_devolucao` |
| `Import NFD (21-Dias)` / `QUERY NFD` | `nfd_itens` + view `nfd_notas` |
| `FSTD DIGITAL` | `fstd_processos`, `fstd_produtos`, `fstd_produto_motivos` |
| `AVINE - FOTOS` | bucket privado `fstd-fotos` |
| `WEB EMBED` | oculto ate existir integracao real |
| Workflow `Fazer FSTD` | RPCs transacionais do fluxo por produto |
| Workflow `NewUser` | Edge Function `manage-users` |
| Workflow `NewLoja` | CRUD `lojas` e `loja_promotores` |

## Estado Real Do Projeto

- O repositorio atual e um app React/Vite.
- O painel gerencial ja possui autenticacao, perfil, usuarios, lojas e roteirizacao.
- A rota `/promotor` possui login, lojas vinculadas, consulta de NFDs e fluxo
  produto a produto protegido por RPC.
- O Supabase de producao usa RLS, grants explicitos, Storage privado e
  `acesso_habilitado` separado do cadastro operacional.
- Relatorio e Notas mockados estao ocultos ate receberem uma fonte real.
