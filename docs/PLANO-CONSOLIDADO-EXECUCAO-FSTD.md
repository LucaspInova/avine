# Plano consolidado de evolução da FSTD

> Consolidado em 05/09/2026 a partir das 19 decisões funcionais validadas. Este documento organiza uma execução futura, mas **não autoriza implementação, migração, saneamento de dados ou publicação**.

## 1. Objetivo

Evoluir a aplicação FSTD com segurança, corrigindo autoria e PDF, autorização, conciliação de avulsas, navegação, convivência entre coleta agregada e por produto, cadastros automáticos e melhorias operacionais sem resolver um problema à custa de outro fluxo já funcional.

O plano usa quatro princípios:

1. preservar dados e autoria antes de modificar estruturas;
2. separar mudanças técnicas de mudanças de regra de negócio sempre que possível;
3. provar cada comportamento no frontend e no backend;
4. liberar alterações amplas gradualmente, com medição e possibilidade de recuo.

## 2. Situação consolidada

- **19 pontos discutidos e funcionalmente decididos.**
- **0 decisões funcionais pendentes** dentro deste levantamento.
- O ponto 1 foi fechado com o estado `Revisão pendente` para avulsas cuja loja e número conciliam, mas cujos produtos ou quantidades divergem.
- A futura migração completa das informações ainda existentes no Glide é uma frente separada.
- API e Google Sheets continuarão com o comportamento atual de ignorar itens já existentes até uma decisão futura específica.
- Nenhuma alteração funcional ou publicação foi realizada durante o planejamento.

## 3. Ordem de prioridade proposta

Esta ordem considera risco operacional, segurança, dependências e prioridades declaradas pelo proprietário. A sequência de lotes da seção seguinte pode agrupar pontos inseparáveis.

| Ordem | Ponto | Tema | Prioridade |
|---:|---:|---|---|
| 1 | 14 | Autoria, materialização e desempenho do PDF | Urgente |
| 2 | 13 | Criado por, atualizado por e filtros | Urgente — dependência do ponto 14 |
| 3 | 8 | Hierarquia de perfis e remoção da elevação antiga | Urgente |
| 4 | 10 | Escopo de leitura por rota, UF e perfil | Urgente |
| 5 | 11 | Desativação imediata de usuário e sessão | Urgente |
| 6 | 15 | CI, dependências, testes e desempenho | Urgente — proteção transversal |
| 7 | 12 | URLs, navegação e modularização | Alta |
| 8 | 1 | FSTD avulsa e conciliação | Alta |
| 9 | 19 | Correções após envio e exceção da avulsa divergente | Alta — inseparável do ponto 1 |
| 10 | 2 | Modos agregado e por produto | Alta |
| 11 | 5 | Lojas automáticas e gestão de produtos | Alta; lojas antes de produtos |
| 12 | 17 | Ajuste de totais legados ausente no banco publicado | Média |
| 13 | 4 | Período padrão do Dashboard | Média e rápida |
| 14 | 16 | Somente Promotores em rotas | Média |
| 15 | 3 | Desconhecimentos sem duplicidade e comentários | Baixa nesta etapa |
| 16 | 6 | Observações logísticas em campo único | Baixa |
| 17 | 7 | Promotores por loja sem limite fixo | Baixa |
| 18 | 9 | Evolução da senha inicial | Adiada |
| 19 | 18 | Histórico concluído sem foto | Sem intervenção |

## 4. Estratégia de prevenção de regressões

### 4.1 Barreiras obrigatórias para todos os lotes

1. **Linha de base antes da mudança:** registrar contagens, estados, consultas, tempos e comportamento atual dos fluxos afetados.
2. **Pull requests pequenos:** um ponto ou conjunto realmente inseparável por mudança; não misturar limpeza, refatoração e regra de negócio sem necessidade.
3. **Migrações compatíveis:** preferir adição e convivência temporária; remover estruturas antigas somente quando não houver consumidores.
4. **Dados protegidos:** exportar candidatos antes de qualquer saneamento e utilizar na alteração futura exatamente o predicado revisado.
5. **Homologação isolada:** usar dados sintéticos, usuários de teste e integrações controladas antes de tocar produção.
6. **Matriz de acesso:** testar Promotor, Gerencial dentro e fora da UF e Admin; incluir chamadas diretas ao banco, RPCs e Edge Functions.
7. **Concorrência e idempotência:** testar duplo clique, duas sessões e reexecução de importadores ou RPCs.
8. **Contrato entre camadas:** banco, tipos, repositórios, telas, Dashboard e PDF avançam juntos quando compartilham o mesmo dado.
9. **Gate de entrega:** lint, tipos, testes, build, banco, navegador, segurança e verificações focadas precisam passar antes de considerar o lote publicável.
10. **Piloto:** mudanças amplas entram primeiro para um grupo reduzido; ampliar somente após observar erros, latência e consistência.
11. **Rollback operacional:** cada lote deve indicar como desabilitar o comportamento novo sem apagar dados criados.
12. **Pós-publicação:** comparar métricas e amostras reais com a linha de base antes de encerrar o acompanhamento.

### 4.2 Definição mínima de concluído

Um ponto não estará concluído apenas porque compilou. Será necessário demonstrar:

- regra funcional atendida;
- autorização positiva e negativa por perfil;
- preservação de dados e autoria;
- ausência de duplicidade em reexecução ou concorrência;
- consultas e documentos coerentes entre Promotor, Gerencial e Admin;
- testes automatizados pertinentes;
- QA manual do percurso alterado;
- desempenho dentro da linha de base ou com variação aceita e explicada;
- estratégia de publicação e reversão documentada.

## 5. Lotes recomendados

### Lote 0 — preparação e rede de segurança

**Ponto principal:** 15.

**Objetivo:** tornar o GitHub Actions confiável antes das mudanças amplas e construir a linha de base.

**Escopo:**

- documentar o workflow atual em linguagem operacional;
- reproduzir e classificar suas falhas atuais;
- estabilizar auditoria, lint, tipos, testes, build, navegador e banco;
- registrar cobertura existente e lacunas, sem perseguir cobertura perfeita;
- criar dados sintéticos e um ambiente isolado de homologação;
- medir Notas, Dashboard, finalização e PDF no estado atual;
- definir o formato do relatório de cada lote.

**Saída esperada:** pipeline confiável, baseline registrada e homologação pronta. O lote não publica funcionalidades.

### Lote 1 — autoria e PDF

**Pontos:** 13 e 14.

**Objetivo:** entregar primeiro o ajuste considerado mais urgente pelo proprietário.

**Escopo:**

- criar autoria original imutável e último editor;
- aplicar os campos em todas as mutações relevantes;
- fazer backfill conservador, sem inventar autor histórico;
- corrigir responsável exibido no PDF;
- retirar fotos do PDF e manter sua visualização nas telas;
- gerar, armazenar e versionar o PDF sem reconstruí-lo em toda abertura;
- implantar filtros de responsável, criador, editor e rota conforme o estado da nota.

**Gate específico:** abrir ou baixar nunca altera autoria; edição por outro usuário cria nova versão; falha de geração não apaga nem duplica a FSTD; PDF salvo abre com tempo medido.

### Lote 2 — segurança e ciclo de acesso

**Pontos:** 8, 10, 11 e 16.

**Objetivo:** fechar elevação de privilégio, vazamento de escopo, sessão após desativação e inconsistências de rota.

**Escopo:**

- confirmar consumidores e retirar a função administrativa antiga;
- consolidar Promotor, Gerencial e Admin com perfil e role coerentes;
- aplicar Promotor por rota, Gerencial por UF e Admin global no backend;
- bloquear imediatamente usuário desativado e revogar sessões;
- impedir perfis não Promotor em rotas;
- auditar os seis vínculos de perfis incorretos e o vínculo órfão antes de qualquer saneamento.

**Gate específico:** testes positivos e negativos por chamada direta; proteção contra perda do último Admin ativo; reativação preserva histórico e vínculos; contagens legítimas por perfil permanecem corretas.

### Lote 3 — navegação e modularização incremental

**Ponto:** 12.

**Objetivo:** criar uma base legível e previsível para as expansões seguintes.

**Escopo:**

- definir a árvore canônica de URLs;
- migrar uma página por vez, mantendo redirects temporários;
- extrair páginas, componentes, hooks, regras de domínio e repositórios;
- preservar filtros e contexto necessário na URL;
- manter guards de acesso em entradas diretas;
- criar testes de caracterização antes de cada extração.

**Gate específico:** atualizar, voltar, avançar e abrir endereço direto preservam o contexto autorizado; nenhum payload, filtro ou regra muda apenas por causa da refatoração.

### Lote 4 — núcleo operacional da FSTD

**Pontos:** 1, 19, 2, 17 e 4.

**Objetivo:** consolidar avulsas, revisão por produto, convivência dos modos, legado e Dashboard.

**Sequência interna:**

1. corrigir o período padrão do Dashboard, por ser isolado e rápido;
2. alinhar com segurança o ajuste de totais legados em homologação;
3. implementar conciliação de avulsa por loja+nota e o estado `Revisão pendente`;
4. implantar a exceção controlada de edição pelo Promotor autor;
5. introduzir os modos agregado e por produto gradualmente.

**Gate específico:** notas homônimas nunca cruzam lojas; divergência de produto não cria outra FSTD; Promotor só edita a própria avulsa em revisão; modo da FSTD não muda com o usuário; Dashboard não mistura dados por produto inferidos do agregado.

### Lote 5 — cadastros alimentados pelas importações

**Ponto:** 5, dividido em duas entregas.

#### 5A — lojas

- cadastrar código novo automaticamente com dados válidos;
- não criar rota automática;
- não sobrescrever loja existente sem política aprovada;
- detectar mudança de nome ou código sem duplicar a unidade;
- reconciliar as lacunas históricas somente após revisão.

#### 5B — produtos

- detectar códigos não resolvidos;
- criar área Produtos somente no Gerencial;
- permitir catálogo, fotos, edição, aliases e produto novo;
- sugerir similaridade de forma conservadora;
- manter dúvida na fila em vez de classificar silenciosamente;
- resolver GB C/15 como produto e EB C/30 Cuisine e Co como alias pelo mesmo fluxo.

**Gate específico:** reexecutar o mesmo lote produz delta zero; nenhuma loja válida é sobrescrita; nenhum código aponta para dois produtos; espécie e embalagem diferentes nunca são agrupadas apenas por nome semelhante.

### Lote 6 — melhorias operacionais de menor prioridade

**Pontos:** 3, 6 e 7.

**Escopo:**

- consolidar desconhecimentos ativos e criar histórico de comentários;
- unificar informações logísticas opcionais em Observações;
- substituir as três posições fixas de rota por lista dinâmica sem duplicidade.

**Gate específico:** nenhum comentário é perdido no saneamento; observações antigas permanecem legíveis; quatro ou mais Promotores funcionam sem duplicar lojas ou acessos.

### Lote 7 — decisões adiadas e preservação histórica

**Pontos:** 9 e 18.

**Escopo atual:**

- manter a senha inicial padrão, sem armazenar ou exibir senha em texto;
- manter disponível a redefinição autorizada;
- preservar os 20 registros históricos sem foto, sem aviso ou recuperação;
- manter foto obrigatória para novas FSTDs no frontend e no banco.

**Evolução futura:** ativação individual de senha e migração completa do Glide serão planejadas separadamente.

## 6. Matriz de risco por ponto

| Ponto | Risco de regressão | O que pode quebrar | Prevenção e testes indispensáveis |
|---:|---|---|---|
| 1 | Crítico | Associação entre lojas, duplicidade, sobrescrita, status e produtos aliases. | Loja+nota exatos no banco; transação; idempotência; snapshot; duas lojas com mesmo número; divergências e concorrência. |
| 2 | Crítico | Histórico, relatórios, PDFs e troca indevida do modo de documentos existentes. | Modo imutável por FSTD; RPCs e relatórios separados; nenhum rateio; piloto e rollback do habilitador. |
| 3 | Alto | Perda de comentários e encerramento do caso errado ao limpar duplicados. | Exportar grupos; migrar comentários antes de consolidar; unicidade ativa depois; testes concorrentes. |
| 4 | Baixo | Dia comum, virada de ano, fuso ou comparação anterior incorretos. | Relógio fixo nos testes; dias 1 e 2; dezembro/janeiro; validar payload da RPC. |
| 5 | Crítico | Loja sobrescrita/duplicada e alias de produto classificado incorretamente. | Insert seguro; exceção para incompletos; auditoria; regra conservadora; fila humana; replay idempotente. |
| 6 | Baixo | Perda de texto antigo ou placeholder virar regra obrigatória. | Compatibilidade inicial; sem remoção precipitada; testes de persistência e PDF nos dois modos. |
| 7 | Médio | Perda de ordem, duplicidade ou quebra de acesso de rota. | Auditoria; migração transacional; unicidade; testar zero a quatro ou mais vínculos e reordenação. |
| 8 | Crítico | Continuação da elevação ou bloqueio de operações legítimas e de recuperação Admin. | Inventário de consumidores; canal substituto primeiro; matriz positiva/negativa; coerência perfil/role. |
| 9 | Médio | Senha legível, redefinição do usuário errado ou barreira de adoção. | Não alterar agora; nunca guardar senha em texto; escopo testado; piloto futuro de ativação. |
| 10 | Crítico | Vazamento por RPC/view ou restrição excessiva de histórico legítimo. | Testar REST/RPC/UI; contagens por perfil; Gerencial multi-UF; mudanças de rota/código; medir consultas. |
| 11 | Alto | Sessão continuar ativa, reativação falhar ou último Admin ser bloqueado. | Revogação real; proteção do último Admin; múltiplos dispositivos; preservar cadastro e vínculos. |
| 12 | Crítico | Links, filtros, voltar, permissões ou regras mudarem durante a refatoração. | Caracterização; extração incremental; redirects; guards; separar refatoração de regra; QA por perfil. |
| 13 | Alto | Autoria histórica inventada, criador alterado e filtros com contagens erradas. | Backend controla campos; criador imutável; desconhecido quando não comprovado; índices e reconciliação de contagens. |
| 14 | Crítico | Finalização presa, PDF obsoleto/duplicado, autoria ou Storage incorretos. | Geração idempotente; repetição segura; versão por conteúdo; abertura somente leitura; testes e medições separadas. |
| 15 | Alto | Falso bloqueio, teste instável, atualização quebrando produção ou workflow novo incompleto. | Baseline; documentação; versões fixas; limites após medição; execução paralela antes de substituir o workflow. |
| 16 | Médio | Limpeza remover rota válida ou promoção romper histórico. | Exportar os sete candidatos; revisar predicado; restrição no banco; promoção transacional; testes diretos. |
| 17 | Alto | Migração fora de ordem, permissão excessiva ou fonte histórica sobrescrita. | Comparar remoto/local; homologação; tabela de ajuste auditável; testes de autorização; publicação controlada. |
| 18 | Baixo | Rotina futura invalidar ou tentar preencher retroativamente o histórico. | Nenhuma mutação; separar histórico da validação nova; excluir do saneamento automático. |
| 19 | Alto | Edição ampla pelo Promotor, identidade rompida, conflito concorrente ou PDF desatualizado. | Permissão apenas em `Revisão pendente`; número importado imutável; transação, auditoria, versão do PDF e escopo de UF. |

## 7. Cenários integrados mínimos

1. Promotor preenche nota vinculada com zero e máximo de retorno, motivos e fotos.
2. Duas sessões tentam iniciar ou finalizar a mesma nota/produto.
3. Avulsa é criada antes da importação e depois concilia por loja+nota.
4. Mesmo número aparece em duas lojas e nunca cruza os vínculos.
5. Avulsa concilia no cabeçalho, mas diverge em alias, produto ausente/excedente ou quantidade; entra em revisão e é corrigida pelo autor.
6. Promotor tenta editar concluída comum e é negado; consegue apenas sua avulsa em revisão.
7. Gerencial dentro da UF e Admin corrigem; Gerencial fora da UF é negado.
8. Usuário é desativado com sessão aberta e perde acesso em todas as camadas; reativação recupera o escopo correto.
9. Gerencial tenta criar ou promover Admin por chamada direta e é negado.
10. Usuário troca do modo agregado para produto e suas FSTDs antigas preservam modo e PDF.
11. Loja e código de produto novos chegam por API e Sheets; reexecução não duplica nem sobrescreve indevidamente.
12. Atualizar, voltar e abrir link direto preservam contexto e autorização.
13. PDF mostra autor e último editor corretos, não contém fotos e abre do armazenamento sem regeneração.
14. Primeiro dia do mês abre o período anterior completo no Dashboard.
15. Quatro Promotores são vinculados à mesma loja sem repetição e todos veem somente a rota autorizada.

## 8. Ambiente de homologação recomendado

### 8.1 Arquitetura

Para este plano, a opção recomendada é manter quatro espaços claramente separados:

1. **Produção:** branch principal, frontend público e projeto Supabase atual; permanece intocada durante a implementação.
2. **Código de trabalho:** branch Git longa e isolada, preferencialmente em worktree próprio, recebendo os lotes e checkpoints.
3. **Banco de homologação:** branch Preview descartável e recriável do Supabase com Database, Auth, Storage e Edge Functions próprios, sem copiar dados de produção por padrão.
4. **Frontend de homologação:** Preview Deployment da Vercel vinculado à branch Git e configurado exclusivamente com URL e chave publicável do Supabase de homologação.

Esse desenho produz uma URL de teste durante o ciclo ativo sem expor o domínio público nem usar o banco de produção. Ao encerrar o ciclo, a branch do Supabase deve ser excluída para interromper a cobrança; numa retomada, o ambiente será reconstruído pelas migrações e pelos dados de teste versionados.

### 8.2 Alternativa mais isolada

Se o ciclo precisar preservar dados manuais por longos intervalos ou se não for possível impedir com clareza uma promoção automática para produção, usar um **projeto Supabase separado de homologação**. Ele exige mais configuração e custo, mas oferece uma separação durável.

Não se recomenda usar somente Supabase local para a execução longa: ele é excelente para testes automáticos e desenvolvimento, mas não fornece sozinho um ambiente durável e facilmente acessível para validação posterior pelo proprietário.

### 8.3 Proteções do ambiente

- Nunca reutilizar URL, chave publicável, chave secreta, banco, Auth ou bucket de produção no frontend de homologação.
- Usar apenas usuários de teste e dados sintéticos ou anonimizados.
- Não copiar senhas, sessões, arquivos ou dados pessoais de produção.
- Manter crons e sincronizações API/Sheets desativados inicialmente; ativá-los somente contra fontes controladas e por teste explícito.
- Não enviar e-mails reais nem executar ações administrativas sobre contas reais.
- Exibir identificação persistente e inequívoca de **HOMOLOGAÇÃO** no frontend de teste.
- Proteger o acesso ao Preview quando a configuração da Vercel permitir.
- Configurar variáveis da Vercel por ambiente/branch; Preview nunca aponta para Supabase de produção.
- Adicionar uma trava nos scripts de migração/deploy para abortar quando o alvo corresponder ao projeto de produção durante a execução dos lotes.
- Não executar `db push --linked`, deploy de Edge Function ou alteração de secrets sem conferir e registrar semanticamente o alvo.
- Proteger a branch principal no GitHub e não mesclar a branch de trabalho até a validação final.
- Manter publicação em produção como etapa manual, separada e explicitamente autorizada.

### 8.4 Dados mínimos de homologação

- um Admin;
- Gerenciais com uma UF, múltiplas UFs e fora da UF do cenário;
- Promotores ativos, desativados e com mudanças de rota;
- lojas com um e vários Promotores;
- produtos canônicos, aliases, código não classificado e embalagens distintas;
- nota vinculada normal, avulsa aguardando importação, avulsa conferida e avulsa divergente;
- FSTD agregada e por produto;
- desconhecimento, comentários e reconhecimento;
- PDFs com criador, último editor e mais de uma versão;
- histórico legado controlado, incluindo registro sem foto apenas como exceção de leitura.

### 8.5 Fluxo operacional de acompanhamento

1. Cada lote entra na branch de trabalho em mudanças pequenas.
2. O GitHub Actions executa as verificações.
3. A Vercel gera ou atualiza a URL de Preview.
4. O Preview usa exclusivamente o Supabase de homologação.
5. O Codex registra ao final de cada lote: mudanças, testes, riscos residuais, telas disponíveis e itens ainda não validados.
6. O proprietário pode abrir a URL e testar sem afetar usuários reais.
7. O lote só é marcado como candidato após CI, testes de banco, QA e comparação com a linha de base.
8. Nenhum lote é promovido individualmente para produção durante a execução integral, salvo nova decisão explícita.
9. Ao final, executar validação integrada de todos os lotes e preparar um plano de publicação separado.

### 8.6 Ciclo de custo e descarte

1. Criar a branch Preview apenas no início de um ciclo ativo de implementação ou validação.
2. Manter o baseline estrutural atual e todo estado novo em migrações, seeds e fixtures versionados; dados digitados manualmente na homologação são temporários.
3. Registrar o resultado dos testes antes do descarte.
4. Excluir a branch do Supabase ao encerrar o ciclo para interromper a cobrança futura.
5. Numa retomada, criar nova branch, aplicar o baseline, as migrações posteriores e o seed, atualizar as variáveis do Preview e executar o teste de fumaça.

O repouso automático por inatividade não será tratado como garantia de custo zero. O controle financeiro confiável é a exclusão explícita da branch quando ela deixar de ser necessária.

### 8.7 Complexidade e recomendação

A configuração é de **complexidade moderada e predominantemente operacional**, não uma reconstrução do sistema. Vale realizá-la antes da implementação porque os pontos mais importantes alteram banco, Auth, RLS, Storage, Edge Functions e frontend ao mesmo tempo. O custo de preparar a homologação é menor que o risco de testar essas mudanças sobre dados e usuários reais.

## 9. Critério para iniciar a execução

Antes do primeiro lote funcional, confirmar:

- ordem e agrupamento deste documento aprovados;
- ambiente de homologação e dados sintéticos definidos;
- estratégia de branch e revisão definida;
- responsáveis por validar Promotor, Gerencial e Admin disponíveis;
- linha de base e estado atual do GitHub Actions registrados;
- nenhuma publicação automática habilitada por engano;
- cada lote tratado por autorização separada de implementação e de publicação.

## 10. Fora do escopo deste plano

- publicação imediata de qualquer alteração;
- mudança da precedência entre API e Google Sheets;
- subperfis de Gerencial;
- retirada imediata da senha padrão;
- recuperação das fotos históricas ausentes;
- migração completa dos demais dados do Glide;
- novo dashboard exclusivo para CI ou desempenho;
- reestruturação visual baseada no protótipo conceitual mostrado durante a discussão.

## 11. Próxima decisão

O proprietário deverá revisar a ordem, os lotes e a estratégia de homologação. Depois da aprovação, o primeiro trabalho recomendado é configurar e validar o ambiente isolado, detalhar o **Lote 0** em tarefas técnicas verificáveis e, em paralelo de planejamento, decompor o **Lote 1** sem iniciar código ou publicação até nova autorização explícita.
