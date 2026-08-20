# FSTD legado

O histórico da aba `IMPORTAR_LEGADO` é carregado pela migration `20260810120000_create_fstd_legado.sql` na tabela `public.fstd_legado`. A coluna `id` mantém a chave lógica `codigo_loja - numero_nfd`; `legado_id` é apenas uma chave técnica para preservar os 54.058 registros importados, inclusive os 22 IDs repetidos encontrados na planilha.

A migration `20260810121000_include_fstd_legado_in_status.sql` faz a função gerencial classificar a nota como `Finalizada` quando existe correspondência por loja e NFD, sem criar `fstd_processos`, `fstd_produtos` ou alterar as linhas do fluxo atual. O promotor usa a mesma tabela para marcar a nota e obter os dados do template.

Para FSTDs legadas, o sistema gera uma visualização HTML a partir de `base-legado/template-pdf.html`; os campos `$...` são substituídos pelos valores da linha, o cliente é enriquecido com o nome da tabela `lojas`, e os cálculos de perdido são derivados dos totais menos os retornos. O documento legado não é persistido no bucket nem convertido em processo atual.

O arquivo de upload `base-legado/fstd_legado_upload.csv` usa inteiros nas colunas de quantidade, tratando pontos e vírgulas em valores textuais como separadores de milhar. A linha `IMPORTAR_LEGADO!4157`, que continha o valor inválido `268p90`, foi removida integralmente do CSV.

## Complemento `COPIA V1`

A fonte complementar [Export FSTD](https://docs.google.com/spreadsheets/d/1nY6DIL4_PTaxizF60iSY84jGF8zyzvyTrLyJ8V32tK0/edit) continua sendo alimentada pelo Glide antigo. Em 20/08/2026, a aba `COPIA V1` continha 9.684 linhas e 9.341 pares distintos de loja e NFD. A reconciliação incremental encontrou 377 pares presentes no sistema novo que ainda não tinham registro legado e os incluiu no lote `copia-v1-20260820-*`.

A migration `20260820132313_reconcile_copia_v1_legacy_import.sql` consolida o staging em `public.fstd_legado`. O campo `source_hash` identifica cada linha da fonte, recebe índice único parcial e torna a operação idempotente: reexecutar a consolidação não cria duplicatas. O staging não é exposto a `anon` ou `authenticated`, e as políticas de leitura de `fstd_legado` continuam inalteradas.

A migration `20260820141043_import_current_copia_v1_finalized_notes.sql` reconcilia o snapshot atual por par loja/NFD e faz a finalização legada prevalecer sobre uma eventual marcação antiga de NFD desconhecida. O histórico já importado é preservado mesmo quando a aba dinâmica muda de ordem ou deixa de exibir uma linha antiga.

Para rollback operacional, primeiro exporte os hashes afetados e valide a contagem. Uma migration forward-only pode então remover exclusivamente as linhas com `origem = 'COPIA V1'` e `source_hash` pertencente ao lote auditado; não use a chave lógica `codigo_loja - numero_nfd`, pois a fonte preserva ocorrências repetidas.

Validações executadas: consulta autenticada do RPC, reconciliação integral dos pares atuais da planilha, testes focados, `npm run typecheck` e `npm run build`. O lint possui uma falha preexistente de pureza em `PromotorWorkspace.jsx`.
