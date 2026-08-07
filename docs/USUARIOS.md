# Administração de usuários

A tela **Usuários** é restrita aos perfis ativos Admin e Gerencial. O Admin possui
escopo global; o Gerencial enxerga e administra somente Promotores vinculados às
suas UFs.

## Consulta e navegação

- As tabs `Todos`, `Admin`, `Gerencial` e `Promotor` filtram a tabela e exibem a
  contagem de cada perfil. Por isso, a tela não replica esses números em cards nem
  oferece um segundo seletor de perfil.
- Pesquisa, UF e status podem ser combinados com a tab selecionada.
- Toda linha é acionável por clique, `Enter` ou barra de espaço e abre
  **Informações do Usuário**, independentemente do perfil.
- A tabela não possui colunas de Gerencial ou Ações: as operações ficam
  centralizadas no modal de informações/edição. A coluna `Lojas` informa a
  quantidade de atribuições somente para Promotores.
- `Último acesso` registra a abertura validada da aplicação por meio de uma
  função autenticada no banco; usuários que ainda não abriram a aplicação são
  identificados como `Nunca`.
- Para Promotores com lojas atribuídas, o modal exibe a roteirização na ordem de
  `loja_promotores.posicao`, com código, UF, nome da loja e pesquisa local.

## Edição e papéis

A edição parte do ícone de lápis no modal de informações. Um Gerencial continua
limitado a Promotores de suas UFs. Um Admin pode alterar usuários entre Admin,
Gerencial e Promotor; ao salvar, a Edge Function sincroniza simultaneamente
`usuarios.perfil` e `auth.users.app_metadata.role`.

O servidor impede que o último Admin ativo seja rebaixado ou bloqueado e impede
que um usuário bloqueie o próprio acesso. Gerenciais exigem ao menos uma UF,
Promotores exatamente uma UF e Admins sempre têm escopo global.
