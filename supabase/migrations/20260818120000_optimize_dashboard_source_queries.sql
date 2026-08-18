-- The dashboard fetches invoice item values by access key for both the selected
-- period and its comparison period. Keep that lookup index-only as the dataset
-- grows, instead of repeatedly scanning the synchronized invoice item table.
create index if not exists nfd_itens_dashboard_chave_idx
  on public.nfd_itens (chave_acesso)
  include (codigo_produto, quantidade_galinha, valor_galinha,
    quantidade_codorna, valor_codorna);
comment on index public.nfd_itens_dashboard_chave_idx is
  'Cobre a leitura dos itens financeiros da dashboard por chave de acesso.';
