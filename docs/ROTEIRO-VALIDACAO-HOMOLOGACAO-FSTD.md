# Roteiro de validação navegada da homologação FSTD

## Objetivo e limites

Este roteiro valida a experiência completa na branch de homologação. Ele usa
somente usuários e registros sintéticos e não autoriza merge, migração ou deploy
em produção.

Endereços:

- Preview Vercel: `https://fstddigital-git-inova-homologacao-8785a8-luiz-robertos-projects.vercel.app`
- Supabase de teste: `https://binxgymusventbechztf.supabase.co`
- Execução local equivalente, quando o Preview exigir SSO: `http://127.0.0.1:5173/`

Contas e senha estão documentadas em `docs/AMBIENTE-HOMOLOGACAO.md` e existem
somente no banco descartável.

## Como registrar cada cenário

Para cada cenário, anotar:

- data, perfil e navegador;
- URL antes e depois da ação;
- resultado esperado e observado;
- tempo percebido ou medido quando indicado;
- mensagem exibida ao usuário;
- erros de console/rede;
- captura de tela somente quando ela acrescentar evidência.

Não corrigir manualmente o banco durante o percurso. Se um cenário falhar,
preservar o estado, registrar a evidência e corrigir pelo código ou por nova
migração versionada.

## 1. Entrada e isolamento

1. Abrir o frontend e confirmar a faixa permanente `Ambiente de homologação — dados de teste`.
2. Confirmar que não há indicadores fictícios na tela de login.
3. Abrir `Esqueceu sua senha?`, voltar e verificar que a navegação não perde o estado.
4. Verificar que nenhuma requisição aponta para o projeto de produção.

## 2. Admin

1. Entrar com `admin@homologacao.avine.test`.
2. Atualizar a página e abrir diretamente cada URL principal; confirmar que o
   Admin continua autenticado e possui visão global.
3. Em Usuários, abrir Promotor, Gerencial e Admin; confirmar promoção,
   rebaixamento, desativação e reativação disponíveis somente ao Admin.
4. Não excluir contas durante o teste. Desativar o Promotor sintético ativo,
   verificar bloqueio numa segunda sessão e reativá-lo ao terminar.
5. Em Lojas, vincular quatro Promotores sintéticos, reordenar, tentar repetir um
   deles e confirmar que a duplicidade é impedida. Restaurar a rota inicial.
6. Em Produtos, abrir Catálogo e Pendentes; editar um produto sintético, vincular
   um código pendente como alias e confirmar a auditoria.
7. Em Notas, combinar os filtros Responsável, Criado por, Atualizado por e
   Promotor da rota; confirmar contagens e limpeza independente.
8. Abrir uma nota finalizada e confirmar autor original, último editor e histórico.
9. Abrir o PDF duas vezes; confirmar que a segunda abertura usa o documento salvo,
   que a autoria não muda e que nenhuma foto aparece no arquivo.
10. Abrir Dashboard e confirmar o período inicial esperado para a data do teste.

## 3. Gerencial CE

1. Entrar com `gerencial.ce@homologacao.avine.test`.
2. Confirmar que aparecem somente lojas, notas, desconhecimentos e usuários do
   escopo CE.
3. Tentar abrir por URL uma tela ou registro exclusivo de outra UF e confirmar
   bloqueio sem vazamento de conteúdo.
4. Confirmar que não existe ação para criar ou promover Admin/Gerencial.
5. Preencher uma FSTD de sua UF e conferir `Criado por` e `Atualizado por`.
6. Corrigir uma FSTD finalizada de sua UF; confirmar nova versão do PDF e
   preservação do autor original.
7. Adicionar uma retificação a um desconhecimento e confirmar que o comentário
   anterior continua visível.
8. Abrir Produtos e validar cadastro/edição manual, foto e decisão humana de alias.

## 4. Gerencial BA e teste cruzado de UF

1. Entrar com `gerencial.ba@homologacao.avine.test`.
2. Confirmar que dados CE não aparecem em listas, buscas, filtros ou links diretos.
3. Tentar alterar rota, FSTD, desconhecimento e catálogo fora da UF; todas as
   chamadas devem ser negadas também pelo backend.
4. Confirmar que a mesma URL permitida ao Admin não amplia o escopo do Gerencial.

## 5. Promotor ativo

1. Entrar com `promotor.ce1@homologacao.avine.test`.
2. Confirmar que somente lojas da rota aparecem.
3. Atualizar, voltar, avançar e abrir uma etapa profunda por URL; confirmar que o
   estado e a autorização permanecem corretos.
4. Abrir uma nota importada e preencher uma FSTD por produto.
5. Tentar concluir sem foto, com retorno maior que o faturado e sem motivo quando
   aplicável; cada tentativa deve ser rejeitada com mensagem clara.
6. Concluir com foto sintética válida e confirmar status, autoria e PDF sem foto.
7. Criar uma FSTD agregada; preencher Galinha, Codorna e Observações e confirmar
   que nenhum produto artificial foi criado.
8. Registrar `Desconheço NFD`, adicionar novo comentário no mesmo caso e confirmar
   que não surge outro desconhecimento ativo.
9. Abrir a avulsa sintética em `Revisão pendente`; comparar os produtos, corrigir
   a mesma FSTD e confirmar sem criar uma segunda ocorrência.
10. Tentar editar uma FSTD concluída comum e confirmar modo somente leitura.

## 6. Segundo Promotor e concorrência

1. Em outra sessão, entrar com `promotor.ce2@homologacao.avine.test`.
2. Confirmar que a mesma loja compartilhada aparece uma única vez.
3. Tentar iniciar/finalizar simultaneamente a mesma nota e verificar que o banco
   não duplica processo, produto, PDF ou desconhecimento.
4. Confirmar que uma rota removida deixa de aparecer após revalidação da sessão.

## 7. Promotor inativo

1. Tentar entrar com `promotor.inativo@homologacao.avine.test`.
2. Confirmar que, mesmo que o Auth reconheça a credencial, a aplicação não libera
   nenhuma tela ou dado protegido.
3. Confirmar ausência de chamadas de mutação bem-sucedidas após o bloqueio.

## 8. Navegação, desempenho e regressão visual

1. Em cada perfil, testar refresh, voltar, avançar e link direto nas telas usadas.
2. Verificar menus, modais, filtros, paginação, estados vazio/erro/carregando e
   navegação por teclado.
3. Medir abertura de Notas, Dashboard, modal de FSTD e primeira/segunda abertura
   do PDF; registrar a diferença sem impor um limite inventado.
4. Confirmar no console que não existem erros não explicados nem requisições
   repetidas sem necessidade.
5. Conferir desktop e largura móvel nas jornadas críticas.

## 9. Fechamento

1. Restaurar alterações feitas nos dados sintéticos por script versionado ou
   recriação da branch; não apagar manualmente evidências durante a investigação.
2. Reexecutar `npm run verify` e o CI completo após qualquer correção.
3. Atualizar `docs/RELATORIO-EXECUCAO-HOMOLOGACAO-FSTD.md` com resultados,
   defeitos corrigidos, riscos aceitos e evidências.
4. Somente então apresentar a homologação ao proprietário para decisão. Não
   promover para produção sem autorização nova e explícita.

## Estado da execução

- [x] Login público e faixa de homologação.
- [ ] Admin.
- [ ] Gerencial CE.
- [ ] Gerencial BA e isolamento cruzado.
- [ ] Promotor CE1.
- [ ] Promotor CE2 e concorrência.
- [ ] Promotor inativo.
- [ ] Desktop, mobile, console e tempos.
- [ ] CI verde após os últimos ajustes do QA.
