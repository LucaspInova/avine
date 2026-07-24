# Archived migrations

These files document prototypes that were never part of the tracked production
migration history. Supabase intentionally ignores this directory.

- `initial_public_schema` used the abandoned `profiles`, `stores` and
  `user_stores` domain.
- `create_fstd_domain` created prototype tables that do not exist in production.

The production objects still in use (`motivos_devolucao` and the legacy empty
`fstds` table) are defined idempotently in the canonical
`fstd_produtos_workflow` migration. Do not move these files back into
`supabase/migrations`.
