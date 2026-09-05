create table if not exists public.fstd_legado_import_staging (
  import_id bigint generated always as identity primary key,
  codigo_loja text not null,
  numero_nfd text not null,
  id text not null,
  numero_controle text,
  data_preenchimento timestamptz,
  responsavel_fstd text,
  motivo text,
  qtd_total_galinha bigint,
  qtd_retorno_galinha bigint,
  qtd_total_codorna bigint,
  qtd_retorno_codorna bigint,
  origem text not null,
  source_hash text not null unique,
  uploaded_at timestamptz not null default now()
);

alter table public.fstd_legado_import_staging enable row level security;
revoke all on table public.fstd_legado_import_staging from anon, authenticated;

comment on table public.fstd_legado_import_staging is
  'Staging protegido para importacao idempotente de FSTD legado.';
