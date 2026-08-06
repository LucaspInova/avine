create index if not exists nfd_desconhecimentos_reconhecida_por_idx
  on public.nfd_desconhecimentos (reconhecida_por)
  where reconhecida_por is not null;;
