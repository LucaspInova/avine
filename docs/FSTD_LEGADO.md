# FSTD legado

O histórico da aba `IMPORTAR_LEGADO` é carregado pela migration `20260810120000_create_fstd_legado.sql` na tabela `public.fstd_legado`. A coluna `id` mantém a chave lógica `codigo_loja - numero_nfd`; `legado_id` é apenas uma chave técnica para preservar os 54.058 registros importados, inclusive os 22 IDs repetidos encontrados na planilha.

A migration `20260810121000_include_fstd_legado_in_status.sql` faz a função gerencial classificar a nota como `Finalizada` quando existe correspondência por loja e NFD, sem criar `fstd_processos`, `fstd_produtos` ou alterar as linhas do fluxo atual. O promotor usa a mesma tabela para marcar a nota e obter os dados do template.

Para FSTDs legadas, o sistema gera uma visualização HTML a partir de `base-legado/template-pdf.html`; os campos `$...` são substituídos pelos valores da linha, o cliente é enriquecido com o nome da tabela `lojas`, e os cálculos de perdido são derivados dos totais menos os retornos. O documento legado não é persistido no bucket nem convertido em processo atual.

Validações executadas: `npm run typecheck`, `npm run lint`, `npm run build` e 16 testes focados. A conexão local do Supabase não estava disponível; a checagem vinculada em dry-run também excedeu o timeout sem aplicar migrations.
