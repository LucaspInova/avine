create index if not exists loja_import_alertas_loja_id_idx
  on public.loja_import_alertas (loja_id)
  where loja_id is not null;

create index if not exists produto_catalogo_auditoria_produto_id_idx
  on public.produto_catalogo_auditoria (produto_id);

create index if not exists produto_catalogo_auditoria_usuario_id_idx
  on public.produto_catalogo_auditoria (usuario_id)
  where usuario_id is not null;
