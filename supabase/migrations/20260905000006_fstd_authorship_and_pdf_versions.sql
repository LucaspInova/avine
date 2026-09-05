-- Lote 1: autoria operacional e materializacao versionada do PDF FSTD.

alter table public.fstd_processos
  add column if not exists criado_por uuid references public.usuarios(id) on delete set null,
  add column if not exists atualizado_por uuid references public.usuarios(id) on delete set null;

comment on column public.fstd_processos.criado_por is
  'Usuario autenticado que iniciou a FSTD. Imutavel depois de registrado.';
comment on column public.fstd_processos.atualizado_por is
  'Usuario autenticado responsavel pela ultima alteracao operacional da FSTD.';

create index if not exists fstd_processos_criado_por_idx
  on public.fstd_processos (criado_por);
create index if not exists fstd_processos_atualizado_por_idx
  on public.fstd_processos (atualizado_por);

alter table public.fstd_documentos
  add column if not exists conteudo_versao integer not null default 1,
  add column if not exists versao_publicada integer not null default 0,
  add column if not exists pdf_status text not null default 'pendente',
  add column if not exists pdf_erro text;

alter table public.fstd_documentos
  drop constraint if exists fstd_documentos_conteudo_versao_check,
  add constraint fstd_documentos_conteudo_versao_check check (conteudo_versao >= 1),
  drop constraint if exists fstd_documentos_versao_publicada_check,
  add constraint fstd_documentos_versao_publicada_check
    check (versao_publicada >= 0 and versao_publicada <= conteudo_versao),
  drop constraint if exists fstd_documentos_pdf_status_check,
  add constraint fstd_documentos_pdf_status_check
    check (pdf_status in ('pendente', 'disponivel', 'erro'));

create table if not exists public.fstd_documento_versoes (
  id uuid primary key default gen_random_uuid(),
  documento_id uuid not null references public.fstd_documentos(id) on delete cascade,
  versao integer not null check (versao >= 1),
  pdf_path text not null,
  pdf_metadata jsonb not null default '{}'::jsonb,
  gerado_por uuid references public.usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (documento_id, versao),
  unique (pdf_path)
);

comment on table public.fstd_documento_versoes is
  'Historico imutavel das versoes materializadas do PDF de cada FSTD.';

create or replace function app_private.can_current_user_read_process(p_processo_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.fstd_processos p
    join public.usuarios owner on owner.id = p.promotor_id
    where p.id = p_processo_id
      and (
        app_private.can_current_user_access_process(p.id)
        or (
          owner.auth_user_id = auth.uid()
          and owner.ativo is true
          and owner.acesso_habilitado is true
        )
      )
  )
$$;

revoke all on function app_private.can_current_user_read_process(uuid) from public, anon;
grant execute on function app_private.can_current_user_read_process(uuid) to authenticated, service_role;

alter table public.fstd_documento_versoes enable row level security;

drop policy if exists fstd_documento_versoes_select_scoped
  on public.fstd_documento_versoes;
create policy fstd_documento_versoes_select_scoped
  on public.fstd_documento_versoes
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.fstd_documentos d
      where d.id = fstd_documento_versoes.documento_id
        and app_private.can_current_user_read_process(d.processo_id)
    )
  );

revoke all on table public.fstd_documento_versoes from public, anon;
grant select on table public.fstd_documento_versoes to authenticated;
grant all on table public.fstd_documento_versoes to service_role;

create or replace function app_private.current_usuario_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select u.id
  from public.usuarios u
  where u.auth_user_id = auth.uid()
    and u.ativo is true
    and u.acesso_habilitado is true
  limit 1
$$;

revoke all on function app_private.current_usuario_id() from public, anon;
grant execute on function app_private.current_usuario_id() to authenticated, service_role;

create or replace function app_private.stamp_fstd_process_authorship()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario_id uuid := app_private.current_usuario_id();
begin
  if tg_op = 'INSERT' then
    if new.criado_por is null then
      new.criado_por := v_usuario_id;
    end if;
    if new.atualizado_por is null then
      new.atualizado_por := coalesce(v_usuario_id, new.criado_por);
    end if;
  else
    -- Depois de conhecido, o autor original nunca pode ser trocado.
    if old.criado_por is not null then
      new.criado_por := old.criado_por;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists fstd_processos_stamp_authorship on public.fstd_processos;
create trigger fstd_processos_stamp_authorship
before insert or update on public.fstd_processos
for each row execute function app_private.stamp_fstd_process_authorship();

create or replace function app_private.touch_fstd_process_from_product()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario_id uuid := app_private.current_usuario_id();
  v_processo_id uuid := coalesce(new.processo_id, old.processo_id);
begin
  if v_usuario_id is null then
    return coalesce(new, old);
  end if;

  update public.fstd_processos p
  set atualizado_por = v_usuario_id,
      updated_at = now()
  where p.id = v_processo_id;

  if tg_op = 'UPDATE' and to_jsonb(new) - 'updated_at' is distinct from to_jsonb(old) - 'updated_at' then
    update public.fstd_documentos d
    set conteudo_versao = greatest(d.conteudo_versao, d.versao_publicada + 1),
        pdf_path = null,
        pdf_status = 'pendente',
        pdf_erro = null,
        pdf_metadata = coalesce(d.pdf_metadata, '{}'::jsonb)
          || jsonb_build_object(
            'invalidated_at', now(),
            'invalidated_by', v_usuario_id,
            'invalidated_reason', 'fstd_product_changed'
          ),
        updated_at = now()
    from public.fstd_processos p
    where d.processo_id = v_processo_id
      and p.id = v_processo_id
      and p.status = 'concluida';
  end if;

  return new;
end;
$$;

drop trigger if exists fstd_produtos_touch_process on public.fstd_produtos;
create trigger fstd_produtos_touch_process
after insert or update on public.fstd_produtos
for each row execute function app_private.touch_fstd_process_from_product();

-- O campo promotor_id foi mutavel no historico. Por isso o backfill nao o
-- promove a autor confirmado: registros anteriores permanecem sem autor exato.
update public.fstd_processos
set atualizado_por = promotor_id
where atualizado_por is null;

create or replace function public.get_fstd_document_payload(p_processo_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_document public.fstd_documentos;
  v_payload jsonb;
begin
  if not app_private.can_current_user_read_process(p_processo_id) then
    raise exception 'FSTD concluida nao encontrada ou sem permissao.' using errcode = '42501';
  end if;

  select p.*
  into v_document
  from app_private.ensure_fstd_document(p_processo_id) p;

  select jsonb_build_object(
    'documento', to_jsonb(v_document),
    'criado_por', jsonb_build_object(
      'id', criador.id,
      'nome', criador.nome
    ),
    'atualizado_por', jsonb_build_object(
      'id', editor.id,
      'nome', editor.nome
    ),
    'responsavel_nome', coalesce(editor.nome, criador.nome, historico.nome, 'Responsavel nao identificado'),
    'autor_nome', coalesce(criador.nome, historico.nome, 'Autor historico nao identificado'),
    'autoria_historica_inferida', (processo.criado_por is null)
  )
  into v_payload
  from public.fstd_processos processo
  left join public.usuarios criador on criador.id = processo.criado_por
  left join public.usuarios editor on editor.id = processo.atualizado_por
  left join public.usuarios historico on historico.id = processo.promotor_id
  where processo.id = p_processo_id
    and processo.status = 'concluida';

  if v_payload is null then
    raise exception 'FSTD concluida nao encontrada ou sem permissao.' using errcode = '42501';
  end if;

  return v_payload;
end;
$$;

revoke all on function public.get_fstd_document_payload(uuid) from public, anon;
grant execute on function public.get_fstd_document_payload(uuid) to authenticated, service_role;

create or replace function public.set_fstd_document_pdf(
  p_document_id uuid,
  p_pdf_path text,
  p_pdf_metadata jsonb default '{}'::jsonb
)
returns public.fstd_documentos
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_document public.fstd_documentos;
  v_usuario_id uuid := app_private.current_usuario_id();
  v_expected_version integer;
begin
  if nullif(pg_catalog.btrim(p_pdf_path), '') is null then
    raise exception 'O caminho do PDF e obrigatorio.' using errcode = '22023';
  end if;

  if v_usuario_id is null then
    raise exception 'Usuario ativo obrigatorio para publicar o PDF.' using errcode = '42501';
  end if;

  v_expected_version := nullif(p_pdf_metadata ->> 'content_version', '')::integer;
  if v_expected_version is null or v_expected_version < 1 then
    raise exception 'A versao do conteudo do PDF e obrigatoria.' using errcode = '22023';
  end if;

  select d.*
  into v_document
  from public.fstd_documentos d
  where d.id = p_document_id
    and app_private.can_current_user_read_process(d.processo_id)
  for update;

  if v_document.id is null then
    raise exception 'Documento FSTD nao encontrado ou sem permissao.' using errcode = '42501';
  end if;

  if v_document.conteudo_versao <> v_expected_version then
    raise exception 'O conteudo da FSTD mudou durante a geracao do PDF. Gere novamente.'
      using errcode = '40001';
  end if;

  insert into public.fstd_documento_versoes (
    documento_id,
    versao,
    pdf_path,
    pdf_metadata,
    gerado_por
  ) values (
    v_document.id,
    v_expected_version,
    pg_catalog.btrim(p_pdf_path),
    coalesce(p_pdf_metadata, '{}'::jsonb),
    v_usuario_id
  )
  on conflict (documento_id, versao) do update
    set pdf_path = excluded.pdf_path,
        pdf_metadata = excluded.pdf_metadata,
        gerado_por = excluded.gerado_por;

  update public.fstd_documentos d
  set pdf_path = pg_catalog.btrim(p_pdf_path),
      pdf_metadata = coalesce(p_pdf_metadata, '{}'::jsonb),
      versao_publicada = v_expected_version,
      pdf_status = 'disponivel',
      pdf_erro = null,
      updated_at = now()
  where d.id = v_document.id
  returning d.* into v_document;

  return v_document;
end;
$$;

revoke all on function public.set_fstd_document_pdf(uuid, text, jsonb) from public, anon;
grant execute on function public.set_fstd_document_pdf(uuid, text, jsonb) to authenticated, service_role;

-- Relatorios passam a expor os tres papeis sem substituir o contrato legado.
create or replace view public.fstd_autoria
with (security_invoker = true)
as
select
  p.id as processo_id,
  p.promotor_id as promotor_rota_id,
  promotor.nome as promotor_rota_nome,
  p.criado_por,
  criador.nome as criado_por_nome,
  p.atualizado_por,
  editor.nome as atualizado_por_nome,
  coalesce(editor.nome, criador.nome, promotor.nome) as responsavel_nome,
  (p.criado_por is null) as autoria_historica_inferida
from public.fstd_processos p
left join public.usuarios promotor on promotor.id = p.promotor_id
left join public.usuarios criador on criador.id = p.criado_por
left join public.usuarios editor on editor.id = p.atualizado_por;

revoke all on table public.fstd_autoria from public, anon;
grant select on table public.fstd_autoria to authenticated, service_role;

-- O nome versionado continua dentro do diretorio do usuario/processo, mas nao
-- sobrescreve versoes anteriores. Leitura aceita tanto a versao atual quanto o
-- historico registrado.
drop policy if exists fstd_pdfs_select_authorized on storage.objects;
drop policy if exists fstd_pdfs_insert_authorized on storage.objects;
drop policy if exists fstd_pdfs_update_authorized on storage.objects;

create policy fstd_pdfs_select_authorized
on storage.objects for select to authenticated
using (
  bucket_id = 'fstd-pdfs'
  and exists (
    select 1
    from public.fstd_documentos d
    where app_private.can_current_user_read_process(d.processo_id)
      and (
        d.pdf_path = storage.objects.name
        or exists (
          select 1
          from public.fstd_documento_versoes v
          where v.documento_id = d.id
            and v.pdf_path = storage.objects.name
        )
      )
  )
);

create policy fstd_pdfs_insert_authorized
on storage.objects for insert to authenticated
with check (
  bucket_id = 'fstd-pdfs'
  and storage.objects.name ~ (
    '^' || auth.uid()::text || '/[0-9a-fA-F-]{36}/[0-9]{6,7}-v[0-9]+[.]pdf$'
  )
  and app_private.can_current_user_read_process(
    split_part(storage.objects.name, '/', 2)::uuid
  )
);

create policy fstd_pdfs_update_authorized
on storage.objects for update to authenticated
using (
  bucket_id = 'fstd-pdfs'
  and app_private.can_current_user_read_process(
    split_part(storage.objects.name, '/', 2)::uuid
  )
)
with check (
  bucket_id = 'fstd-pdfs'
  and storage.objects.name ~ (
    '^' || auth.uid()::text || '/[0-9a-fA-F-]{36}/[0-9]{6,7}-v[0-9]+[.]pdf$'
  )
  and app_private.can_current_user_read_process(
    split_part(storage.objects.name, '/', 2)::uuid
  )
);
