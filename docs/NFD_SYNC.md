# Sincronizacao de NFDs

## Fontes e horarios

| Fonte | Edge Function | Janela padrao | Cron UTC | Horario de negocio |
| --- | --- | --- | --- | --- |
| API Avine | `sync-devolucoes-avine-api` | dia anterior | `0 10 * * *` | horario legado |
| Google Sheets | `sync-devolucoes-avine-sheets` | ultimos 21 dias ate ontem | `0 17 * * *` | 14:00 Brasilia |
| COPIA V1 (Glide) | `sync-fstd-legado-copia-v1` | aba completa | `5,35 * * * *` | a cada 30 min. (minutos 5 e 35) |

As duas funcoes aceitam `due_date=YYYY-MM-DD`. A funcao Sheets tambem aceita
`start_date` e `end_date`, com limite de 31 dias por chamada. A janela movel
permite recuperar dados que entram atrasados na planilha.

Para executar uma carga manual por intervalo via Sheets, use:

```powershell
python scripts\sync_devolucoes_avine_sheets.py 2026-08-01 2026-08-18
```

O script divide automaticamente intervalos maiores que 31 dias em chamadas
sequenciais. A URL da função é derivada de `SUPABASE_PROJECT_ID`; o mesmo
`CRON_SECRET` das funções deve estar disponível no `.env` ou no ambiente.

## Mapeamento da aba `ITENS DA DEVOLUCAO`

| Coluna Sheets | `public.nfd_itens` | Tratamento |
| --- | --- | --- |
| `Estab` | `estabelecimento` | texto obrigatorio |
| `NFD` | `nota_fiscal` | inteiro positivo |
| `Data Emissao` | `data_emissao`, `data_referencia` | `DD/MM/AA` para ISO |
| `Cod Cli` | `codigo_cliente` | inteiro positivo |
| `Nome Abrev` | `nome_abreviado` | texto opcional |
| `Cidade` | `cidade` | texto opcional |
| `UF` | `uf` | maiusculo, dois caracteres |
| `Item Avine` | `codigo_produto` | texto obrigatorio |
| `Descricao do Item Avine` | `descricao_produto` | texto opcional |
| `Quant. Galinha` | `quantidade_galinha` | inteiro nao negativo |
| `Quant Codorna` | `quantidade_codorna` | inteiro nao negativo |
| `Valor Galinha` | `valor_galinha` | decimal nao negativo |
| `Valor Codorna` | `valor_codorna` | decimal nao negativo |
| calculado | `valor` | `valor_galinha + valor_codorna` |
| `CHAVE` | `chave_acesso` | exatamente 44 digitos |

`Cliente/NFD`, razao social, CNPJ, canal de venda, item/descricao do fornecedor
e CFOP nao fazem parte do contrato atual de `nfd_itens` e sao ignorados.

## Mapeamento da aba `COPIA V1`

A funcao de legado grava somente em `public.fstd_legado`: `NFD`, `FSTD`,
`ID` (incluindo o codigo da loja), `Data da Baixa`, `Responsavel FSTD`,
`Motivo da Emissao` e as quatro quantidades de galinha/codorna. `origem` e
sempre `COPIA V1`. Data de emissao, valores, motorista e nome abreviado nao
possuem coluna nessa tabela e nao sao gravados.

O `ID` precisa seguir `codigo da loja - NFD` e conferir com a coluna `NFD`.
A comparacao considera todos os campos suportados e a ocorrencia de cada
registro repetido. O hash de origem e estavel entre execucoes, por isso uma
reexecucao nao duplica registros; registros que desaparecerem da planilha sao
mantidos e anotados como divergencia no log.

## Tratamento e idempotencia

A planilha e consultada pelo endpoint publico do Google Visualization com
filtro de data executado pelo proprio Google. Isso evita baixar mais de 200 mil
linhas e dispensa credenciais da Google Sheets API enquanto o compartilhamento
por link permanecer habilitado.

Linhas da planilha com a mesma `(CHAVE, Item Avine)` sao agregadas somando
quantidades e valores. Linhas invalidas, incluindo placeholders `#N/D`, sao
ignoradas e amostradas em `nfd_logs.detalhes_invalidos`.

A restricao unica existente em `(chave_acesso, codigo_produto)` continua sendo
a garantia final contra concorrencia e retries. Ambas as funcoes usam conflito
`DO NOTHING`: dados existentes nao sao sobrescritos, e
`registros_processados` representa somente novas linhas inseridas.

## Seguranca e operacao

- `nfd_itens` preserva RLS e grants existentes; as funcoes escrevem com secret
  server-side e nunca expõem a chave privilegiada ao frontend.
- `nfd_logs` permanece sem policy de cliente e registra `fonte = api | sheets | copia_v1`.
- O header do cron usa `avine_cron_secret` no Supabase Vault. A migration tenta
  migrar o valor do job legado sem gravar o segredo no repositorio.
- Se a planilha deixar de ser publica, o fallback falhara de forma explicita.
  Nesse caso, migrar para Google Sheets API com uma conta de servico de acesso
  somente leitura e guardar as credenciais nos secrets da Edge Function.

## Criterios de aceite

1. Uma data ausente no banco e presente na planilha gera novas linhas.
2. Reexecutar qualquer fonte nao aumenta a contagem dessas mesmas chaves.
3. Duplicatas parciais da planilha resultam em um item com valores somados.
4. Registros invalidos aparecem no log sem impedir os registros validos.
5. API e Sheets geram logs com fontes distintas.
6. RLS, consultas gerenciais e fluxo FSTD continuam consumindo o mesmo contrato
   de `nfd_itens`.
