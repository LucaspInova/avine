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
