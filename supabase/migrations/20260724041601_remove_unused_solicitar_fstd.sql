-- The published and current frontends use the product workflow. This prototype
-- RPC has no remaining caller and references tables that never reached
-- production.
drop function if exists public.solicitar_fstd(
  uuid, uuid, uuid, integer, integer, integer, text[], text
);

notify pgrst, 'reload schema';
