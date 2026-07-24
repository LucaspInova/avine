# Checklist de deploy

1. Criar backup do banco e confirmar o ponto de restauracao.
2. Rodar `npm ci && npm run verify && npm run test:e2e`.
3. Rodar `supabase db reset`, `supabase test db` e `supabase db lint` localmente.
4. Conferir o diff de migrations e de `database.types.ts`.
5. Implantar frontend e validar Gerencial, Promotor proprietario, outro
   Promotor, usuario bloqueado e recuperacao de senha.
6. Confirmar que o frontend publicado usa `manage-users` e
   `iniciar_fstd_produtos_v2`.
7. Em uma migration posterior ao deploy, revogar
   `create_gerencial_user`, `update_gerencial_user` e
   `iniciar_fstd_produtos` legados.
8. Rodar advisors de seguranca/performance e smoke tests.
9. Acompanhar Auth, API, Postgres, Storage, Realtime e Edge Functions por 24
   horas.
