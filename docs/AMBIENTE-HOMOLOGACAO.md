# Ambiente de homologação da FSTD

## Objetivo

Permitir implementação e validação do plano consolidado sem usar dados, contas, banco ou domínio de produção.

## Estrutura adotada

- Código: branch Git `inova/homologacao-plano-fstd`.
- Banco: branch Preview descartável `homologacao-clone-estrutural`, criada sem dados de produção.
- Frontend: Preview da Vercel, ligado à branch Git somente depois que o banco concluiu a reconstrução e passou nos testes de acesso.
- Produção: branch principal, domínio público e projeto Supabase principal permanecem intocados.

## Estado verificado em 5 de setembro de 2026

1. O Supabase CLI foi usado contra o projeto de produção somente para leitura e exportação estrutural.
2. As 76 migrações publicadas possuem correspondência local.
3. Existe uma migração adicional somente local, ainda não publicada: `20260828105725_add_legacy_fstd_totals_adjustments.sql`.
4. A primeira reconstrução por migrações parou após cinco arquivos porque o histórico começou depois de objetos já existentes no banco antigo.
5. Essa branch incompleta foi excluída, interrompendo seu custo.
6. A nova branch recebeu um snapshot somente estrutural dos esquemas `public` e `app_private`, além de extensões, buckets e políticas de Storage, sem registros de produção.
7. A comparação confirmou paridade de tabelas, views, funções, colunas, restrições, índices, políticas e gatilhos entre produção e homologação.
8. O seed sintético foi carregado e os escopos de Admin, Gerencial por UF e Promotor por rota foram validados via API.
9. O Docker Desktop foi usado apenas para executar a ferramenta oficial de exportação de esquema do Supabase CLI.
10. A interface recebeu uma faixa amarela permanente quando `VITE_APP_ENV=homologacao`; ela não aparece em produção.
11. O build da Vercel seleciona o arquivo `.env.homologacao` somente na branch Git de homologação. Em qualquer outra branch, mantém o modo de produção e as variáveis configuradas na Vercel.

## Endereços operacionais

- Branch Git: `inova/homologacao-plano-fstd`.
- Frontend Preview: `https://fstddigital-git-inova-homologacao-8785a8-luiz-robertos-projects.vercel.app`.
- Supabase Preview: `https://binxgymusventbechztf.supabase.co`.

O Preview da Vercel está protegido. Pessoas autenticadas na equipe acessam o endereço estável; para uma validação externa pontual, deve-se gerar um link temporário no painel da Vercel.

## Contas sintéticas

Todas usam a senha de teste `FstdTeste2026!` e existem somente na branch descartável:

- `admin@homologacao.avine.test`
- `gerencial.ce@homologacao.avine.test`
- `gerencial.ba@homologacao.avine.test`
- `promotor.ce1@homologacao.avine.test`
- `promotor.ce2@homologacao.avine.test`
- `promotor.inativo@homologacao.avine.test`

A conta inativa autentica no provedor, mas é bloqueada pelo perfil público, que é o comportamento atual a ser endurecido no plano.

Para repetir a validação de login e RLS sem registrar a senha no repositório,
defina `FSTD_TEST_PASSWORD` somente no processo atual e execute:

```text
npm run verify:homologacao
```

O script aborta se a URL não corresponder ao projeto
`binxgymusventbechztf` e não realiza mutações.

## Proteções obrigatórias

- Não usar chaves, usuários, arquivos ou dados de produção.
- Não habilitar crons nem sincronizações com API ou Google Sheets até existir uma fonte controlada de teste.
- Não configurar o Preview da Vercel enquanto a reconstrução do banco estiver incompleta.
- Nunca adicionar chave `service_role`, senha ou segredo ao arquivo `.env.homologacao`; as duas credenciais nele são públicas e incorporadas ao frontend por definição.
- Manter a publicação em produção manual e condicionada a autorização específica.
- Mostrar `HOMOLOGAÇÃO` de forma permanente na interface de teste antes da validação por usuários.

## Ciclo operacional

1. Criar ou recriar a branch Preview do Supabase sem dados de produção.
2. Exportar o snapshot estrutural corrente e aplicar os arquivos versionados de baseline.
3. Instalar extensões, buckets e políticas estruturais que ficam fora do esquema público.
4. Carregar o seed e as fixtures sintéticas.
5. Executar testes de banco e teste de fumaça.
6. Configurar a Vercel Preview exclusivamente com a URL e a chave publicável da branch.
7. Implementar e validar lotes na branch Git isolada.
8. Registrar resultados, riscos residuais e evidências.
9. Excluir a branch Supabase ao finalizar o ciclo para interromper a cobrança.

## Critério para liberar o Preview

O frontend de homologação só será disponibilizado quando:

- o baseline estrutural reproduzir o estado atual e as novas mudanças forem feitas por migrações rastreáveis;
- os testes de banco passarem;
- existirem apenas contas e dados sintéticos;
- crons e integrações reais estiverem desativados;
- as variáveis do Preview apontarem exclusivamente para a branch descartável.

## Validação técnica atual

- O commit `3fba004` passou integralmente no GitHub Actions: lint, tipos, 229
  testes de frontend, build, bundle, Playwright, recriação do banco, 260 testes
  pgTAP, lint SQL e comparação dos tipos gerados.
- As 23 migrações da homologação e as quatro Edge Functions esperadas estão
  presentes na branch remota.
- O Supabase remoto contém somente as seis contas e os cenários sintéticos
  versionados.
- O orçamento global de 450 KB é respeitado; a entrada Gerencial mede 136.146
  bytes brutos e 37.364 bytes em gzip.
- O Advisor não apresenta erro. RPCs autenticadas `SECURITY DEFINER` continuam
  sinalizadas genericamente, mas nenhuma é executável por `anon` e todas as
  expostas a `authenticated` possuem verificação explícita de autorização.
- Avisos de índices sem uso não justificam remoção numa base sintética pequena;
  a decisão depende de medição posterior com volume representativo.
- A tela pública e a faixa de homologação foram verificadas no navegador. O
  percurso autenticado por perfil está documentado em
  `docs/ROTEIRO-VALIDACAO-HOMOLOGACAO-FSTD.md` e permanece como último gate.
- O problema local do Docker continua isolado do projeto; o CI Linux é a
  validação reprodutível e autoritativa do banco descartável.

## Custo

A branch custa US$ 0,01344 por hora enquanto existir. Ela deve ser excluída ao fim do ciclo; não dependeremos do repouso automático como garantia de custo zero.
