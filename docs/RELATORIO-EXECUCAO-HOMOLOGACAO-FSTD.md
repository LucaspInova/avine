# Relatório de execução da homologação FSTD

> Estado em 5 de setembro de 2026. Este relatório descreve somente a branch de
> homologação. Nenhuma alteração deste ciclo foi promovida para produção.

## Resultado atual

- Código: `inova/homologacao-plano-fstd`, commit `3fba004`.
- CI: execução `34001734918` concluída com os jobs Frontend e Banco verdes.
- Vercel: Preview do commit concluído com sucesso e ligado ao Supabase de teste.
- Supabase: branch descartável `binxgymusventbechztf`, com 23 migrações e quatro
  Edge Functions ativas.
- Dados: seis usuários sintéticos, três lojas, três vínculos de rota, cinco
  produtos, duas FSTDs e os cenários de catálogo e desconhecimento.
- API remota: login e escopo RLS confirmados para Admin, Gerenciais CE/BA,
  Promotores CE1/CE2 e Promotor inativo pelo verificador reproduzível
  `npm run verify:homologacao`.
- QA navegada: tela pública e identificação de homologação verificadas; jornadas
  autenticadas aguardam a confirmação operacional para inserir as credenciais
  sintéticas no navegador.

## Evidência automatizada

O commit atual passou por:

- lint e checagem de tipos;
- 45 arquivos e 229 testes do frontend;
- build de produção e orçamento de bundle;
- testes Playwright de fumaça;
- reconstrução do banco vazio a partir do baseline e das migrações;
- 260 testes pgTAP em nove arquivos;
- lint do banco em nível de erro;
- regeneração e comparação dos tipos do banco.

O chunk da entrada Gerencial mede 136.146 bytes brutos e 37.364 bytes em gzip,
dentro da tolerância da baseline e abaixo do teto global de 450 KB.

## Matriz dos 19 pontos

| Ponto | Resultado implementado na homologação | Evidência principal | Estado |
|---:|---|---|---|
| 1 | Avulsa concilia somente por loja e número; divergência de itens mantém a mesma FSTD em `Revisão pendente`. | Migração de reconciliação e 17 testes SQL. | Automatizado; navegador pendente |
| 2 | Cada FSTD registra modo imutável `produto` ou `agregado`; o agregado não cria rateio fictício por produto. | Migração de modos, 25 testes SQL e testes de fluxo. | Automatizado; navegador pendente |
| 3 | Existe um caso ativo por loja e número normalizado, com histórico imutável de abertura, retificação e reconhecimento. | Migração de histórico, 29 testes SQL e testes das duas interfaces. | Automatizado; navegador pendente |
| 4 | No dia 1 o Dashboard abre o mês anterior completo; nos demais dias abre do primeiro dia do mês até ontem. | Testes com dia 1, dia 2 e virada de ano. | Automatizado |
| 5 | Lojas novas são criadas pelos importadores sem rota; conflitos cadastrais viram alerta. Produtos desconhecidos entram em fila para decisão humana e catálogo gerencial. | Migração de catálogo, 32 testes SQL, testes de repositório/tela e Edge Functions v4. | Automatizado; navegador pendente |
| 6 | Os dados logísticos opcionais usam um campo único de observações, também disponível no modo agregado. | Contratos SQL e testes do fluxo agregado. | Automatizado; navegador pendente |
| 7 | A rota usa lista ordenada sem limite artificial e sem duplicidade por loja. | RPC `salvar_rota_loja`, 29 testes SQL e testes com quatro promotores. | Automatizado; navegador pendente |
| 8 | A função antiga de criação gerencial foi removida; Admin mantém gestão plena e Gerencial não promove perfis privilegiados. | Edge Function `manage-users`, remoção da função legada e testes de acesso. | Automatizado; navegador pendente |
| 9 | A senha inicial compartilhada foi preservada por decisão funcional, sem coluna de senha no schema público; redefinição continua disponível. | Consulta estrutural retornou zero colunas de senha e testes da recuperação. | Mantido conforme decisão |
| 10 | Promotor lê por rota, Gerencial por UF e Admin globalmente, inclusive por RPC e acesso direto. | Migração de escopo, 41 testes SQL e smoke real da API com seis perfis. | API confirmada; navegador pendente |
| 11 | Usuário inativo perde acesso às camadas protegidas e a gestão revoga sessões; reativação preserva o cadastro. | Edge Function, testes de Auth/RLS e conta inativa sem qualquer linha via API. | API confirmada; navegador pendente |
| 12 | URLs canônicas foram criadas para as telas e etapas; refresh, voltar e links diretos preservam o contexto. Código foi separado por aplicação, domínio e componentes lazy. | Testes de navegação e build dividido. | Automatizado; navegador pendente |
| 13 | Autor original e último editor são separados; filtros distinguem responsável, criador, editor e promotor da rota. | Migrações de autoria/filtros e testes da tela de Notas. | Automatizado; navegador pendente |
| 14 | PDF usa autor/último editor da FSTD, não quem abriu; não contém fotos e possui documento e versões materializadas no Storage. | Migração de documentos, testes do gerador e contratos SQL. | Automatizado; navegador pendente |
| 15 | O Actions executa frontend, banco, navegador, auditoria de dependências, bundle e tipos; publicação não ocorre quando o CI falha. | Workflow e execução verde `34001734918`. | Concluído em homologação |
| 16 | Somente perfil Promotor pode ocupar rota; duplicidades e UF incompatível são rejeitadas. | Restrição, gatilho e testes positivos/negativos. | Automatizado; navegador pendente |
| 17 | Ajustes de totais legados existem por RPC auditável e escopo Gerencial/Admin, sem alterar a linha original. | Migrações e 18 testes SQL. | Automatizado; navegador pendente |
| 18 | Os 20 itens históricos concluídos sem foto foram preservados; novas conclusões continuam exigindo foto. | Consulta somente leitura em produção e teste SQL de rejeição sem foto. | Concluído conforme decisão |
| 19 | Concluída comum fica somente leitura para Promotor; o autor pode reabrir apenas sua avulsa em revisão; Gerencial/Admin corrigem no próprio escopo. | Migração de reconciliação, autoria e testes de autorização. | Automatizado; navegador pendente |

## Auditoria de segurança

- Todas as tabelas expostas da aplicação possuem RLS habilitada.
- Nenhuma função `SECURITY DEFINER` da aplicação é executável por `anon`.
- As funções executáveis por `authenticated` contêm checagem explícita de
  identidade e/ou autorização antes de operar e possuem cenários negativos nos
  testes de banco.
- As funções exclusivas dos importadores permanecem restritas a `service_role`.
- O Advisor não retornou erro. Os avisos de função privilegiada são mantidos como
  risco conhecido porque essas RPCs são a fronteira autenticada do produto;
  removê-las quebraria os fluxos. Referência do aviso:
  https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable
- Os avisos de índice sem uso são esperados numa base recém-criada e pequena;
  índices não serão removidos antes de medições com carga representativa.
  Referência:
  https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index

## Riscos residuais antes da produção

1. As jornadas autenticadas ainda precisam ser percorridas no navegador contra a
   branch remota, registrando perfil, URL, comportamento e erros de console.
2. O Preview está protegido pela autenticação da equipe Vercel. A validação local
   usa exatamente o mesmo commit e o Supabase remoto de homologação; para usuários
   externos será necessário um link temporário autorizado no painel.
3. A base sintética prova regras e contratos, mas não substitui um piloto com
   volume e diversidade operacional representativos.
4. A promoção para produção exige plano separado: marcar o baseline como já
   aplicado, enviar somente migrações incrementais, publicar Edge Functions,
   validar dados reais e manter rollback por lote.

## Condição para encerrar a homologação

Este relatório só será marcado como final depois que o roteiro navegado for
executado para Admin, Gerencial dentro e fora da UF, Promotor ativo e Promotor
inativo; qualquer defeito encontrado deverá ser corrigido e passar novamente no
CI antes da avaliação do proprietário.
