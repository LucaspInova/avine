-- The current FSTD workflow uses fstd_processos and fstd_produtos. The legacy
-- fstds table is not referenced by the application and has no client grants.
drop table if exists public.fstds;
