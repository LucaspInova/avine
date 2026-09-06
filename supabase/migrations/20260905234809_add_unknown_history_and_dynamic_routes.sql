-- Lote 6: historico de desconhecimentos e rotas dinamicas.

create or replace function app_private.normalize_invoice_number(p_value text)
returns text
language sql
immutable
strict
set search_path to ''
as $$
  select case
    when cleaned ~ '^[0-9]+$' then coalesce(nullif(ltrim(cleaned, '0'), ''), '0')
    else cleaned
  end
  from (
    select upper(regexp_replace(btrim(p_value), '[^A-Za-z0-9]', '', 'g')) as cleaned
  ) normalized;
$$;

alter table public.nfd_desconhecimentos
  add column if not exists nfd_numero_normalizado text,
  add column if not exists encerramento_motivo text;

update public.nfd_desconhecimentos
set nfd_numero_normalizado = app_private.normalize_invoice_number(nfd_numero)
where nfd_numero_normalizado is null;

alter table public.nfd_desconhecimentos
  alter column nfd_numero_normalizado set not null;

alter table public.nfd_desconhecimentos
  drop constraint if exists nfd_desconhecimentos_encerramento_motivo_check;

alter table public.nfd_desconhecimentos
  add constraint nfd_desconhecimentos_encerramento_motivo_check
  check (encerramento_motivo is null or encerramento_motivo in ('reconhecido', 'consolidado'));

create or replace function public.normalize_nfd_desconhecimento_identity()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  new.nfd_numero_normalizado := app_private.normalize_invoice_number(new.nfd_numero);
  return new;
end;
$$;

drop trigger if exists normalize_nfd_desconhecimento_identity on public.nfd_desconhecimentos;
create trigger normalize_nfd_desconhecimento_identity
before insert or update of nfd_numero
on public.nfd_desconhecimentos
for each row execute function public.normalize_nfd_desconhecimento_identity();

create table if not exists public.nfd_desconhecimento_comentarios (
  id uuid primary key default gen_random_uuid(),
  desconhecimento_id uuid not null references public.nfd_desconhecimentos(id) on delete cascade,
  usuario_id uuid not null references public.usuarios(id) on delete restrict,
  autor_nome text not null,
  autor_perfil text not null,
  tipo text not null default 'comentario',
  comentario text not null,
  created_at timestamptz not null default now(),
  constraint nfd_desconhecimento_comentarios_tipo_check
    check (tipo in ('abertura', 'comentario', 'retificacao', 'reconhecimento')),
  constraint nfd_desconhecimento_comentarios_texto_check
    check (length(btrim(comentario)) > 0)
);

comment on table public.nfd_desconhecimento_comentarios is
  'Historico imutavel de abertura, comentarios, retificacoes e reconhecimento de uma NFD desconhecida.';

create index if not exists nfd_desconhecimento_comentarios_caso_idx
  on public.nfd_desconhecimento_comentarios (desconhecimento_id, created_at, id);
create index if not exists nfd_desconhecimento_comentarios_usuario_idx
  on public.nfd_desconhecimento_comentarios (usuario_id, created_at desc);

insert into public.nfd_desconhecimento_comentarios (
  desconhecimento_id, usuario_id, autor_nome, autor_perfil, tipo, comentario, created_at
)
select
  d.id,
  d.usuario_id,
  coalesce(nullif(btrim(u.nome), ''), u.email, 'Usuario nao identificado'),
  u.perfil,
  'abertura',
  d.comentario,
  d.created_at
from public.nfd_desconhecimentos d
join public.usuarios u on u.id = d.usuario_id
where not exists (
  select 1
  from public.nfd_desconhecimento_comentarios c
  where c.desconhecimento_id = d.id
);

-- Reune primeiro os comentarios dos casos ativos duplicados no caso mais antigo.
with ranked as (
  select
    d.id,
    first_value(d.id) over (
      partition by d.loja_id, d.nfd_numero_normalizado
      order by d.created_at, d.id
    ) as canonical_id,
    row_number() over (
      partition by d.loja_id, d.nfd_numero_normalizado
      order by d.created_at, d.id
    ) as position
  from public.nfd_desconhecimentos d
  where d.reconhecida_em is null
)
update public.nfd_desconhecimento_comentarios c
set desconhecimento_id = ranked.canonical_id
from ranked
where ranked.position > 1
  and c.desconhecimento_id = ranked.id;

with ranked as (
  select
    d.id,
    row_number() over (
      partition by d.loja_id, d.nfd_numero_normalizado
      order by d.created_at, d.id
    ) as position
  from public.nfd_desconhecimentos d
  where d.reconhecida_em is null
)
update public.nfd_desconhecimentos d
set reconhecida_em = coalesce(d.reconhecida_em, now()),
    encerramento_motivo = 'consolidado'
from ranked
where ranked.id = d.id
  and ranked.position > 1;

create unique index if not exists nfd_desconhecimentos_loja_numero_ativo_uidx
  on public.nfd_desconhecimentos (loja_id, nfd_numero_normalizado)
  where reconhecida_em is null;

alter table public.nfd_desconhecimento_comentarios enable row level security;

drop policy if exists nfd_desconhecimento_comentarios_select_scoped
  on public.nfd_desconhecimento_comentarios;
create policy nfd_desconhecimento_comentarios_select_scoped
on public.nfd_desconhecimento_comentarios
for select
to authenticated
using (
  exists (
    select 1
    from public.nfd_desconhecimentos d
    where d.id = nfd_desconhecimento_comentarios.desconhecimento_id
      and app_private.can_current_user_read_loja(d.loja_id)
  )
);

revoke all on table public.nfd_desconhecimento_comentarios from public, anon, authenticated;
grant select on table public.nfd_desconhecimento_comentarios to authenticated;
grant all on table public.nfd_desconhecimento_comentarios to service_role;

drop view if exists public.nfd_desconhecimento_historico;
create view public.nfd_desconhecimento_historico
with (security_invoker = true)
as
select
  d.id as desconhecimento_id,
  d.loja_id,
  d.nfd_referencia,
  d.nfd_chave_acesso,
  d.nfd_numero,
  d.nfd_numero_normalizado,
  d.loja_codigo,
  d.reconhecida_em is null as ativo,
  d.encerramento_motivo,
  c.id as comentario_id,
  c.usuario_id,
  c.autor_nome,
  c.autor_perfil,
  c.tipo,
  c.comentario,
  c.created_at
from public.nfd_desconhecimentos d
join public.nfd_desconhecimento_comentarios c
  on c.desconhecimento_id = d.id;

comment on view public.nfd_desconhecimento_historico is
  'Historico de comentarios por loja e numero de NFD, respeitando o escopo RLS do usuario.';

grant select on public.nfd_desconhecimento_historico to authenticated, service_role;

create or replace function public.registrar_desconhecimento_nfd(
  p_loja_id uuid,
  p_nfd_referencia text,
  p_nfd_chave_acesso text,
  p_nfd_numero text,
  p_loja_codigo text,
  p_comentario text,
  p_tipo text default 'comentario'
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_usuario public.usuarios%rowtype;
  v_numero_normalizado text;
  v_desconhecimento_id uuid;
  v_tipo text;
  v_is_new boolean := false;
begin
  select u.* into v_usuario
  from public.usuarios u
  where u.auth_user_id = auth.uid()
    and u.perfil in ('Admin', 'Gerencial', 'Promotor')
    and u.ativo is true
    and u.acesso_habilitado is true
  limit 1;

  if v_usuario.id is null or not app_private.can_current_user_read_loja(p_loja_id) then
    raise exception 'Usuario ativo sem acesso a loja informada.' using errcode = '42501';
  end if;

  if p_loja_id is null
    or nullif(btrim(coalesce(p_nfd_numero, '')), '') is null
    or nullif(btrim(coalesce(p_comentario, '')), '') is null then
    raise exception 'Loja, numero da NFD e comentario sao obrigatorios.' using errcode = '22023';
  end if;

  v_numero_normalizado := app_private.normalize_invoice_number(p_nfd_numero);
  if v_numero_normalizado = '' then
    raise exception 'Numero da NFD invalido.' using errcode = '22023';
  end if;

  v_tipo := case when p_tipo in ('comentario', 'retificacao') then p_tipo else 'comentario' end;

  perform pg_advisory_xact_lock(hashtextextended(p_loja_id::text || ':' || v_numero_normalizado, 0));

  select d.id into v_desconhecimento_id
  from public.nfd_desconhecimentos d
  where d.loja_id = p_loja_id
    and d.nfd_numero_normalizado = v_numero_normalizado
    and d.reconhecida_em is null
  order by d.created_at, d.id
  limit 1
  for update;

  if v_desconhecimento_id is null then
    insert into public.nfd_desconhecimentos (
      loja_id, usuario_id, nfd_referencia, nfd_chave_acesso,
      nfd_numero, loja_codigo, comentario
    ) values (
      p_loja_id,
      v_usuario.id,
      coalesce(nullif(btrim(p_nfd_referencia), ''), p_loja_id::text || ':' || btrim(p_nfd_numero)),
      nullif(btrim(p_nfd_chave_acesso), ''),
      btrim(p_nfd_numero),
      nullif(btrim(p_loja_codigo), ''),
      btrim(p_comentario)
    )
    returning id into v_desconhecimento_id;
    v_is_new := true;
  else
    update public.nfd_desconhecimentos
    set nfd_referencia = coalesce(nullif(nfd_referencia, ''), nullif(btrim(p_nfd_referencia), '')),
        nfd_chave_acesso = coalesce(nfd_chave_acesso, nullif(btrim(p_nfd_chave_acesso), '')),
        loja_codigo = coalesce(loja_codigo, nullif(btrim(p_loja_codigo), ''))
    where id = v_desconhecimento_id;
  end if;

  insert into public.nfd_desconhecimento_comentarios (
    desconhecimento_id, usuario_id, autor_nome, autor_perfil, tipo, comentario
  ) values (
    v_desconhecimento_id,
    v_usuario.id,
    coalesce(nullif(btrim(v_usuario.nome), ''), v_usuario.email, 'Usuario nao identificado'),
    v_usuario.perfil,
    case when v_is_new then 'abertura' else v_tipo end,
    btrim(p_comentario)
  );

  return v_desconhecimento_id;
end;
$$;

revoke all on function public.registrar_desconhecimento_nfd(uuid, text, text, text, text, text, text)
  from public, anon;
grant execute on function public.registrar_desconhecimento_nfd(uuid, text, text, text, text, text, text)
  to authenticated, service_role;

create or replace function public.desconhecer_nfd_gerencial(
  p_loja_id uuid,
  p_nfd_referencia text,
  p_nfd_chave_acesso text,
  p_nfd_numero text,
  p_loja_codigo text,
  p_comentario text default 'NFD marcada como desconhecida pelo usuario Gerencial.'
)
returns public.nfd_desconhecimentos
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_id uuid;
  v_result public.nfd_desconhecimentos;
begin
  if not exists (
    select 1 from public.usuarios u
    where u.auth_user_id = auth.uid()
      and u.perfil in ('Admin', 'Gerencial')
      and u.ativo is true
      and u.acesso_habilitado is true
  ) then
    raise exception 'Usuario Gerencial ativo nao encontrado.' using errcode = '42501';
  end if;

  v_id := public.registrar_desconhecimento_nfd(
    p_loja_id, p_nfd_referencia, p_nfd_chave_acesso,
    p_nfd_numero, p_loja_codigo, p_comentario, 'retificacao'
  );
  select d.* into v_result from public.nfd_desconhecimentos d where d.id = v_id;
  return v_result;
end;
$$;

revoke all on function public.desconhecer_nfd_gerencial(uuid, text, text, text, text, text)
  from public, anon;
grant execute on function public.desconhecer_nfd_gerencial(uuid, text, text, text, text, text)
  to authenticated, service_role;

create or replace function public.reconhecer_nfd_gerencial(
  p_nfd_referencia text,
  p_nfd_chave_acesso text,
  p_nfd_numero text
)
returns integer
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_usuario public.usuarios%rowtype;
  v_case record;
  v_updated integer := 0;
  v_numero_normalizado text := null;
begin
  select u.* into v_usuario
  from public.usuarios u
  where u.auth_user_id = auth.uid()
    and u.perfil in ('Admin', 'Gerencial')
    and u.ativo is true
    and u.acesso_habilitado is true
  limit 1;

  if v_usuario.id is null then
    raise exception 'Usuario Gerencial ativo nao encontrado.' using errcode = '42501';
  end if;

  if nullif(btrim(coalesce(p_nfd_numero, '')), '') is not null then
    v_numero_normalizado := app_private.normalize_invoice_number(p_nfd_numero);
  end if;

  if nullif(btrim(coalesce(p_nfd_chave_acesso, '')), '') is null
    and nullif(btrim(coalesce(p_nfd_referencia, '')), '') is null then
    raise exception 'Informe a chave de acesso ou a referencia da NFD.' using errcode = '22023';
  end if;

  for v_case in
    select d.id
    from public.nfd_desconhecimentos d
    where d.reconhecida_em is null
      and app_private.can_current_user_access_loja(d.loja_id)
      and (
        (nullif(btrim(coalesce(p_nfd_chave_acesso, '')), '') is not null
          and d.nfd_chave_acesso = btrim(p_nfd_chave_acesso))
        or (nullif(btrim(coalesce(p_nfd_chave_acesso, '')), '') is null
          and nullif(btrim(coalesce(p_nfd_referencia, '')), '') is not null
          and d.nfd_referencia = btrim(p_nfd_referencia))
      )
      and (v_numero_normalizado is null or d.nfd_numero_normalizado = v_numero_normalizado)
    for update
  loop
    insert into public.nfd_desconhecimento_comentarios (
      desconhecimento_id, usuario_id, autor_nome, autor_perfil, tipo, comentario
    ) values (
      v_case.id,
      v_usuario.id,
      coalesce(nullif(btrim(v_usuario.nome), ''), v_usuario.email, 'Usuario nao identificado'),
      v_usuario.perfil,
      'reconhecimento',
      'NFD reconhecida e caso encerrado.'
    );

    update public.nfd_desconhecimentos
    set reconhecida_em = now(),
        reconhecida_por = v_usuario.id,
        encerramento_motivo = 'reconhecido'
    where id = v_case.id;
    v_updated := v_updated + 1;
  end loop;

  if v_updated = 0 then
    raise exception 'Nenhuma marcacao desconhecida ativa foi encontrada para esta NFD.';
  end if;

  return v_updated;
end;
$$;

revoke all on function public.reconhecer_nfd_gerencial(text, text, text)
  from public, anon;
grant execute on function public.reconhecer_nfd_gerencial(text, text, text)
  to authenticated, service_role;

-- Novos registros precisam passar pela RPC para que caso e comentario sejam atomicos.
drop policy if exists nfd_desconhecimentos_insert_current_user_with_store_access
  on public.nfd_desconhecimentos;
revoke insert, update, delete on table public.nfd_desconhecimentos from authenticated;

-- Remove dados de rota impossiveis antes das novas restricoes.
delete from public.loja_promotores lp
where lp.promotor_id is null
   or not exists (
     select 1
     from public.usuarios u
     join public.lojas l on l.id = lp.loja_id
     where u.id = lp.promotor_id
       and u.perfil = 'Promotor'
       and upper(btrim(u.estado)) = upper(btrim(l.uf))
   );

alter table public.loja_promotores
  drop constraint if exists loja_promotores_posicao_check;
alter table public.loja_promotores
  drop constraint if exists loja_promotores_loja_id_posicao_key;
alter table public.loja_promotores
  drop constraint if exists loja_promotores_loja_id_promotor_id_key;

with duplicates as (
  select id,
    row_number() over (
      partition by loja_id, promotor_id
      order by posicao, id
    ) as position
  from public.loja_promotores
)
delete from public.loja_promotores lp
using duplicates d
where d.id = lp.id and d.position > 1;

with ordered as (
  select id,
    row_number() over (partition by loja_id order by posicao, id)::integer as next_position
  from public.loja_promotores
)
update public.loja_promotores lp
set posicao = ordered.next_position
from ordered
where ordered.id = lp.id;

alter table public.loja_promotores
  add constraint loja_promotores_posicao_check check (posicao > 0),
  add constraint loja_promotores_loja_id_posicao_key unique (loja_id, posicao),
  add constraint loja_promotores_loja_id_promotor_id_key unique (loja_id, promotor_id);

comment on table public.loja_promotores is
  'Vinculos ordenados entre lojas e Promotores, sem limite artificial e sem duplicidade por loja.';

create or replace function public.salvar_rota_loja(
  p_loja_id uuid,
  p_promotor_ids uuid[]
)
returns setof public.loja_promotores
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_total integer := coalesce(cardinality(p_promotor_ids), 0);
  v_distinct integer := 0;
begin
  if p_loja_id is null or not app_private.can_current_user_access_loja(p_loja_id) then
    raise exception 'Usuario sem permissao para alterar a rota desta loja.' using errcode = '42501';
  end if;

  select count(distinct item)::integer
  into v_distinct
  from unnest(coalesce(p_promotor_ids, array[]::uuid[])) item;

  if v_total <> v_distinct then
    raise exception 'O mesmo Promotor nao pode aparecer duas vezes na rota.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from unnest(coalesce(p_promotor_ids, array[]::uuid[])) item
    where item is null
       or not app_private.can_current_user_assign_promotor(p_loja_id, item)
  ) then
    raise exception 'A rota aceita somente Promotores ativos da mesma UF da loja.' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('rota:' || p_loja_id::text, 0));

  delete from public.loja_promotores where loja_id = p_loja_id;

  insert into public.loja_promotores (loja_id, promotor_id, posicao)
  select p_loja_id, item, ordinality::integer
  from unnest(coalesce(p_promotor_ids, array[]::uuid[])) with ordinality as route(item, ordinality);

  return query
  select lp.*
  from public.loja_promotores lp
  where lp.loja_id = p_loja_id
  order by lp.posicao;
end;
$$;

revoke all on function public.salvar_rota_loja(uuid, uuid[]) from public, anon;
grant execute on function public.salvar_rota_loja(uuid, uuid[]) to authenticated, service_role;
