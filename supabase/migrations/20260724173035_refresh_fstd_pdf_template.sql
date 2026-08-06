-- Permit an owner to replace the same private PDF when the frontend template
-- version changes, while keeping the object path scoped to that FSTD.
drop policy if exists fstd_pdfs_update_authorized on storage.objects;
create policy fstd_pdfs_update_authorized
on storage.objects
for update
to authenticated
using (
  bucket_id = 'fstd-pdfs'
  and (
    (select app_private.is_current_user_gerencial_ativo())
    or exists (
      select 1
      from public.fstd_documentos as d
      join public.fstd_processos as p on p.id = d.processo_id
      join public.usuarios as u on u.id = p.promotor_id
      where d.pdf_path = storage.objects.name
        and u.auth_user_id = (select auth.uid())
        and u.ativo is true
    )
  )
)
with check (
  bucket_id = 'fstd-pdfs'
  and (
    (select app_private.is_current_user_gerencial_ativo())
    or exists (
      select 1
      from public.fstd_documentos as d
      join public.fstd_processos as p on p.id = d.processo_id
      join public.usuarios as u on u.id = p.promotor_id
      where d.pdf_path = storage.objects.name
        and u.auth_user_id = (select auth.uid())
        and u.ativo is true
    )
  )
);

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
    pdf_path = case
      when d.pdf_path is null
        or (p_pdf_metadata ->> 'template_version') is distinct from (d.pdf_metadata ->> 'template_version')
        then trim(p_pdf_path)
      else d.pdf_path
    end,
    pdf_metadata = case
      when d.pdf_path is null
        or (p_pdf_metadata ->> 'template_version') is distinct from (d.pdf_metadata ->> 'template_version')
        then coalesce(p_pdf_metadata, '{}'::jsonb)
      else d.pdf_metadata
    end
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
;
