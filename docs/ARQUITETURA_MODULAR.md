# Arquitetura modular

## Objetivo e limites

Este documento organiza o comportamento atual da aplicação em contextos funcionais. Ele não propõe serviços independentes nem afirma que existam _bounded contexts_ implantados separadamente: hoje, a interface React e o backend Supabase compartilham o mesmo produto e o mesmo modelo de autenticação.

As capacidades abaixo representam o que o código atual expõe e autoriza. Quando a interface filtra dados ou oculta uma ação, isso deve ser entendido apenas como ergonomia; o limite de segurança é imposto no Supabase.

> **Regra arquitetural de autorização:** permissões visuais, guardas de rota, filtros e botões desabilitados melhoram a UX, mas **não concedem nem revogam autoridade**. A autorização efetiva deve permanecer nas políticas RLS, nas RPCs e nas Edge Functions do Supabase. Toda nova capacidade deve ser protegida no backend antes de ser exposta na interface.

## Identidade e acesso

- O Supabase Auth mantém a sessão e o JWT. `AuthProvider` resolve o registro correspondente em `usuarios` e combina o `perfil` persistido com o `auth_role` de `app_metadata.role`.
- O acesso exige simultaneamente sessão, `auth_user_id`, `ativo = true`, `acesso_habilitado = true` e coerência entre `perfil` e `auth_role`: `Admin/admin`, `Gerencial/gerencial` ou `Promotor/promotor`.
- `RootApp` separa as entradas `/admin`, `/gerencial` e `/acesso/promotor` com `RequireRole`. Essa guarda evita navegação acidental, mas não substitui a autorização do backend.
- A migração reforça a mesma dupla validação no banco: uma role JWT desatualizada ou forjada pode negar acesso, nunca elevá-lo.
- Admin tem escopo operacional global. Gerencial tem uma ou mais UFs. Promotor tem exatamente uma UF, mantida também em `estado` por compatibilidade.

## Contextos

### 1. Identidade e acesso

Responsável por login, logout, recuperação de senha, carregamento do usuário autenticado, coerência de papéis e direcionamento à aplicação adequada. É também onde se define a invariante de que identidade Auth e perfil operacional precisam concordar.

**Fronteiras:** Supabase Auth autentica; `usuarios` descreve o ator no domínio; RLS/RPC/Edge Function decide o que ele pode fazer. Dados de `app_metadata` não devem ser editáveis pelo cliente.

### 2. Usuários

Mantém Admins, Gerenciais e Promotores, incluindo nome, e-mail, situação de acesso, foto, perfil e escopo territorial.

- Admin pode listar e administrar todos os perfis, criar Admin, Gerencial e Promotor, alterar/bloquear/excluir contas e definir UFs. Não pode remover ou desativar o próprio acesso nem deixar o sistema sem um Admin ativo.
- Gerencial pode listar o recorte retornado pela Edge Function e administrar somente Promotores pertencentes às suas UFs. Não pode criar ou alterar Admins/Gerenciais.
- Promotor pode consultar o próprio perfil e alterar somente dados de apresentação permitidos; gatilho e RLS impedem a alteração dos próprios privilégios e escopo.
- Criação, atualização, bloqueio, exclusão e listagem administrativa passam pela Edge Function `manage-users`, inclusive as mutações no Supabase Auth feitas com _service role_.

### 3. Lojas e roteirização

Mantém lojas e o vínculo posicional entre loja e Promotor (`loja_promotores`).

- Promotor consulta somente lojas às quais está atribuído.
- Gerencial consulta lojas das suas UFs e pode atribuir/remover Promotores elegíveis das mesmas UFs.
- Admin consulta todas as lojas, cria/edita/exclui lojas e roteiriza globalmente.
- A criação de loja é exclusiva de Admin na RLS, mesmo que componentes visuais sejam reutilizados.
- Uma validação no banco exige que loja e Promotor tenham a mesma UF; a matriz permite até três posições por loja na UI atual.

### 4. Notas fiscais

Representa as NFDs importadas (`nfd_notas`/`nfd_itens`), sua associação à loja, situação visual e manifestação de procedência.

- Promotor consulta NFDs das lojas atribuídas, agrupadas em atrasadas, finalizadas, avulsas e desconhecidas.
- Gerencial consulta NFDs apenas das suas UFs; Admin possui consulta global.
- Promotor pode registrar o desconhecimento de uma NFD atribuída. Gerencial e Admin podem desconhecer e reconhecer NFD por RPCs próprias, respeitando o escopo da loja.
- O desconhecimento é um registro auditável em `nfd_desconhecimentos`; reconhecimento marca `reconhecida_em`, em vez de apagar a história.

### 5. FSTD

Orquestra a devolução associada a uma NFD ou uma FSTD avulsa. O agregado é o `processo`, que contém produtos, divisões por motivo, quantidades, observação, fotos e estado de conclusão.

- Promotor inicia FSTD para NFD de loja atribuída, cria FSTD avulsa, preenche produtos e motivos, edita produto já concluído e finaliza o processo.
- Gerencial e Admin podem iniciar e preencher FSTD em NFD acessível pela tela de notas, inclusive para logística ou loja sem Promotor; o escopo de Gerencial continua limitado às suas UFs.
- Alterações usam RPCs (`iniciar_fstd_produtos_v2`, `iniciar_fstd_avulsa`, `concluir_fstd_produto`, `concluir_fstd_produto_avulso`, `editar_fstd_produto` e `finalizar_fstd_produtos`). As RPCs são a unidade de autorização e consistência, não o modal React.
- O responsável pela FSTD é o Promotor gravado no processo; na geração do documento, a interface fornece também o nome do usuário autenticado responsável pela operação corrente.

### 6. Documentos e fotos

Cuida de evidências fotográficas de produto, foto de perfil e documento PDF final da FSTD.

- Fotos FSTD aceitam JPEG, PNG ou WebP, até 10 MB cada, e são armazenadas no bucket `fstd-fotos` sob caminho do usuário/processo/produto.
- A habilitação visual de fotos é um atributo do perfil (`fotos_habilitadas`), mas acesso ao objeto deve continuar protegido pelas políticas de Storage.
- Após a conclusão, `get_or_create_fstd_document` obtém/cria o documento, a aplicação gera o PDF versionado, envia-o a `fstd-pdfs`, registra metadados via `set_fstd_document_pdf` e usa URL assinada temporária para visualização.
- A leitura de `fstd_documentos` acompanha o acesso ao processo: Admin/Gerencial por loja dentro do escopo, Promotor quando é dono do processo.

### 7. Relatórios

É a projeção analítica de lojas, NFDs, FSTDs, motivos, valores e responsáveis. No código atual há componentes e estados preparados para dashboard/relatório, mas a navegação gerencial publicada contém apenas **Usuários**, **Lojas** e **Notas**. Portanto, relatórios não devem ser tratados como uma capacidade operacional disponível nesta versão.

Quando o contexto for ativado, deve consumir projeções somente leitura e aplicar o mesmo escopo: Promotor apenas sobre lojas atribuídas, Gerencial sobre `ufs` e Admin global. Exportações e agregações também precisam de autorização no banco/RPC; filtrar linhas no navegador não é controle de acesso.

## Matriz de capacidades

Legenda: **Sim** = disponível no fluxo atual; **Escopo** = disponível apenas para registros autorizados por atribuição/UF; **Não** = não disponível; **Reservado** = estrutura visual existe, mas não está publicada como capacidade atual.

| Capacidade | Promotor | Gerencial | Admin |
|---|---|---|---|
| Consulta de lojas | Escopo: lojas atribuídas | Escopo: lojas nas `ufs` | Sim: todas |
| Consulta de NFD | Escopo: lojas atribuídas | Escopo: NFDs nas `ufs` | Sim: todas |
| Criação de FSTD vinculada a NFD | Escopo: lojas atribuídas | Escopo: lojas nas `ufs` | Sim: global |
| Criação de FSTD avulsa | Escopo: lojas atribuídas | Não há ação no fluxo gerencial atual | Não há ação no fluxo Admin atual |
| Edição/preenchimento de FSTD | Escopo: processos próprios/acessíveis | Escopo: processos de lojas nas `ufs` | Sim: global |
| Finalização de FSTD | Escopo: processos próprios/acessíveis | Escopo: processos de lojas nas `ufs` | Sim: global |
| Desconhecimento de NFD | Escopo: NFD de loja atribuída | Escopo: RPC gerencial nas `ufs` | Sim: RPC gerencial global |
| Reconhecimento de NFD | Não há ação de reconhecimento no fluxo do Promotor | Escopo: RPC gerencial nas `ufs` | Sim: RPC gerencial global |
| Gestão de Promotores | Não | Escopo: criar, editar, bloquear e excluir nas `ufs` | Sim: global |
| Gestão de Gerenciais | Não | Não | Sim: criar, editar, bloquear e excluir |
| Gestão de Admins | Não | Não | Sim, preservando ao menos um Admin ativo |
| Criação/edição/exclusão de lojas | Não | Não | Sim: rotina exclusiva de Admin |
| Roteirização loja–Promotor | Não | Escopo: mesmas `ufs` | Sim: global |
| Acesso por UF | Uma UF e lojas atribuídas | Uma ou mais `ufs` | Global; `ufs` vazio por definição |
| Upload de fotos da FSTD | Escopo e quando habilitado pelo fluxo | Escopo do processo | Global sobre processos autorizados |
| Geração/consulta de PDF FSTD | Escopo do próprio processo | Escopo do processo nas `ufs` | Global |
| Relatórios/dashboard | Reservado | Reservado | Reservado |
| Rotinas exclusivas de Admin | Não | Não | Criar/gerir Gerenciais e Admins; criar/editar/excluir lojas; administrar globalmente usuários, UFs e roteirização |

## Regras de escopo e invariantes

1. `perfil` e `auth_role` devem concordar em toda requisição privilegiada.
2. Admin tem `ufs = []` e alcance global; Gerencial tem uma ou mais UFs; Promotor tem exatamente uma.
3. `estado` continua preenchido com a primeira UF para compatibilidade, mas `ufs` é a fonte autoritativa do escopo Gerencial.
4. Gerencial só administra Promotores cujos `estado`/`ufs` pertençam ao seu escopo.
5. Um Promotor só pode ser roteirizado para loja da mesma UF.
6. Registros operacionais ligados a loja (NFD, processo, produto, documento e desconhecimento) herdam o acesso da loja ou do Promotor responsável.
7. Uso de _service role_ fica confinado a código confiável, como `manage-users`; nunca deve migrar para o navegador.
8. Toda mudança na matriz exige primeiro RLS/RPC/Edge Function, depois testes de autorização e somente então a exposição visual.

## Glossário

- **`perfil`:** papel operacional persistido em `usuarios`: `Admin`, `Gerencial` ou `Promotor`. É a fonte de verdade de negócio e deve ser coerente com o JWT.
- **`auth_role`:** papel técnico no `app_metadata.role` do usuário Auth: `admin`, `gerencial` ou `promotor`. Em conjunto com `perfil`, evita elevação por metadado inconsistente.
- **`ufs`:** lista de unidades federativas que delimita o escopo operacional. É vazia para Admin, contém uma ou mais UFs para Gerencial e exatamente uma para Promotor.
- **`estado`:** campo escalar legado/compatível; para Gerencial corresponde à primeira posição de `ufs` e para Promotor à sua única UF.
- **NFD:** nota fiscal de devolução tratada pela operação, importada e vinculada a uma loja por código/chave de acesso; serve de origem para uma FSTD ou para manifestação de desconhecimento.
- **FSTD:** formulário/fluxo de solicitação de troca ou devolução que registra a apuração dos produtos de uma NFD (ou avulsa), seus motivos, quantidades, evidências e documento final.
- **processo:** agregado persistido em `fstd_processos` que representa o ciclo de vida de uma FSTD e reúne loja, NFD, responsável, produtos e status.
- **produto:** item faturado/devolvido de um processo, persistido em `fstd_produtos`, identificado pelo catálogo/código e contendo quantidades, observação, fotos e conclusão.
- **motivo:** classificação da devolução aplicada à totalidade ou a uma divisão da quantidade de um produto; associa quantidade faturada/retornada a uma razão de negócio.
- **loja atribuída:** loja ligada ao Promotor por `loja_promotores`; é a unidade que habilita sua consulta de NFD e atuação operacional.
- **responsável pela FSTD:** Promotor associado ao `fstd_processos.promotor_id`, cuja identidade determina propriedade e acesso ao processo; em operações gerenciais, o documento também identifica o usuário autenticado que executa a geração/preenchimento.

## Fontes do comportamento atual

- `src/app/RootApp.jsx`: composição das rotas e guardas por papel.
- `src/domains/auth/AuthProvider.jsx`: sessão, perfil, coerência de papéis e requisitos de acesso.
- `src/apps/gerencial/GerencialApp.jsx`: experiência Admin/Gerencial de usuários, lojas, roteirização, notas e FSTD.
- `src/apps/promotor/PromotorApp.jsx`: lojas atribuídas, NFD, FSTD, fotos, documentos e manifestações do Promotor.
- `src/domains/users/`: contrato do cliente com a Edge Function de gestão de usuários.

Os entrypoints `src/App.jsx` e `src/promotor/PromotorApp.jsx` continuam disponíveis
somente para compatibilidade de consumidores externos; código interno deve importar os
caminhos canônicos em `src/apps`.
- `supabase/functions/manage-users/index.ts`: autorização administrativa, escopo por UF e sincronização Auth/perfil.
- `supabase/migrations/20260806120000_admin_gerencial_multi_uf_security.sql`: invariantes, funções de autorização, RLS e escopo multi-UF.
