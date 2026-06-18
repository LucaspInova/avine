# PWA Promotor

O primeiro mobile do FSTD sera um PWA React dentro do repositorio atual, com rota separada de experiencia: `/promotor`.

## Objetivo

Permitir que promotores e motoristas em campo consultem lojas atribuidas, acompanhem NFDs por status e solicitem FSTD com motivo, quantidades e fotos.

## Rotas Previstas

| Rota | Tela | Descricao |
| --- | --- | --- |
| `/promotor` | Home | Lista lojas atribuidas ao usuario logado. |
| `/promotor/lojas/:lojaId` | Loja | Mostra abas de NFDs: Atrasadas, Finalizadas, Avulsas e Outros. |
| `/promotor/nfds/:nfdId` | NFD | Detalhe da nota e acao para solicitar FSTD. |
| `/promotor/fstd/nova` | FSTD Avulsa | Solicita FSTD sem NFD de origem. |

No momento, o roteamento e feito no React sem instalar `react-router-dom`; o projeto pode adotar a biblioteca quando a navegacao ficar mais profunda.

## Home De Lojas

Fonte:

- `lojas`
- `loja_promotores`
- view `nfds_com_status`

Regras:

- Promotor ve apenas lojas onde existe vinculo em `loja_promotores`.
- Cada card mostra codigo, nome, cidade/UF e quantidade de notas pendentes.
- Busca por nome, codigo ou cidade.

## Detalhe Da Loja

Abas:

- Atrasadas
- Finalizadas
- Avulsas
- Outros

Cada item de NFD deve exibir:

- numero da NFD
- quantidade
- data de emissao
- valor total quando disponivel
- status visual

Estados vazios devem ser curtos, por exemplo: `0 Notas Pendentes!`.

## Detalhe Da NFD

Mostra dados completos da nota e acao para fazer FSTD quando a NFD ainda nao esta finalizada.

Campos principais:

- loja
- numero
- emissao
- envio
- valor
- quantidade
- status

## Formulario FSTD

Campos:

- motivo de devolucao
- quantidade GAL
- quantidade COD
- quantidade SIU
- fotos
- observacao opcional

Envio:

- Chamar RPC `solicitar_fstd(...)`.
- Usar upload para Supabase Storage antes da RPC quando as fotos reais forem ativadas.
- A primeira versao pode registrar `storage_path` retornado pelo upload.

## Regras De Acesso

- Login Promotor usa Supabase Auth.
- `usuarios.auth_user_id` deve apontar para `auth.users.id`.
- Promotor ativo ve apenas dados das lojas atribuidas.
- Gerencial ativo continua usando `/gerencial`.

## Criterios De Aceite

- Promotor nao acessa lojas de outro promotor.
- Promotor consegue abrir loja, ver NFDs por status e solicitar FSTD.
- Uma falha no formulario nao deixa FSTD parcial sem itens/recolhimento.
- Gerencial passa a ver solicitacoes geradas pelo mobile.
- Build web continua unico para painel e PWA.
