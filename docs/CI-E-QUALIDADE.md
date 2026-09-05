# CI e qualidade da FSTD Digital

## Objetivo

O GitHub Actions é a fonte oficial para saber se uma alteração está pronta para
ser avaliada. Ele fiscaliza o código; não publica automaticamente em produção.

O workflow ativo está em `.github/workflows/ci.yml` e roda:

- a cada envio para `inova/homologacao-plano-fstd`;
- em toda proposta de alteração (pull request);
- em `master`, para preservar a verificação já existente;
- manualmente, pelo botão **Run workflow** no GitHub Actions.

## Bloco Frontend

1. Instala exatamente as versões registradas no `package-lock.json`.
2. Bloqueia vulnerabilidades de severidade alta ou crítica.
3. Verifica padronização do código (lint).
4. Verifica os tipos TypeScript.
5. Executa os testes automatizados de componentes e regras.
6. Gera a aplicação de produção.
7. Compara o tamanho dos pacotes com a referência registrada.
8. Abre o frontend no Chromium e executa os testes de navegação.

O baseline de 05/09/2026 registra 133.997 bytes (36.544 compactados) para a
entrada Gerencial. A referência anterior, de 75.086 bytes, havia ficado
desatualizada após várias alterações já incorporadas ao projeto. O teto global
continua em 450 KB e qualquer crescimento superior a 5% volta a reprovar o CI.
O lote de modularização deve reduzir essa referência; não aumentá-la.

Se o teste de navegador falhar, o relatório fica anexado à execução por sete
dias para facilitar o diagnóstico.

## Bloco Banco de dados

1. Sobe um Supabase descartável dentro do runner do GitHub.
2. Recria o banco a partir do baseline estrutural versionado.
3. Carrega somente dados sintéticos de teste.
4. Executa os testes pgTAP das regras, autorizações e integridade.
5. Analisa funções SQL em busca de erros de execução.
6. Regenera os tipos do banco e compara com o arquivo usado pelo frontend.
7. Desliga e descarta o ambiente local, mesmo quando uma etapa falha.

## Baseline e histórico

O estado estrutural confirmado em 05/09/2026 foi consolidado em cinco
migrações ativas:

1. contratos privados mínimos que resolvem a dependência circular do dump;
2. schema público;
3. implementações completas do schema privado (`app_private`);
4. buckets e políticas do Storage pertencentes à aplicação;
5. ajuste auditável de totais legados que ainda estava somente local.

Os contratos do primeiro passo negam acesso por padrão e são substituídos no
terceiro passo. Eles nunca permanecem como implementação final.

As 77 migrações anteriores continuam preservadas em
`supabase/migrations_legacy_pre_baseline/` para auditoria. Elas não são mais
reexecutadas em bancos vazios porque pressupunham objetos criados manualmente
antes do início do histórico versionado.

Toda mudança nova deve ser uma migração incremental posterior ao baseline. Na
futura publicação em produção, a migração de baseline será marcada como já
aplicada antes de enviar apenas as mudanças incrementais. Essa operação exige
uma autorização específica e não faz parte da homologação.

## Como interpretar

- **Verde:** todas as verificações obrigatórias passaram.
- **Vermelho:** pelo menos uma verificação falhou; abra o job e a etapa marcada.
- **Cinza/amarelo:** execução aguardando ou em andamento; ainda não é aprovação.

Uma execução verde comprova as verificações automatizadas daquele commit. Ela
não substitui o roteiro manual no ambiente de homologação antes da produção.

## Problema local conhecido

Em 05/09/2026, o Docker Desktop 4.84 deste computador não iniciou porque um
socket temporário `dockerInference` ficou inacessível na camada Windows/WSL. O
problema não envolve o repositório nem o Supabase remoto. O CI executa o mesmo
banco descartável em Linux e permanece a validação autoritativa enquanto o
Docker local não for reparado ou atualizado.
