create or replace function public.obter_fstd_legado(p_codigo_loja text, p_numero_nfd text)
returns setof public.fstd_legado
language sql stable security invoker
set search_path=public
as $$
  select * from public.fstd_legado
  where codigo_loja=trim(p_codigo_loja) and numero_nfd=trim(p_numero_nfd)
  order by legado_id;
$$;

revoke all on function public.obter_fstd_legado(text,text) from public, anon;
grant execute on function public.obter_fstd_legado(text,text) to authenticated;
notify pgrst, 'reload schema';
