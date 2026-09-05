-- Lote 4 / ponto 2: convivencia explicita entre coleta agregada e por produto.
-- A preferencia vive no usuario, mas cada processo preserva o modo de criacao.

alter table public.usuarios
  add column if not exists modo_coleta text not null default 'produto';

alter table public.usuarios
  drop constraint if exists usuarios_modo_coleta_check;
alter table public.usuarios
  add constraint usuarios_modo_coleta_check
  check (modo_coleta in ('agregado', 'produto'));

comment on column public.usuarios.modo_coleta is
  'Modo usado ao iniciar novas FSTDs vinculadas: agregado (V1) ou produto (V2).';

alter table public.fstd_processos
  add column if not exists modo_coleta text not null default 'produto';

alter table public.fstd_processos
  drop constraint if exists fstd_processos_modo_coleta_check;
alter table public.fstd_processos
  add constraint fstd_processos_modo_coleta_check
  check (modo_coleta in ('agregado', 'produto'));

comment on column public.fstd_processos.modo_coleta is
  'Snapshot imutavel do modo em que a FSTD foi criada.';

create table if not exists public.fstd_resumos_agregados (
  processo_id uuid primary key references public.fstd_processos(id) on delete cascade,
  motivo_id uuid references public.motivos_devolucao(id) on delete restrict,
  quantidade_faturada_galinha integer not null default 0 check (quantidade_faturada_galinha >= 0),
  quantidade_retorno_galinha integer not null default 0 check (quantidade_retorno_galinha >= 0),
  quantidade_faturada_codorna integer not null default 0 check (quantidade_faturada_codorna >= 0),
  quantidade_retorno_codorna integer not null default 0 check (quantidade_retorno_codorna >= 0),
  observacao text,
  fotos jsonb not null default '[]'::jsonb check (jsonb_typeof(fotos) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fstd_resumos_agregados_retorno_galinha_check
    check (quantidade_retorno_galinha <= quantidade_faturada_galinha),
  constraint fstd_resumos_agregados_retorno_codorna_check
    check (quantidade_retorno_codorna <= quantidade_faturada_codorna)
);

comment on table public.fstd_resumos_agregados is
  'Uma linha por FSTD agregada; nunca e rateada ou convertida em produtos.';

alter table public.fstd_resumos_agregados enable row level security;
drop policy if exists fstd_resumos_agregados_select_scoped on public.fstd_resumos_agregados;
create policy fstd_resumos_agregados_select_scoped
on public.fstd_resumos_agregados
for select to authenticated
using (app_private.can_current_user_read_process(processo_id));

revoke all on table public.fstd_resumos_agregados from public, anon, authenticated;
grant select on table public.fstd_resumos_agregados to authenticated;
grant all on table public.fstd_resumos_agregados to service_role;

create or replace function app_private.guard_fstd_collection_mode()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if tg_op = 'UPDATE' and new.modo_coleta is distinct from old.modo_coleta then
    if old.status <> 'cancelada' then
      raise exception 'O modo de coleta de uma FSTD existente nao pode ser alterado.' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists fstd_processos_guard_collection_mode on public.fstd_processos;
create trigger fstd_processos_guard_collection_mode
before update of modo_coleta on public.fstd_processos
for each row execute function app_private.guard_fstd_collection_mode();

create or replace function public.iniciar_fstd_agregada(
  p_loja_id uuid,
  p_nfd_chave_acesso text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_usuario public.usuarios;
  v_loja_codigo text;
  v_chave text := nullif(btrim(p_nfd_chave_acesso), '');
  v_numero text;
  v_galinha integer;
  v_codorna integer;
  v_processo public.fstd_processos;
begin
  select u.* into v_usuario
  from public.usuarios u
  where u.auth_user_id = auth.uid()
    and u.ativo is true
    and u.acesso_habilitado is true
  limit 1;

  if v_usuario.id is null then
    raise exception 'Usuario ativo nao encontrado.' using errcode = '42501';
  end if;
  if v_usuario.perfil = 'Promotor' and v_usuario.modo_coleta <> 'agregado' then
    raise exception 'Este Promotor esta habilitado para coleta por produto.' using errcode = '42501';
  end if;
  if v_chave is null then
    raise exception 'Chave de acesso da NFD obrigatoria.';
  end if;

  select l.codigo into v_loja_codigo
  from public.lojas l
  where l.id = p_loja_id
    and app_private.can_current_user_read_loja(l.id)
  limit 1;
  if v_loja_codigo is null then
    raise exception 'Loja nao encontrada ou sem acesso.' using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_chave, 0));

  select min(ni.nota_fiscal)::text,
         sum(greatest(coalesce(ni.quantidade_galinha, 0), 0))::integer,
         sum(greatest(coalesce(ni.quantidade_codorna, 0), 0))::integer
  into v_numero, v_galinha, v_codorna
  from public.nfd_itens ni
  where ni.chave_acesso::text = v_chave
    and ni.codigo_cliente::text = v_loja_codigo;

  if v_numero is null then
    raise exception 'NFD nao encontrada para a loja informada.';
  end if;

  select p.* into v_processo
  from public.fstd_processos p
  where p.nfd_chave_acesso = v_chave
    and p.status <> 'cancelada'
  for update;

  if v_processo.id is not null then
    if v_processo.loja_id <> p_loja_id or not app_private.can_current_user_read_process(v_processo.id) then
      raise exception 'Esta NFD ja pertence a outro usuario ou loja.' using errcode = '42501';
    end if;
    if v_processo.modo_coleta <> 'agregado' then
      raise exception 'Esta NFD ja foi iniciada no modo por produto.' using errcode = '23514';
    end if;
  else
    insert into public.fstd_processos (
      nfd_chave_acesso, nfd_numero, loja_id, promotor_id,
      criado_por, atualizado_por, modo_coleta
    ) values (
      v_chave, v_numero, p_loja_id, v_usuario.id,
      v_usuario.id, v_usuario.id, 'agregado'
    ) returning * into v_processo;
  end if;

  insert into public.fstd_resumos_agregados (
    processo_id, quantidade_faturada_galinha, quantidade_faturada_codorna
  ) values (
    v_processo.id, coalesce(v_galinha, 0), coalesce(v_codorna, 0)
  )
  on conflict (processo_id) do nothing;

  return v_processo.id;
end;
$function$;

revoke all on function public.iniciar_fstd_agregada(uuid, text) from public, anon;
grant execute on function public.iniciar_fstd_agregada(uuid, text) to authenticated, service_role;

create or replace function public.salvar_fstd_agregada(
  p_processo_id uuid,
  p_motivo_id uuid,
  p_quantidade_retorno_galinha integer,
  p_quantidade_retorno_codorna integer,
  p_observacao text default null,
  p_fotos jsonb default '[]'::jsonb,
  p_finalizar boolean default true
)
returns public.fstd_processos
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_usuario_id uuid := app_private.current_usuario_id();
  v_processo public.fstd_processos;
  v_resumo public.fstd_resumos_agregados;
  v_is_management boolean := app_private.is_current_user_gerencial_ativo();
begin
  if v_usuario_id is null or not app_private.is_current_user_active() then
    raise exception 'Usuario ativo nao encontrado.' using errcode = '42501';
  end if;
  if coalesce(p_quantidade_retorno_galinha, -1) < 0
    or coalesce(p_quantidade_retorno_codorna, -1) < 0 then
    raise exception 'Quantidades de retorno devem ser maiores ou iguais a zero.';
  end if;
  if jsonb_typeof(coalesce(p_fotos, '[]'::jsonb)) <> 'array' then
    raise exception 'Fotos devem ser enviadas em uma lista.';
  end if;

  select p.* into v_processo
  from public.fstd_processos p
  where p.id = p_processo_id
    and p.modo_coleta = 'agregado'
    and app_private.can_current_user_read_process(p.id)
    and (
      v_is_management
      or (p.promotor_id = v_usuario_id and p.status = 'em_andamento')
    )
  for update;

  if v_processo.id is null then
    raise exception 'FSTD agregada nao encontrada ou sem permissao.' using errcode = '42501';
  end if;

  select r.* into v_resumo
  from public.fstd_resumos_agregados r
  where r.processo_id = v_processo.id
  for update;

  if p_quantidade_retorno_galinha > v_resumo.quantidade_faturada_galinha
    or p_quantidade_retorno_codorna > v_resumo.quantidade_faturada_codorna then
    raise exception 'O retorno nao pode ser maior que a quantidade faturada.';
  end if;
  if p_finalizar and p_motivo_id is null then
    raise exception 'Motivo obrigatorio para finalizar a FSTD agregada.';
  end if;
  if p_finalizar and jsonb_array_length(coalesce(p_fotos, '[]'::jsonb)) = 0 then
    raise exception 'Ao menos uma foto e obrigatoria para finalizar a FSTD.';
  end if;

  update public.fstd_resumos_agregados
  set motivo_id = p_motivo_id,
      quantidade_retorno_galinha = p_quantidade_retorno_galinha,
      quantidade_retorno_codorna = p_quantidade_retorno_codorna,
      observacao = nullif(btrim(p_observacao), ''),
      fotos = coalesce(p_fotos, '[]'::jsonb),
      updated_at = now()
  where processo_id = v_processo.id;

  update public.fstd_processos
  set status = case when p_finalizar then 'concluida' else status end,
      finalizada_em = case
        when p_finalizar then coalesce(finalizada_em, now())
        else finalizada_em
      end,
      atualizado_por = v_usuario_id,
      updated_at = now()
  where id = v_processo.id
  returning * into v_processo;

  return v_processo;
end;
$function$;

revoke all on function public.salvar_fstd_agregada(uuid, uuid, integer, integer, text, jsonb, boolean)
from public, anon;
grant execute on function public.salvar_fstd_agregada(uuid, uuid, integer, integer, text, jsonb, boolean)
to authenticated, service_role;

create or replace function app_private.touch_fstd_process_from_aggregate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_usuario_id uuid := app_private.current_usuario_id();
begin
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
            'invalidated_reason', 'fstd_aggregate_changed'
          ),
        updated_at = now()
    from public.fstd_processos p
    where d.processo_id = new.processo_id
      and p.id = new.processo_id
      and p.status = 'concluida';
  end if;
  return new;
end;
$function$;

drop trigger if exists fstd_resumos_agregados_touch_process on public.fstd_resumos_agregados;
create trigger fstd_resumos_agregados_touch_process
after update on public.fstd_resumos_agregados
for each row execute function app_private.touch_fstd_process_from_aggregate();

-- Totais gerais combinam os dois modos; o relatorio por produto permanece
-- inalterado e, portanto, exclui deliberadamente os resumos agregados.
create or replace view public.fstd_relatorio
with (security_invoker = true)
as
with produtos_fstd as (
  select p.id processo_id, fp.id produto_id,
    coalesce(fp.quantidade_faturada_galinha, 0) galinha_faturada,
    coalesce(fp.quantidade_faturada_codorna, 0) codorna_faturada,
    coalesce(fp.quantidade_retorno, 0) retorno,
    fp.motivo_id motivo_produto_id
  from public.fstd_processos p
  join public.fstd_produtos fp on fp.processo_id = p.id
  where p.status = 'concluida' and p.modo_coleta = 'produto'
), totais_produto as (
  select processo_id,
    sum(galinha_faturada) galinha_faturada,
    sum(codorna_faturada) codorna_faturada,
    sum(case when galinha_faturada > 0 then retorno else 0 end) galinha_retorno,
    sum(case when galinha_faturada = 0 and codorna_faturada > 0 then retorno else 0 end) codorna_retorno
  from produtos_fstd group by processo_id
), totais_fstd as (
  select * from totais_produto
  union all
  select r.processo_id,
    r.quantidade_faturada_galinha::bigint,
    r.quantidade_faturada_codorna::bigint,
    r.quantidade_retorno_galinha::bigint,
    r.quantidade_retorno_codorna::bigint
  from public.fstd_resumos_agregados r
  join public.fstd_processos p on p.id = r.processo_id
  where p.status = 'concluida' and p.modo_coleta = 'agregado'
), motivos_por_nota as (
  select pf.processo_id, coalesce(fpm.motivo_id, pf.motivo_produto_id) motivo_id,
    sum(case when fpm.id is not null then coalesce(fpm.quantidade_faturada, 0) else pf.galinha_faturada + pf.codorna_faturada end) quantidade_faturada,
    sum(case when fpm.id is not null then coalesce(fpm.quantidade, 0) else pf.retorno end) quantidade_retorno
  from produtos_fstd pf
  left join public.fstd_produto_motivos fpm on fpm.produto_id = pf.produto_id
  where coalesce(fpm.motivo_id, pf.motivo_produto_id) is not null
  group by pf.processo_id, coalesce(fpm.motivo_id, pf.motivo_produto_id)
  union all
  select r.processo_id, r.motivo_id,
    (r.quantidade_faturada_galinha + r.quantidade_faturada_codorna)::bigint,
    (r.quantidade_retorno_galinha + r.quantidade_retorno_codorna)::bigint
  from public.fstd_resumos_agregados r
  join public.fstd_processos p on p.id = r.processo_id
  where p.status = 'concluida' and r.motivo_id is not null
), motivos_ordenados as (
  select mpn.processo_id, mpn.motivo_id, mpn.quantidade_faturada,
    mpn.quantidade_retorno, md.nome motivo_nome,
    row_number() over (partition by mpn.processo_id order by mpn.quantidade_faturada desc, mpn.quantidade_retorno desc, md.ordem, md.nome, mpn.motivo_id) ordem_motivo
  from motivos_por_nota mpn
  join public.motivos_devolucao md on md.id = mpn.motivo_id
)
select coalesce(nullif(btrim(p.nfd_numero), ''), n.nota_fiscal::text) nfd,
  d.numero_controle fstd,
  concat_ws(' - ', l.codigo, coalesce(nullif(btrim(p.nfd_numero), ''), n.nota_fiscal::text)) id,
  coalesce(n.data_emissao, p.nfd_data_emissao) data_emissao,
  (p.finalizada_em at time zone 'America/Sao_Paulo')::date data_baixa,
  round(case when n.chave_acesso is not null then coalesce(n.valor_galinha, 0) + coalesce(n.valor_codorna, 0) else coalesce(p.nfd_valor, 0) end, 2)::numeric(14,2) valor,
  round(coalesce(n.valor_galinha, 0), 2)::numeric(14,2) vl_galinha,
  round(coalesce(n.valor_codorna, 0), 2)::numeric(14,2) vl_codorna,
  'MALOTE'::text motorista,
  mo.motivo_nome motivo_emissao,
  coalesce(n.nome_abreviado, l.nome) nome_abreviado,
  u.nome responsavel_fstd,
  coalesce(n.quantidade_galinha, tf.galinha_faturada, 0::bigint) galinha_nfd,
  coalesce(n.quantidade_codorna, tf.codorna_faturada, 0::bigint) codorna_nfd,
  coalesce(tf.galinha_retorno, 0::bigint) galinha_retorno,
  coalesce(tf.codorna_retorno, 0::bigint) codorna_retorno
from public.fstd_processos p
join public.lojas l on l.id = p.loja_id
join public.usuarios u on u.id = p.promotor_id
left join public.fstd_documentos d on d.processo_id = p.id
left join public.nfd_notas n on n.chave_acesso::text = p.nfd_chave_acesso
left join totais_fstd tf on tf.processo_id = p.id
left join motivos_ordenados mo on mo.processo_id = p.id and mo.ordem_motivo = 1
where p.status = 'concluida';

comment on view public.fstd_relatorio is
  'Relatorio geral das FSTDs concluidas nos modos produto e agregado; o modo agregado nunca e rateado por produto.';

grant select on public.fstd_relatorio to authenticated;
grant all on public.fstd_relatorio to service_role;

notify pgrst, 'reload schema';
