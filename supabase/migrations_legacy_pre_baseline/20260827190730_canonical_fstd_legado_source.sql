-- Seleciona uma unica versao por loja/NFD para leituras operacionais.
-- O historico completo continua em public.fstd_legado.
create view public.fstd_legado_canonico
with (security_invoker = true)
as
select distinct on (fl.codigo_loja, fl.numero_nfd)
  fl.*
from public.fstd_legado fl
order by
  fl.codigo_loja,
  fl.numero_nfd,
  case
    when fl.origem = 'v1-atual' then 1
    when fl.origem = 'COPIA V1'
      and fl.source_hash like 'copia-v1-live-%' then 2
    when fl.origem = 'FSTD DIGITAL CSV 2026-08-26' then 3
    when fl.origem = 'COPIA V1' then 4
    when fl.origem = 'v1-backup' then 5
    else 6
  end,
  fl.data_preenchimento desc nulls last,
  fl.created_at desc nulls last,
  fl.legado_id desc;

comment on view public.fstd_legado_canonico is
  'Uma versao operacional por loja/NFD; preserva todas as origens em fstd_legado.';

revoke all on public.fstd_legado_canonico from anon, public;
grant select on public.fstd_legado_canonico to authenticated;

create or replace function public.obter_fstd_legado(p_codigo_loja text, p_numero_nfd text)
returns setof public.fstd_legado
language sql stable security invoker
set search_path=public
as $$
  select *
  from public.fstd_legado_canonico
  where codigo_loja = trim(p_codigo_loja)
    and numero_nfd = trim(p_numero_nfd);
$$;

revoke all on function public.obter_fstd_legado(text,text) from public, anon;
grant execute on function public.obter_fstd_legado(text,text) to authenticated;
notify pgrst, 'reload schema';
