# Checklist de deploy

1. Criar backup do banco e confirmar o ponto de restauracao.
2. Rodar `npm ci && npm run verify && npm run test:e2e`.
3. Rodar `supabase db reset`, `supabase test db` e `supabase db lint` localmente.
4. Conferir o diff de migrations e de `database.types.ts`.
5. No Supabase Auth, adicionar a URL publicada seguida de
   `/redefinir-senha` em Redirect URLs. O aplicativo calcula essa URL usando
   `window.location.origin`, permitindo que o mesmo build funcione em cada
   ambiente sem uma URL fixa no código.
6. Implantar frontend e validar Gerencial, Promotor proprietario, outro
   Promotor, usuario bloqueado e recuperacao de senha.
7. Confirmar que o frontend publicado usa `manage-users` e
   `iniciar_fstd_produtos_v2`.
8. Em uma migration posterior ao deploy, revogar
   `create_gerencial_user`, `update_gerencial_user` e
   `iniciar_fstd_produtos` legados.
9. Rodar advisors de seguranca/performance e smoke tests.
10. Acompanhar Auth, API, Postgres, Storage, Realtime e Edge Functions por 24
   horas.

## Sincronizacao de NFDs

1. Conferir `supabase migration list` antes de qualquer alteracao remota.
2. Implantar `sync-devolucoes-avine-api`, `sync-devolucoes-avine-sheets` e
   `sync-fstd-legado-copia-v1`, mas manter temporariamente a funcao legada
   publicada.
3. Rodar `supabase db push --linked --dry-run` e revisar a migration de logs e
   cron antes do push real.
4. Aplicar a migration e confirmar os jobs `sync-devolucoes-avine-api-diario`,
   `sync-devolucoes-avine-sheets-diario` e `sync-fstd-legado-copia-v1` em
   `cron.job`; o ultimo deve usar `5,35 * * * *`.
5. Fazer smoke manual das funcoes para uma data conhecida e conferir
   `nfd_logs.fonte`, contagens, invalidos e ausencia de duplicatas. Para a
   COPIA V1, conferir tambem que registros divergentes permanecem em
   `fstd_legado`.
6. Excluir `sync-devolucoes-avine` somente depois do smoke e manter observacao
   dos dois jobs por pelo menos 24 horas.

Rollback operacional: desagendar somente o job com falha. Enquanto a funcao
legada ainda estiver publicada, o job antigo pode ser recriado apontando para
ela e lendo `avine_cron_secret` do Vault. Nao apagar linhas importadas nem
remover `nfd_logs.fonte`; uma correcao de schema deve ser sempre forward-only.
