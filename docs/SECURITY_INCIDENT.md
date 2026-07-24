# Resposta ao incidente de credenciais

## Concluido

- as duas senhas expostas foram substituidas;
- sessoes e refresh tokens das duas contas foram revogados;
- os arquivos atuais nao criam contas Auth nem contêm as credenciais;
- senhas novas exigem pelo menos 12 caracteres nas UIs e Edge Functions;
- contas passam a ser provisionadas por `manage-users`.

## Pendente de janela coordenada

As credenciais antigas continuam recuperaveis no historico Git. Como as senhas
ja foram rotacionadas, a exposicao deixou de conceder acesso, mas o historico
deve ser higienizado em uma janela combinada com todos os colaboradores.

Procedimento recomendado:

1. congelar pushes e criar um backup espelho;
2. criar, fora do repositorio, um arquivo de substituicoes contendo os segredos;
3. executar `git filter-repo --replace-text <arquivo-fora-do-repo>`;
4. validar todas as refs e procurar os valores antigos no clone reescrito;
5. fazer force-push coordenado de branches e tags;
6. invalidar caches/forks controlados e solicitar novo clone a todos;
7. remover imediatamente o arquivo de substituicoes.

Nao registre os valores antigos em issues, commits, scripts ou documentacao.

## Configuracao Auth

No projeto remoto ainda e necessario confirmar no Dashboard:

- cadastro publico desabilitado;
- senha minima de 12 caracteres;
- protecao contra senhas vazadas habilitada.

Esses controles ja estao definidos em `supabase/config.toml` para ambientes
locais. A protecao contra senhas vazadas permanece indicada pelo advisor remoto
ate ser ativada no Dashboard.
