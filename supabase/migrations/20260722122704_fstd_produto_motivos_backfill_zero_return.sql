insert into public.fstd_produto_motivos (produto_id, motivo_id, quantidade_faturada, quantidade)
select
  fp.id,
  fp.motivo_id,
  fp.quantidade_faturada_galinha + fp.quantidade_faturada_codorna,
  fp.quantidade_retorno
from public.fstd_produtos as fp
where fp.status = 'concluido'
  and fp.motivo_id is not null
  and not exists (
    select 1
    from public.fstd_produto_motivos as existing
    where existing.produto_id = fp.id
  );
