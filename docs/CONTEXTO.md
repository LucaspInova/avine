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
5. Promotor solicita FSTD informando motivo, quantidades GAL/COD/SIU e fotos.
6. Supabase grava FSTD, itens, fotos e recolhimento em uma unica transacao.
7. Gerencial valida a solicitacao, organiza recolhimento e acompanha indicadores.

## Mapa Glide -> Sistema Programado

| Glide / Sheets | React + Supabase |
| --- | --- |
| `AVINE - USERS` | `usuarios` |
| `AVINE - LOJAS` / `Rota Geral` | `lojas` |
| `PROMOTOR1/2/3` | `loja_promotores.posicao` |
| `AVINE - MOTIVOS` | `motivos_devolucao` |
| `Import NFD (21-Dias)` / `QUERY NFD` | `nfds` + view `nfds_com_status` |
| `FSTD DIGITAL` | `fstds`, `fstd_itens`, `recolhimentos` |
| `AVINE - FOTOS` | `fstd_fotos` + Supabase Storage |
| `WEB EMBED` | modulo Relatorios / Looker Studio |
| Workflow `Fazer FSTD` | RPC `solicitar_fstd(...)` |
| Workflow `NewUser` | Edge Function `create-gerencial-user` e CRUD gerencial |
| Workflow `NewLoja` | CRUD `lojas` e `loja_promotores` |

## Estado Real Do Projeto

- O repositorio atual e um app React/Vite.
- O painel gerencial ja possui autenticacao, perfil, usuarios, lojas e roteirizacao.
- A pasta `mobile/` existe como reserva historica, mas o primeiro mobile sera PWA dentro do mesmo app React.
- O Supabase ja possui migrations para usuarios, lojas, vinculos e usuario gerencial.
- A base FSTD foi adicionada por migration dedicada e ainda precisa ser aplicada/validada no banco alvo antes de operar em producao.
