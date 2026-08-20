-- Preserve row-level lineage for the finalized legacy NFDs loaded from the
-- COPIA V1 tab. The staging upload is already deduplicated by source_hash.
alter table public.fstd_legado
  add column if not exists source_hash text;

create unique index if not exists fstd_legado_source_hash_uidx
  on public.fstd_legado (source_hash)
  where source_hash is not null;

-- Match pre-existing destination rows one-to-one before inserting anything.
-- Ranking keeps this safe even when the legacy source contains repeated
-- logical IDs or byte-identical rows.
with staged as (
  select s.*,
    row_number() over (
      partition by codigo_loja, numero_nfd, id, numero_controle,
        data_preenchimento, responsavel_fstd, motivo,
        qtd_total_galinha, qtd_retorno_galinha,
        qtd_total_codorna, qtd_retorno_codorna, origem
      order by import_id
    ) as occurrence
  from public.fstd_legado_import_staging s
  where s.origem = 'COPIA V1'
), legacy as (
  select f.*,
    row_number() over (
      partition by codigo_loja, numero_nfd, id, numero_controle,
        data_preenchimento, responsavel_fstd, motivo,
        qtd_total_galinha, qtd_retorno_galinha,
        qtd_total_codorna, qtd_retorno_codorna, origem
      order by legado_id
    ) as occurrence
  from public.fstd_legado f
  where f.origem = 'COPIA V1'
    and f.source_hash is null
), matched as (
  select l.legado_id, s.source_hash
  from legacy l
  join staged s
    on s.codigo_loja = l.codigo_loja
   and s.numero_nfd = l.numero_nfd
   and s.id = l.id
   and s.numero_controle is not distinct from l.numero_controle
   and s.data_preenchimento is not distinct from l.data_preenchimento
   and s.responsavel_fstd is not distinct from l.responsavel_fstd
   and s.motivo is not distinct from l.motivo
   and s.qtd_total_galinha is not distinct from l.qtd_total_galinha
   and s.qtd_retorno_galinha is not distinct from l.qtd_retorno_galinha
   and s.qtd_total_codorna is not distinct from l.qtd_total_codorna
   and s.qtd_retorno_codorna is not distinct from l.qtd_retorno_codorna
   and s.origem = l.origem
   and s.occurrence = l.occurrence
)
update public.fstd_legado f
set source_hash = m.source_hash
from matched m
where f.legado_id = m.legado_id
  and f.source_hash is null;

insert into public.fstd_legado (
  codigo_loja, numero_nfd, id, numero_controle, data_preenchimento,
  responsavel_fstd, motivo, qtd_total_galinha, qtd_retorno_galinha,
  qtd_total_codorna, qtd_retorno_codorna, origem, source_hash
)
select
  s.codigo_loja, s.numero_nfd, s.id, s.numero_controle,
  s.data_preenchimento, s.responsavel_fstd, s.motivo,
  s.qtd_total_galinha, s.qtd_retorno_galinha,
  s.qtd_total_codorna, s.qtd_retorno_codorna, s.origem, s.source_hash
from public.fstd_legado_import_staging s
where s.origem = 'COPIA V1'
on conflict (source_hash) where source_hash is not null do nothing;

comment on column public.fstd_legado.source_hash is
  'Hash imutavel da linha de origem para importacoes legadas idempotentes e rollback auditavel.';
