-- Persist the short FSTD control number and the immutable PDF generated for it.
-- The number is intentionally independent from the invoice/NFD number.
create sequence if not exists public.fstd_numero_controle_seq
  as integer
  start with 100000
  increment by 1
  minvalue 100000
  maxvalue 9999999
  no cycle;

create table if not exists public.fstd_documentos (
  id uuid primary key default gen_random_uuid(),
  processo_id uuid not null references public.fstd_processos(id) on delete cascade,
  numero_controle integer not null default nextval('public.fstd_numero_controle_seq'),
  pdf_path text,
  pdf_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fstd_documentos_processo_unique unique (processo_id),
  constraint fstd_documentos_numero_controle_unique unique (numero_controle),
  constraint fstd_documentos_numero_controle_range check (numero_controle between 100000 and 9999999)
);

create index if not exists fstd_documentos_numero_controle_idx
  on public.fstd_documentos (numero_controle);

drop trigger if exists fstd_documentos_set_updated_at on public.fstd_documentos;
create trigger fstd_documentos_set_updated_at
before update on public.fstd_documentos
for each row
execute function public.fstd_processos_set_updated_at();

revoke all on sequence public.fstd_numero_controle_seq from public, anon, authenticated;
revoke all on table public.fstd_documentos from anon;
grant select on table public.fstd_documentos to authenticated;

alter table public.fstd_documentos enable row level security;

drop policy if exists fstd_documentos_select_authorized on public.fstd_documentos;
create policy fstd_documentos_select_authorized
on public.fstd_documentos
for select
to authenticated
using (
  (select app_private.is_current_user_gerencial_ativo())
  or exists (
    select 1
    from public.fstd_processos as p
    join public.usuarios as u on u.id = p.promotor_id
    where p.id = public.fstd_documentos.processo_id
      and u.auth_user_id = (select auth.uid())
      and u.ativo is true
  )
);

-- Private bucket: PDFs are only accessible through RLS or signed URLs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fstd-pdfs', 'fstd-pdfs', false, 5242880, array['application/pdf']::text[])
on conflict (id) do update set
  public = false,
  file_size_limit = 5242880,
  allowed_mime_types = array['application/pdf']::text[];

drop policy if exists fstd_pdfs_select_authorized on storage.objects;
create policy fstd_pdfs_select_authorized
on storage.objects
for select
to authenticated
using (
  bucket_id = 'fstd-pdfs'
  and exists (
    select 1
    from public.fstd_documentos as d
    join public.fstd_processos as p on p.id = d.processo_id
    join public.usuarios as u on u.id = p.promotor_id
    where d.pdf_path = storage.objects.name
      and (
        (select app_private.is_current_user_gerencial_ativo())
        or (u.auth_user_id = (select auth.uid()) and u.ativo is true)
      )
  )
);

drop policy if exists fstd_pdfs_insert_authorized on storage.objects;
create policy fstd_pdfs_insert_authorized
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'fstd-pdfs'
  and (
    (select app_private.is_current_user_gerencial_ativo())
    or (
      name ~ ('^' || (select auth.uid())::text || '/[0-9a-fA-F-]{36}/[0-9]{6,7}\\.pdf$')
      and exists (
        select 1
        from public.fstd_processos as p
        join public.usuarios as u on u.id = p.promotor_id
        where p.id = split_part(storage.objects.name, '/', 2)::uuid
          and p.status = 'concluida'
          and u.auth_user_id = (select auth.uid())
          and u.ativo is true
      )
    )
  )
);

drop policy if exists fstd_pdfs_update_authorized on storage.objects;
create policy fstd_pdfs_update_authorized
on storage.objects
for update
to authenticated
using (
  bucket_id = 'fstd-pdfs'
  and (select app_private.is_current_user_gerencial_ativo())
)
with check (bucket_id = 'fstd-pdfs');

create or replace function public.get_or_create_fstd_document(p_processo_id uuid)
returns public.fstd_documentos
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_document public.fstd_documentos;
begin
  if not exists (
    select 1
    from public.fstd_processos as p
    join public.usuarios as u on u.id = p.promotor_id
    where p.id = p_processo_id
      and p.status = 'concluida'
      and (
        (select app_private.is_current_user_gerencial_ativo())
        or (u.auth_user_id = (select auth.uid()) and u.ativo is true)
      )
  ) then
    raise exception 'FSTD concluída não encontrada ou sem permissão.' using errcode = '42501';
  end if;

  insert into public.fstd_documentos (processo_id)
  values (p_processo_id)
  on conflict (processo_id) do nothing;

  select *
  into v_document
  from public.fstd_documentos
  where processo_id = p_processo_id;

  return v_document;
end;
$function$;

revoke all on function public.get_or_create_fstd_document(uuid) from public, anon;
grant execute on function public.get_or_create_fstd_document(uuid) to authenticated;

create or replace function public.set_fstd_document_pdf(
  p_document_id uuid,
  p_pdf_path text,
  p_pdf_metadata jsonb default '{}'::jsonb
)
returns public.fstd_documentos
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_document public.fstd_documentos;
begin
  if nullif(trim(p_pdf_path), '') is null then
    raise exception 'O caminho do PDF é obrigatório.' using errcode = '22023';
  end if;

  update public.fstd_documentos as d
  set
    pdf_path = coalesce(d.pdf_path, trim(p_pdf_path)),
    pdf_metadata = case when d.pdf_path is null then coalesce(p_pdf_metadata, '{}'::jsonb) else d.pdf_metadata end
  where d.id = p_document_id
    and exists (
      select 1
      from public.fstd_processos as p
      join public.usuarios as u on u.id = p.promotor_id
      where p.id = d.processo_id
        and p.status = 'concluida'
        and (
          (select app_private.is_current_user_gerencial_ativo())
          or (u.auth_user_id = (select auth.uid()) and u.ativo is true)
        )
    )
  returning d.* into v_document;

  if v_document.id is null then
    raise exception 'Documento FSTD não encontrado ou sem permissão.' using errcode = '42501';
  end if;

  return v_document;
end;
$function$;

revoke all on function public.set_fstd_document_pdf(uuid, text, jsonb) from public, anon;
grant execute on function public.set_fstd_document_pdf(uuid, text, jsonb) to authenticated;

notify pgrst, 'reload schema';
;
