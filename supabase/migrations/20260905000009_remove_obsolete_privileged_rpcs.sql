-- Lote 2: retirar RPCs privilegiadas substituidas por contratos atuais.

drop function if exists public.create_gerencial_user(uuid, text, text);
drop function if exists public.update_gerencial_user(uuid, text, text, boolean);
drop function if exists public.iniciar_fstd_produtos(uuid, text, text, jsonb);

