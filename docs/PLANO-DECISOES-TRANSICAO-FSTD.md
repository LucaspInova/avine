# Plano de decisões para transição da FSTD

> Documento de planejamento iniciado em 05/09/2026. Não autoriza implementação, publicação, migração ou alteração de dados. As decisões abaixo devem ser consolidadas em um plano de execução antes de qualquer mudança.

## Princípios confirmados

- A migração do Glide para React/Supabase e a evolução da coleta agregada para coleta por produto são mudanças distintas.
- A entrada na plataforma nova não deve obrigar todos os usuários a mudar simultaneamente o processo operacional.
- Dados agregados não podem ser rateados, inferidos ou convertidos artificialmente em dados por produto.
- Indicadores gerais podem combinar os dois modelos; indicadores por produto usam somente registros efetivamente coletados por produto.
- O formato utilizado na criação de uma FSTD deve permanecer registrado no próprio documento/processo, mesmo que o modo permitido ao usuário mude depois.
- O sistema deve reutilizar a arquitetura existente sempre que ela atender às regras, sem reconstrução ampla por padrão.

## Ponto 1 — FSTD avulsa

**Prioridade:** operacional crítica.

### Regra de negócio confirmada

- A identidade operacional é única e simultânea: `código da loja + número normalizado da nota`.
- Não deve existir busca por número isolado seguida de preferência ou validação posterior da loja.
- A chave fiscal pode ser preservada como informação técnica, mas não substitui a identidade operacional.
- O produto não entra na chave da nota. Cada produto é um detalhe pertencente à FSTD identificada por loja+nota.
- Quando loja+nota coincidirem, o Promotor não deve receber nova cobrança de preenchimento.

### Diagnóstico atual

- O reconciliador procura inicialmente apenas o número da nota e somente depois prefere/compara a loja.
- Foram localizadas associações reais com nota homônima de outra loja.
- O frontend agrupa códigos alternativos pelo `produto_id`, mas o banco mantém unicidade por código bruto; o mesmo produto canônico já aparece repetido em alguns processos.
- Promotor, Notas Gerenciais e Dashboard não consomem de forma uniforme o vínculo reconhecido da avulsa.

### Decisão de encaminhamento

- Separar a baixa da nota da conferência do detalhamento: somente `loja + número normalizado` decide se a nota importada corresponde à avulsa.
- Se loja ou número não coincidirem, não reconciliar; a nota oficial continua pendente e exige uma nova FSTD, preservando a avulsa como ocorrência distinta.
- Se loja e número coincidirem, vincular a chave fiscal e retirar a nota da fila comum de pendências, sem criar outra FSTD.
- Comparar produtos por identidade canônica, resolvendo aliases antes de apontar ausência, excesso ou diferença de quantidade.
- Quando produtos e quantidades conferirem, marcar a FSTD como finalizada e conferida.
- Quando houver divergência, mover a mesma FSTD para o estado **Revisão pendente**. O Promotor autor poderá reabrir somente os campos necessários à conciliação, comparar o valor oficial com o informado e corrigir faturado, retorno e demais dependências válidas. Gerencial e Admin também poderão resolver a revisão.
- A revisão pelo Promotor é uma exceção restrita ao bloqueio após finalização: não libera edição geral de outras FSTDs concluídas, mantém histórico do valor anterior e registra o autor da correção.
- Uma nova FSTD nunca será criada apenas por divergência de produto; ela só será exigida quando a identidade loja+nota não coincidir.
- A nota fica fora da fila comum do Promotor, mas não entra como plenamente conferida nos indicadores por produto até a divergência ser resolvida. Indicadores gerais não podem contar a ocorrência duas vezes.
- Substituir o alerta genérico atual por uma ação clara de **Conferir dados**, mostrando lado a lado os valores da nota oficial e os informados. O desenho produzido na discussão é apenas referência funcional; a implementação deve reutilizar a identidade visual e os componentes reais do aplicativo.
- Executar a conciliação de forma idempotente e alinhar Promotor, Notas Gerenciais e Dashboard para consumirem o mesmo vínculo e estado.
- Criar primeiro um ambiente de homologação isolado, sem dados ou integrações de produção.
- Preferência atual: branch Supabase isolada e frontend de teste apontado exclusivamente para ela; validar custo/plano antes de criar.
- Carga sintética mínima: usuário, loja, rota, catálogo com aliases, nota normal, avulsa, importação posterior, erro de loja/número e divergências controladas de produto/quantidade.

**Estado:** regra funcional aprovada para planejamento; nenhuma implementação, alteração de dados ou publicação autorizada.

## Ponto 2 — modos agregado e por produto

**Prioridade:** operacional alta para permitir a migração gradual dos usuários do Glide.

### Decisão funcional confirmada

- A plataforma React/Supabase oferecerá dois modos de coleta:
  - **FSTD agregada:** totais por nota, compatível com a experiência operacional da V1.
  - **FSTD por produto:** detalhamento atual da V2.
- A tela de cadastro/edição de usuários terá um controlador do modo de coleta.
- Usuários ainda não habilitados à V2 poderão operar integralmente na plataforma React usando o modo agregado.
- A habilitação por produto será gradual.
- Cada FSTD preservará o modo em que foi criada; alterar o usuário posteriormente não muda documentos existentes.
- Gerencial e Admin poderão consultar e editar FSTDs agregadas conforme seu escopo de acesso.

### Semântica dos dados

- Uma FSTD agregada grava totais faturados e retornados de Galinha e Codorna, sem criar linhas em `fstd_produtos`.
- Uma FSTD por produto continua gravando o detalhamento real por produto e motivo.
- Não haverá rateio aritmético ou proporcional de totais agregados entre produtos.
- Relatórios e indicadores por produto excluem dados agregados ou os identificam como `sem detalhamento por produto`.
- Totais gerais de notas, faturamento e retorno podem combinar FSTD agregada e FSTD por produto, desde que a origem permaneça distinguível.

### Direção arquitetural recomendada

- Tratar conceitualmente o domínio hoje chamado `fstd_legado` como **FSTD agregada**.
- Avaliar a evolução/renomeação física da tabela com compatibilidade para importadores, sincronização e consumidores existentes; não renomear historicamente sem mapear dependências.
- Registros criados diretamente no modo agregado serão a fonte primária de seus próprios totais.
- FSTDs V2 poderão alimentar o domínio agregado somente como **resumo derivado e transacional** dos produtos ao finalizar.
- O resumo derivado da V2 não será editado independentemente: qualquer correção ocorre nos produtos e recalcula o agregado. Isso evita duas fontes divergentes.
- Diferenciar ao menos: modo da coleta, origem do registro, processo V2 de origem quando aplicável, autor, último editor e datas.
- Usar uma operação segura e idempotente para criar/editar o agregado; não liberar inserção direta do cliente na tabela.
- Definir prioridade canônica para que lançamentos feitos no React não sejam ocultados por snapshots antigos do Glide.
- Preservar os registros importados e seus hashes/origens para auditoria e sincronização durante a convivência.

### PDF

- FSTD agregada terá template próprio, baseado no PDF utilizado no Glide e adaptado ao React.
- FSTD por produto mantém o template detalhado atual.
- A escolha do template decorre do modo registrado na FSTD, não do modo atual do usuário.
- Edição posterior deve preservar o formato e a autoria/auditoria do documento.

### Impactos que o plano de execução deverá cobrir

1. Campo de modo de coleta no usuário e controles na gestão de usuários.
2. Snapshot do modo no registro criado.
3. Formulários agregado vinculado e, em fase posterior, agregado avulso.
4. Criação, edição, validações e autorização no banco.
5. Compatibilidade com histórico e sincronização do Glide.
6. Status único nas telas do Promotor e Gerencial.
7. Totais gerais e exclusão explícita do agregado nos indicadores por produto.
8. Geração e reabertura dos dois formatos de PDF.
9. Testes por perfil, modo, origem e troca posterior de habilitação.
10. Estratégia de implantação gradual e rollback.

**Estado:** direção aprovada para planejamento; implementação ainda não autorizada.

## Ponto 3 — desconhecimentos ativos e histórico de comentários

**Prioridade:** baixa por enquanto; a classificação e a ordem final serão revistas após a validação dos demais tópicos.

### Decisão funcional confirmada

- Deve existir somente um caso de desconhecimento ativo para a identidade operacional `código da loja + número normalizado da nota`.
- Uma nova manifestação sobre a mesma nota não deve criar outro desconhecimento ativo.
- Usuários autorizados poderão acrescentar comentários e retificações ao caso existente, formando um histórico.
- Cada comentário deve preservar conteúdo, autor e data; uma retificação não deve apagar nem sobrescrever silenciosamente a manifestação anterior.
- O reconhecimento da nota encerra o caso ativo, preservando todo o histórico para consulta.
- A chave fiscal pode enriquecer o caso quando se tornar disponível, sem transformar a mesma loja+nota em outro desconhecimento.

### Diagnóstico atual

- O Promotor e o Gerencial já podem marcar uma nota como desconhecida e precisam informar um comentário.
- A interface esconde a ação quando já conhece o status e bloqueia o botão durante o envio, mas essa proteção é apenas visual e não cobre telas desatualizadas, usuários diferentes ou gravações concorrentes.
- O banco não possui uma garantia única para impedir mais de um desconhecimento ativo da mesma loja+nota.
- Foram confirmados 58 grupos duplicados ativos, com 78 registros excedentes; em 39 grupos existem comentários diferentes.
- O Promotor consulta o comentário mais recente, mas o utiliza somente para determinar o status; o texto não é exibido. A tela gerencial de Notas não recebe comentário, autor ou data.

### Impactos que o plano de execução deverá cobrir

1. Garantia transacional no banco contra duplicidade ativa, compartilhada pelos fluxos de Promotor e Gerencial.
2. Tratamento idempotente no frontend quando outra sessão já tiver criado o caso.
3. Novo visual para consultar a sequência de comentários e retificações.
4. Ação para acrescentar comentário ao caso existente, com capacidades definidas por perfil.
5. Preservação imutável do comentário original e da autoria/data de cada complemento.
6. Consolidação dos grupos duplicados atuais sem perda de comentários ou autoria.
7. Encerramento único ao reconhecer a nota e testes de concorrência entre usuários e sessões.

**Contexto operacional:** a necessidade foi reforçada por solicitação de coordenação após um Promotor registrar uma justificativa incorreta e ser necessário retificá-la sem perder o relato original.

**Estado:** ajuste aprovado para planejamento; prioridade provisoriamente baixa; implementação ainda não autorizada.

## Ponto 4 — período padrão do Dashboard

### Regra funcional confirmada

- No primeiro dia de cada mês, o Dashboard deve abrir automaticamente o mês anterior completo, do primeiro ao último dia.
- Do segundo dia em diante, o período padrão deve começar no primeiro dia do mês atual e terminar ontem.
- O dia corrente permanece fora do período padrão para evitar indicadores baseados em um dia ainda incompleto.
- A regra deve respeitar a data local da operação, incluindo virada de mês e de ano.

### Diagnóstico atual

- O cálculo atual sempre combina o primeiro dia do mês corrente com ontem.
- No dia 1, ontem pertence ao mês anterior; por isso, a data inicial fica posterior à data final.
- O Dashboard envia esse intervalo automaticamente ao abrir e a RPC rejeita corretamente o período invertido.
- A tela de Notas usa outro cálculo de datas e não é afetada por esse defeito.
- O teste atual cobre apenas um dia comum e não exercita primeiro dia do mês, virada de ano ou fuso local.

### Impactos que o plano de execução deverá cobrir

1. Ajuste localizado do cálculo do período padrão no frontend.
2. Manutenção coerente dos filtros, indicador de período e comparação com o período anterior.
3. Testes determinísticos para dia 1, dia 2, virada de ano e data local da operação.
4. Validação de que a carga inicial nunca envia intervalo invertido ao banco.

**Referência funcional:** a regra é compatível com o comportamento já adotado anteriormente no Lucre Studio, conforme lembrança do proprietário.

**Estado:** regra aprovada para planejamento; implementação ainda não autorizada.

## Ponto 5 — cadastro automático de lojas e gestão de produtos

**Prioridade interna do ponto:** o cadastro e a atualização segura de lojas têm precedência operacional sobre a gestão de produtos, porque lojas novas ou alteradas chegam de forma recorrente e hoje geram solicitações manuais frequentes.

### Regras funcionais confirmadas

- Uma loja recebida pela API ou pelo Google Sheets cujo código ainda não exista deve gerar automaticamente uma nova linha em `lojas`.
- A loja nova deve ficar disponível na área gerencial para posterior vinculação a Promotores na roteirização; a importação não deve atribuir rota automaticamente.
- Com nome, código, UF e cidade válidos na origem, o cadastro não deve depender de intervenção do proprietário ou de outro usuário; o único trabalho operacional restante deve ser a roteirização.
- O cadastro automático deve usar os dados de nome, UF e cidade fornecidos pela origem e não deve criar uma loja inválida quando faltarem campos obrigatórios.
- Alterações cadastrais recorrentes, incluindo mudança de nome ou código, precisam ser detectadas e reconciliadas com regra de precedência e auditoria, evitando tanto sobrescrita indevida quanto criação silenciosa de duas lojas para a mesma unidade.
- Produtos novos precisam ser detectados automaticamente nas duas fontes, mas simplesmente criar uma linha canônica em `produtos` não resolve a classificação.
- A área gerencial terá uma nova seção **Produtos**, indisponível para Promotores, para consultar e administrar catálogo, nomes, categorias, quantidade da embalagem, fotos, status e códigos vinculados.
- Usuários autorizados no ambiente gerencial poderão cadastrar e editar produtos manualmente.
- Códigos novos poderão ser classificados como alias de um produto existente ou como um produto canônico novo.
- Similaridade de descrição, família, espécie e embalagem poderá produzir uma sugestão ou classificação automática quando houver segurança suficiente.
- Quando a classificação automática não for confiável, o código deverá aparecer em uma fila de pendências para decisão gerencial, sem desaparecer da importação.

### Diagnóstico atual

- As Edge Functions de API e Google Sheets já compartilham uma rotina que grava lojas, mas ela faz `upsert` e também pode sobrescrever nome, UF e cidade de lojas existentes.
- A rotina trabalha somente com os itens do lote corrente; existem 6 códigos de loja presentes no histórico de `nfd_itens` e ausentes de `lojas`, abrangendo 10 notas.
- Não há sincronização equivalente para o catálogo de produtos nem uma tela gerencial de Produtos.
- A comparação completa de `nfd_itens` com `produtos_expandidos` encontrou 16 códigos sem catálogo em 989 notas.
- Os dois códigos originalmente visíveis em `fstd_produtos` eram apenas os não resolvidos que já tinham chegado a processos de FSTD.
- `10PA01.014GD02` representa **GB C/15**, embalagem ausente do catálogo atual, e deve ser tratado como produto canônico próprio.
- `10PA01.017EX23` representa **EB C/30 Cuisine e Co** e deve ser tratado como alias do produto canônico **EB C/30**.

### Direção de implementação recomendada

- Ajustar a sincronização de lojas para inserir códigos ausentes sem sobrescrever automaticamente cadastros existentes e executar uma reconciliação inicial das lacunas históricas.
- Definir a política de atualização para lojas já conhecidas e de troca de código, distinguindo loja realmente nova de alteração cadastral da mesma unidade.
- Derivar a fila de produtos pendentes da comparação entre os itens fiscais importados e os códigos já resolvidos no catálogo, evitando uma segunda fonte editável desnecessária.
- Exibir por pendência: código, descrição de origem, volume de notas, primeira e última ocorrência e sugestão de correspondência.
- Oferecer ações gerenciais explícitas para **vincular como alias** ou **criar novo produto**, com formulário pré-preenchido e revisão humana.
- Permitir classificação automática somente com critérios determinísticos e conservadores; nunca agrupar tamanhos ou espécies diferentes apenas por semelhança textual.
- Proteger a gravação no banco para que um código não seja vinculado simultaneamente a produtos canônicos diferentes.
- Resolver os dois códigos confirmados pelo mesmo mecanismo adotado para as demais pendências, preservando quantidades e retornos já registrados.

**Estado:** direção aprovada para planejamento; prioridade e detalhamento da classificação automática serão refinados no plano de execução; implementação ainda não autorizada.

## Ponto 6 — informações logísticas opcionais

### Decisão funcional confirmada

- Data da entrega, número da nota de venda, lote, data do ovo mais velho, motorista e outras informações ocasionais não terão colunas próprias.
- Esses dados são subjetivos, pouco preenchidos e não alimentam relatórios ou consolidações; devem permanecer em um único campo textual de observação.
- O campo continuará opcional no frontend e no banco e não bloqueará criação, preenchimento ou finalização da FSTD.
- A interface deve usar placeholder ou texto de apoio para informar que as observações podem registrar lote, data do ovo, nota de venda, informações de entrega, motorista ou outros comentários relevantes.
- No modo por produto, a observação permanece associada ao produto correspondente. No modo agregado, o formulário terá uma observação geral da FSTD.
- Não deve haver extração automática, cálculo ou interpretação estrutural desses dados nesta fase.

### Diagnóstico atual

- Nota de venda e lotes já aparecem na criação avulsa, mas são concatenados no campo genérico de observação.
- O preenchimento por produto já possui uma observação textual, embora a implementação interna ainda use nomenclatura antiga em alguns pontos.
- Data da entrega e data do ovo mais velho aparecem apenas como espaços sem origem de dados no modelo legado de PDF.
- Motorista não é coletado pelo fluxo atual; o PDF reserva uma área manual de recebimento e o relatório moderno usa o valor genérico `MALOTE`.

### Direção de implementação

- Consolidar a nomenclatura visual e interna como **Observações**, sem criar campos específicos.
- Preservar o texto no registro correspondente e exibi-lo no documento de forma legível.
- Adicionar orientação curta no campo, sem transformar exemplos em itens obrigatórios.
- Manter fora do escopo inicial uma etapa digital específica de recebimento/recolhimento.

**Estado:** regra aprovada para planejamento; implementação ainda não autorizada.

## Ponto 7 — vínculos de Promotores por loja sem limite fixo

### Decisão funcional confirmada

- A roteirização não terá quantidade mínima nem máxima de Promotores por loja.
- A interface substituirá as três posições fixas por uma lista dinâmica com a ação **Adicionar Promotor**.
- O mesmo Promotor não poderá ser vinculado mais de uma vez à mesma loja.
- A regra atual de compatibilidade territorial por UF deve ser preservada.
- Os vínculos continuarão ordenáveis para manter uma apresentação previsível, sem que a ordem represente um limite de vagas.

### Diagnóstico atual

- O frontend apresenta exatamente três seletores de Promotor por loja.
- O banco restringe a posição aos valores 1, 2 e 3, portanto a limitação não é apenas visual.
- Há 117 lojas ocupando as três posições disponíveis.
- A estrutura atual não possui uma restrição específica que impeça repetir o mesmo Promotor na mesma loja.

### Direção de implementação

- Remover o limite de três posições no frontend e no banco.
- Manter uma posição inteira positiva e reorganizar a sequência após remoções ou reordenação.
- Adicionar proteção de unicidade por loja e Promotor no banco, além da prevenção visual.
- Antes de criar a restrição, auditar e tratar eventuais vínculos repetidos ou órfãos sem apagar rotas válidas.
- Validar com quatro ou mais Promotores, inclusão, remoção, reordenação e acesso de rota sem duplicidade.

**Estado:** solução aprovada para planejamento; prioridade provisoriamente baixa e provavelmente posterior aos bloqueadores; implementação ainda não autorizada.

## Ponto 8 — hierarquia de perfis e remoção da elevação de privilégio antiga

### Decisão funcional confirmada

- Permanecem somente três perfis: **Promotor**, **Gerencial** e **Admin**, com correspondência obrigatória às roles de autenticação `promotor`, `gerencial` e `admin`.
- O **Admin** possui acesso global e pode cadastrar lojas e usuários de qualquer perfil, alterar perfis, promover Promotor a Gerencial, promover Gerencial a Admin e editar, desativar ou remover outros usuários Admin.
- O **Gerencial** preserva as capacidades operacionais atuais, incluindo gestão de rotas, preenchimento de FSTDs, relatórios e administração de Promotores dentro do seu escopo, mas não pode cadastrar lojas nem criar, promover, editar ou remover usuários Gerencial ou Admin.
- O cadastro automático de lojas pelas importações aprovado no ponto 5 é uma ação sistêmica e não concede ao Gerencial a permissão manual de cadastrar lojas.
- O **Promotor** permanece restrito às lojas de sua rota, às notas correspondentes e aos fluxos operacionais já autorizados.
- Subperfis gerenciais — por exemplo logística, supervisão e gerência — poderão ser avaliados posteriormente, mas não fazem parte desta etapa.

### Defeito comprovado

- A Edge Function antiga `create-gerencial-user`, ainda publicada, autoriza tanto Admin quanto Gerencial ativo e aceita como destino Promotor, Gerencial ou Admin.
- Por usar privilégios administrativos, ela permite que um Gerencial contorne a interface e crie diretamente uma conta Admin.
- A interface atual utiliza `manage-users`, que já possui separação de capacidade mais adequada; portanto, a função antiga é redundante e insegura.

### Direção de implementação

- Retirar `create-gerencial-user` do ambiente publicado e remover qualquer referência residual após confirmar novamente que não existem consumidores ativos.
- Manter `manage-users` como único canal administrativo de usuários e alinhar frontend, Edge Function, metadata de autenticação e perfil operacional à matriz aprovada.
- Preservar as capacidades atuais do Gerencial, alterando somente o que permita administrar Gerenciais ou Admins e sem ampliar o cadastro manual de lojas.
- Criar testes negativos por chamada direta: Gerencial não cria, promove, edita, desativa nem remove Gerencial ou Admin; também não opera Promotores fora do próprio escopo territorial.
- Criar testes positivos de Admin para cadastro, alteração de perfil, promoção, desativação e remoção de outros usuários, incluindo outros Admins.
- Manter a exigência de coerência entre perfil operacional e role de autenticação; combinações divergentes não devem conceder acesso.

**Estado:** correção aprovada para planejamento como prioridade máxima antes do piloto; implementação ainda não autorizada.

## Ponto 9 — credencial inicial dos Promotores

### Decisão funcional confirmada

- A senha inicial padrão dos Promotores será mantida nesta primeira etapa para reduzir atrito de acesso e não atrasar a adoção do sistema.
- Não será introduzido agora convite, código de acesso por e-mail nem troca obrigatória no primeiro login.
- Admin e Gerencial poderão definir ou redefinir a senha de um Promotor dentro do escopo já autorizado, inclusive para prestar suporte de acesso.
- A senha atual não será exibida: o Supabase Auth armazena um resumo criptográfico não reversível, e criar armazenamento paralelo em texto legível seria uma regressão grave de segurança. O suporte deve substituir a senha, nunca recuperá-la.
- O fluxo de recuperação de senha já existente deve permanecer disponível para os usuários que necessitarem redefinir a credencial.
- A substituição da senha compartilhada por ativação individual será tratada em um segundo momento, com desenho de experiência e suporte à transição.

### Contexto e risco aceito

- No Glide, os usuários informavam o e-mail e recebiam um código; a mudança para senha já gerou dificuldade operacional de acesso.
- O objetivo imediato é permitir que a equipe entre e utilize a V2 pelo caminho mais simples já conhecido.
- A senha comum é previsível e reutilizada entre novas contas, portanto continua sendo um risco de segurança conhecido enquanto a decisão estiver vigente.
- Esse risco deve permanecer explícito no plano de implantação e ser reavaliado após a estabilização do acesso, sem ser apresentado como segurança já resolvida.

### Evolução posterior proposta

- Avaliar ativação individual por link e definição da própria senha, reutilizando o fluxo de recuperação já existente.
- Planejar comunicação, suporte e transição gradual antes de remover a credencial padrão.
- Quando priorizado, validar expiração do link, recuperação, sessões existentes e experiência móvel dos Promotores.

**Estado:** alteração de credencial adiada por decisão operacional; prioridade baixa nesta etapa; comportamento atual será preservado.

## Ponto 10 — escopo de leitura do histórico agregado e das desconhecidas

### Decisão funcional confirmada

- O **Promotor** só poderá consultar histórico e desconhecimentos correspondentes às lojas atualmente autorizadas para sua rota.
- O **Gerencial** poderá consultar os registros das UFs que lhe foram atribuídas.
- O **Admin** manterá acesso global.
- A regra deve ser garantida no banco e nas funções, independentemente dos filtros ou elementos visíveis no frontend.

### Defeitos comprovados

- A policy atual do histórico agregado legado permite que qualquer usuário ativo consulte todo o conjunto, hoje com cerca de 66 mil registros.
- A leitura gerencial de desconhecimentos verifica que o usuário é Gerencial ativo, mas não restringe os registros às UFs atribuídas.
- Os filtros da interface não impedem chamadas diretas ao banco e, portanto, não constituem proteção suficiente.

### Direção de implementação

- Reescrever as policies e revisar os grants/RPCs relacionados para aplicar Admin global, Gerencial por UF e Promotor por loja da rota.
- Aplicar o mesmo critério nas listagens gerenciais, no histórico do Promotor e nos fluxos de desconhecimento e reconhecimento.
- Considerar a identidade canônica da loja e mudanças de código aprovadas no ponto 5 para não ocultar histórico legítimo após uma atualização cadastral.
- Criar testes negativos por chamada direta, cobrindo Promotor fora da rota, Gerencial fora da UF e usuário com perfil/role inconsistente.
- Criar testes positivos para histórico legítimo da rota, Gerencial com múltiplas UFs e Admin global.

**Estado:** correção aprovada para planejamento como prioridade antes do piloto; impacto predominantemente no backend e implementação ainda não autorizada.

## Ponto 11 — desativação efetiva de usuário e sessão

### Decisão funcional confirmada

- Desativar um usuário deve bloquear imediatamente novas navegações e operações, inclusive quando ele já estiver com uma sessão aberta.
- A desativação não deve apagar o cadastro, os vínculos nem o histórico de autoria do usuário.
- A reativação deve restaurar o acesso permitido pelo perfil e pelos vínculos existentes, sem recriar a conta.
- A regra deve valer igualmente para Promotor, Gerencial e Admin, respeitando quem possui permissão para administrar cada perfil conforme o ponto 8.

### Defeitos comprovados

- O frontend confere a correspondência entre perfil e role, mas não inclui `ativo` e `acesso_habilitado` na decisão final de acesso.
- A Edge Function administrativa identifica o chamador sem consultar esses dois indicadores e pode aceitar chamadas de um Admin ou Gerencial já desativado enquanto sua sessão Auth continuar válida.
- Uma sessão previamente aberta pode, portanto, permanecer operacional mesmo após a alteração do perfil no cadastro.

### Direção de implementação

- Exigir usuário ativo e acesso habilitado no carregamento da aplicação, nas Edge Functions, nos RPCs e nas policies relevantes.
- Ao desativar, invalidar ou encerrar as sessões existentes e limpar imediatamente o estado local quando a aplicação detectar a revogação.
- Manter defesa no backend mesmo que a tela já tenha redirecionado o usuário.
- Ao reativar, remover o bloqueio de autenticação sem alterar autoria, rotas ou registros históricos.
- Testar cada perfil com uma sessão já aberta: desativar por outro usuário autorizado e confirmar bloqueio de navegação, banco, RPC e Edge Function; depois reativar e comprovar a retomada prevista.

**Estado:** correção aprovada para planejamento como prioridade antes do piloto; implementação ainda não autorizada.

## Ponto 12 — estrutura de URLs e percurso de navegação

### Decisão funcional confirmada

- A reorganização das rotas de navegação é essencial e deve ficar entre as principais prioridades do plano.
- Cada aba gerencial terá um endereço próprio e previsível.
- As etapas principais do Promotor também terão caminhos próprios, incluindo a loja, nota ou FSTD selecionada quando o contexto exigir.
- Atualizar a página, usar os controles de voltar/avançar e abrir um link direto deve preservar ou reconstruir corretamente o contexto autorizado.
- A mudança de endereço não altera permissões: o acesso continuará validado por perfil, UF e rota operacional.

### Diagnóstico atual

- O Gerencial usa uma rota geral por perfil e controla quase todas as abas por estado interno salvo no navegador; apenas uma tela possui tratamento específico no endereço.
- O percurso do Promotor entre lojas, notas e FSTD é salvo em memória de sessão, também sem representar integralmente o estado na URL.
- Esse desenho torna a navegação pouco transparente e pode produzir retorno, recarregamento e compartilhamento de endereço diferentes do esperado.
- A tela central gerencial possui aproximadamente 3,3 mil linhas e o workspace principal do Promotor aproximadamente 3,9 mil linhas, concentrando navegação, consultas, formulários e regras operacionais em componentes difíceis de revisar e manter.

### Direção de implementação

- Definir uma árvore canônica de rotas para Admin/Gerencial e Promotor, com nomes estáveis por módulo e detalhe.
- Sincronizar a aba selecionada e o contexto operacional com a URL, eliminando a dependência de armazenamento local como fonte principal da navegação.
- Preservar filtros úteis na URL quando isso permitir retorno consistente à listagem, sem expor dados sensíveis.
- Redirecionar endereços antigos para seus equivalentes canônicos e preservar compatibilidade com favoritos existentes durante a transição.
- Aplicar guards de acesso em todas as entradas diretas e tratar contextos inexistentes ou não autorizados com retorno seguro à listagem permitida.
- Aproveitar a reorganização das rotas para extrair cada módulo em página própria e separar componentes visuais, hooks de estado/orquestração, repositórios de dados e regras de domínio.
- Reutilizar componentes e comportamentos realmente comuns entre Admin, Gerencial e Promotor, sem criar abstrações genéricas que escondam diferenças de permissão ou regra de negócio.
- Fazer a modularização de forma incremental, mantendo testes de caracterização antes de cada extração para provar que filtros, validações, payloads e fluxos existentes foram preservados.
- Evitar novos componentes concentradores com milhares de linhas e estabelecer limites de responsabilidade claros para facilitar leitura, auditoria e manutenção.
- Testar entrada direta, atualização, voltar/avançar, logout/login e troca entre perfis em telas gerenciais e no percurso do Promotor.

**Estado:** solução aprovada para planejamento como uma das principais prioridades; implementação ainda não autorizada.

## Ponto 13 — autoria, responsabilidade e filtro por usuário

### Decisão funcional confirmada

- A autoria da FSTD será separada em **Criado por** e **Atualizado por**.
- **Criado por** é imutável e identifica o usuário que iniciou a FSTD, seja Promotor, Gerencial ou Admin autorizado.
- **Atualizado por** identifica o último usuário que alterou o conteúdo depois da criação e deve ser atualizado junto da data da alteração.
- Uma edição posterior não transfere nem apaga a autoria original.
- Enquanto a nota estiver pendente e não possuir FSTD, a responsabilidade operacional será derivada dos Promotores atualmente vinculados à rota da loja.
- Como uma loja pode ter múltiplos Promotores, o estado pendente poderá apresentar mais de um responsável de rota, sem escolher artificialmente um único nome.

### Apresentação e filtros recomendados

- Manter um filtro principal **Responsável** com semântica contextual: para pendentes, corresponde a qualquer Promotor da rota; para FSTDs iniciadas ou concluídas, corresponde ao usuário de **Criado por**.
- Disponibilizar também filtros explícitos **Promotor da rota**, **Criado por** e **Atualizado por** quando for necessária conferência ou auditoria mais precisa.
- Na listagem, mostrar **Rota: nomes** para pendentes; após criação, mostrar **Criado por: nome** e, somente quando for outra pessoa, **Atualizado por: nome**.
- Exibir datas de criação e última atualização no detalhe, sem poluir a listagem principal.
- No legado, usar `responsavel_fstd` como autoria histórica informativa quando disponível, sem atribuir automaticamente um usuário atual apenas por similaridade de nome.

### Diagnóstico atual e direção de implementação

- A listagem gerencial de Notas não retorna um autor utilizável para filtro.
- `promotor_id` representa o responsável atual do processo e pode ser substituído quando um Gerencial assume a FSTD; por isso não serve sozinho como autoria imutável.
- Não existe hoje uma referência separada ao último editor.
- Adicionar referências explícitas de criação e última atualização, preenchidas no backend em todas as mutações, e expô-las nas consultas gerenciais.
- Preservar registros existentes com uma regra de backfill conservadora: usar a evidência disponível, marcar autoria não comprovada quando necessário e nunca inventar precisão histórica.
- Testar criação e edição cruzadas entre Promotor, Gerencial e Admin, alterações de rota após a criação e filtros combinados por status e usuário.

**Estado:** solução aprovada para planejamento; implementação ainda não autorizada.

## Ponto 14 — autoria, materialização e desempenho do PDF

### Decisão funcional confirmada

- Este ajuste terá **prioridade de execução número 1** no ordenamento final do plano.
- O PDF nunca utilizará como responsável o usuário que apenas abriu, visualizou ou baixou o arquivo.
- O documento exibirá **Preenchido por** a partir do autor original imutável da FSTD e, quando outra pessoa tiver feito alteração substantiva, também **Atualizado por** com o último editor e a respectiva data.
- O PDF será materializado e armazenado, evitando reconstrução completa em cada visualização.
- As fotos não serão incluídas no PDF gerado ou baixado; continuarão preservadas e exibidas nas telas autorizadas do sistema.
- Uma alteração posterior na FSTD gerará uma nova versão do documento; abrir uma versão existente será uma operação somente de leitura e não mudará autoria nem conteúdo.
- A solução deve melhorar o tempo de abertura sem introduzir uma arquitetura desproporcional à necessidade atual.

### Diagnóstico atual

- Os 136 processos concluídos possuem registro documental, mas somente 16 têm `pdf_path`; 120 ainda dependem de geração posterior.
- A geração ocorre no navegador no momento em que o usuário solicita o documento e recebe `profile.nome` da sessão atual como **Responsável Avine**.
- Nesse caminho, a tela carrega as fotos, converte até dez imagens, monta o PDF e faz upload antes de entregar o link; esse trabalho explica uma possível lentidão na abertura do documento, embora ainda seja necessário medir para separar esse custo de outras causas de lentidão na abertura da nota.
- Uma mudança da versão do template também pode provocar regeneração durante a visualização, mesmo sem alteração da FSTD.

### Direção de implementação enxuta

- Gerar e salvar a versão inicial logo após a finalização da FSTD, com operação idempotente e estado visível de geração; se houver falha ou fechamento da tela, permitir retomada segura sem duplicar o documento.
- Nas aberturas seguintes, criar apenas um link temporário para o arquivo já armazenado, sem recompor dados, baixar fotos ou executar o gerador.
- Não regenerar silenciosamente um documento histórico apenas porque o template mudou; uma nova versão deve decorrer de edição da FSTD ou de ação administrativa explícita e auditável.
- Preservar as fotos no armazenamento e no frontend como evidência operacional, desacoplando totalmente seu carregamento da geração e abertura do PDF.
- Versionar os arquivos e metadados de forma simples, mantendo disponível a versão vigente e preservando a anterior para auditoria.
- Medir separadamente tempo de abertura da nota, tempo de geração, tamanho do arquivo e tempo de abertura do PDF antes e depois, para não atribuir toda lentidão ao PDF sem evidência.
- Testar autoria original, edição por outro usuário, simples visualização por terceiro, nova versão após edição, reabertura rápida, falha/repetição da geração e estabilidade do arquivo para todos os perfis autorizados.

**Estado:** solução aprovada para planejamento como prioridade de execução número 1; implementação e publicação ainda não autorizadas.

## Ponto 15 — gate de qualidade, dependências, desempenho e sincronizações

### Decisão funcional confirmada

- O **GitHub Actions** será a fonte oficial para visualizar se uma versão passou ou falhou nas verificações técnicas.
- Uma versão só ficará elegível para publicação quando todas as verificações obrigatórias estiverem verdes; a publicação continuará sendo uma decisão manual e separada.
- O Codex será usado para interpretar os resultados em linguagem simples, investigar falhas e orientar correções.
- Alertas ou automações devem chamar atenção somente para falha relevante, vulnerabilidade nova, dependência que exige ação ou regressão de desempenho; não será criado um dashboard próprio nesta etapa.
- O terminal permanecerá como ferramenta de investigação técnica, não como a superfície principal de acompanhamento do proprietário.
- A regra atual de sincronização entre API e Google Sheets será preservada: itens já existentes continuam sem atualização automática nesta etapa. Uma política de correções e precedência será reavaliada posteriormente, se a operação demonstrar necessidade.

### Estrutura recomendada de verificação

- **Testes automatizados:** cobrir regras de domínio, componentes, banco/RLS e os fluxos críticos de Promotor, Gerencial e Admin.
- **CI:** executar auditoria de dependências, lint, tipos, testes, build, limite de bundle, testes de navegador e testes do banco a cada pull request e envio à branch principal.
- **Dependências:** gerar alertas periódicos, avaliar compatibilidade e testar cada atualização; não atualizar nem mesclar versões automaticamente.
- **Desempenho:** medir abertura de Notas, Dashboard, finalização e abertura do PDF, comparando a faixa mais lenta de uso e não somente a melhor execução.
- **Resumo de execução:** expor no próprio GitHub Actions o resultado por etapa, contagem de testes e medições relevantes; o Codex poderá produzir um resumo sob demanda ou por automação futura.

### Metas iniciais de referência

- Listagens e abertura de nota: alvo inicial de até 2 segundos em uso normal.
- Dashboard no período padrão: alvo inicial de até 3 segundos.
- PDF já armazenado: alvo inicial de até 2 segundos para disponibilizar a abertura.
- Geração inicial do PDF: medir separadamente e não bloquear a navegação de outras telas.
- Refinar os limites após obter uma linha de base real em dispositivo e rede representativos da operação.

### Estado técnico encontrado

- Já existe um workflow do GitHub Actions executado em pull requests e envios à branch principal, dividido entre verificações do frontend e do banco.
- O frontend atual instala dependências, audita vulnerabilidades, executa lint, tipos, testes, build, limite de bundle e testes de navegador em Chromium.
- O job de banco inicia um Supabase local, reaplica as migrações, executa testes SQL, lint do banco e confere os tipos TypeScript gerados.
- Essa estrutura está legível no arquivo técnico do workflow, mas não há documentação operacional simples explicando ao proprietário o objetivo de cada etapa, onde consultar o resultado e como agir diante de uma falha.
- O typecheck passou na inspeção original.
- O lint apresentou 2 erros e a suíte apresentou 5 falhas em 192 testes.
- A auditoria encontrou 4 vulnerabilidades em dependências, incluindo níveis alto e crítico.
- O CI do commit examinado falhou antes de executar build, navegador e testes completos do banco.
- A estrutura necessária já existe; a primeira etapa é corrigir e estabilizar o pipeline atual antes de adicionar ferramentas ou cobertura ampla.

### Regra para publicação

- Antes de ampliar ou substituir o CI, auditar o workflow atual etapa por etapa, remover redundâncias e registrar o que será preservado, alterado ou descartado.
- Criar documentação curta, em linguagem operacional, explicando os indicadores, como abrir uma execução, interpretar falhas e solicitar investigação pelo Codex.
- Se for adotado um workflow novo, executar o formato atual e o candidato em paralelo até comprovar cobertura equivalente ou superior; somente então descontinuar o anterior.
- Corrigir os bloqueadores atuais e manter verdes, no mesmo commit candidato, frontend, banco e fluxos críticos de navegador.
- Não buscar cobertura perfeita nesta fase; priorizar autenticação, autorização, rotas, FSTD vinculada/avulsa/desconhecida, autoria/PDF, Dashboard e importações idempotentes.
- Registrar separadamente o que foi validado automaticamente, o que foi validado manualmente e o que permaneceu não testado.
- Não atribuir automaticamente à sincronização de PDF ou às importações qualquer lentidão sem medição que isole a causa.

**Estado:** solução aprovada para planejamento; sincronização API/Sheets preservada por decisão explícita; implementação e publicação ainda não autorizadas.

## Complementos do planejamento anterior

### Ponto 16 — somente Promotores ocupam rotas de loja

#### Decisão funcional confirmada

- Apenas usuários com perfil e role coerentes de **Promotor** podem ser vinculados em `loja_promotores`.
- O vínculo de rota existe para definir as lojas e notas exibidas no acesso do Promotor.
- O Gerencial acessa as lojas das UFs atribuídas e o Admin acessa todas; nenhum deles deve ocupar uma posição de rota para obter esse acesso.
- Promover um Promotor a Gerencial ou Admin deve remover seus vínculos operacionais de rota de forma transacional, sem alterar a autoria de FSTDs históricas.
- Desativar temporariamente um Promotor bloqueia seu acesso conforme o ponto 11, mas pode preservar os vínculos para permitir reativação sem refazer a roteirização.

#### Diagnóstico e direção de implementação

- Existem 6 vínculos apontando para usuários cujo perfil não é Promotor e 1 vínculo órfão sem usuário.
- Antes da limpeza, listar e registrar os vínculos afetados; remover somente os sete registros inconsistentes após conferir que não representam uma rota válida de Promotor.
- Proteger novas inserções e alterações no banco, além do filtro visual, impedindo perfil diferente de Promotor, referência nula e duplicidade de usuário na mesma loja.
- Ao excluir definitivamente um Promotor, remover o vínculo ativo de rota; o histórico continuará sustentado pelos campos de autoria das FSTDs.
- Testar atribuição, promoção de perfil, desativação/reativação, exclusão e tentativas diretas de inserir Gerencial ou Admin em rota.

**Estado:** regra aprovada para planejamento; saneamento e implementação ainda não autorizados.

**Validações residuais pendentes após o ponto 16:** 3.

### Ponto 17 — alinhar o ajuste de totais das FSTDs legadas com o banco publicado

#### Decisão funcional confirmada

- Manter a possibilidade de Gerencial e Admin corrigirem, de forma auditável, os totais agregados de uma FSTD legada quando ela não possui itens detalhados.
- Preservar a fonte histórica original; a correção deve ser registrada como ajuste separado, com autoria e data.
- A interface não pode oferecer uma ação que falhe porque a função correspondente ainda não existe no banco publicado.

#### Direção de execução futura

- Revisar a migração local e seus testes antes de qualquer publicação.
- Validar o fluxo em ambiente isolado, incluindo permissão por perfil, auditoria e preservação da informação original.
- Somente depois dessa validação, alinhar o banco publicado por migração controlada e confirmar o funcionamento do front-end.
- Incluir essa divergência entre código e banco nas verificações do GitHub Actions para evitar recorrência.

**Estado:** regra aprovada somente para planejamento; nenhuma migração, alteração no banco ou publicação foi autorizada agora.

**Validações residuais pendentes após o ponto 17:** 2.

### Ponto 18 — registros históricos concluídos sem foto

#### Decisão funcional confirmada

- Preservar como estão os 20 registros históricos de produtos concluídos sem foto.
- Não recuperar imagens retroativamente, não invalidar as FSTDs, não criar aviso visual e não desenvolver fluxo novo para esses casos.
- Tratar a provável ausência de fotos na carga histórica do Glide como hipótese, não como causa comprovada.
- Manter as evidências fotográficas armazenadas e exibidas no front-end, embora elas não integrem mais o PDF conforme o ponto 14.

#### Garantia para os novos registros

- O fluxo atual do front-end exige foto para habilitar a conclusão do produto.
- O banco também rejeita a conclusão sem ao menos uma foto, mantendo proteção mesmo fora da interface.
- Preservar essa obrigatoriedade e cobri-la nos testes do fluxo novo, incluindo tentativa direta sem foto e confirmação de que o arquivo foi efetivamente armazenado e associado ao produto correto.
- Planejar a migração global das informações ainda existentes no Glide como uma frente posterior e separada, com inventário e validação próprios; ela não faz parte da regularização destes 20 registros agora.

**Estado:** regra atual mantida; histórico aceito sem intervenção; nenhuma alteração, recuperação ou publicação autorizada.

**Validações residuais pendentes após o ponto 18:** 1.

### Ponto 19 — correções após envio e número da FSTD avulsa

#### Decisão funcional confirmada

- Enquanto a FSTD estiver em andamento, o Promotor responsável pode preencher e editar o seu conteúdo dentro das regras de acesso já definidas.
- Após a finalização, o Promotor passa a ter acesso somente de leitura; correções ficam restritas ao Gerencial dentro das UFs atribuídas e ao Admin em âmbito global.
- Exceção: o Promotor autor pode corrigir a própria FSTD avulsa enquanto ela estiver em `Revisão pendente`, somente pelo fluxo controlado de conciliação definido no ponto 1.
- Preservar o autor original e registrar separadamente quem realizou a última correção, conforme os pontos 13 e 14.
- Retirar do escopo a ideia herdada do Glide de completar posteriormente um número ausente: na V2, a FSTD avulsa exige número antes de avançar e a nota importada recebe o número da fonte.
- O número de uma nota importada não deve ser editável manualmente.
- Permitir somente a correção excepcional e auditada de erro de digitação no número de uma FSTD avulsa, por Gerencial ou Admin, reconciliando com segurança os vínculos dependentes antes de confirmar a mudança.
- Visualizar ou baixar o documento não constitui edição e nunca altera autoria, responsável ou data de atualização.

**Estado:** regra aprovada para planejamento; nenhuma implementação, alteração de dados ou publicação autorizada.

**Validações complementares pendentes após o ponto 19:** 0.

## Revisão concluída

**Tópicos pendentes após a revisão dos 19 pontos:** 0.

Os 15 tópicos da solicitação inicial e os 4 complementos encontrados no cruzamento com o planejamento anterior foram discutidos e receberam decisão funcional. A próxima etapa é validar a ordem de prioridade proposta e então consolidar lotes, dependências e critérios de aceite antes de qualquer execução.

## Registro de execução

Até este ponto foram realizadas somente inspeção, discussão e documentação. Código, banco, permissões, dados, funções, configuração e publicação permanecem inalterados.
