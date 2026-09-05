-- Lote 4 / pontos 1 e 19: uma FSTD avulsa somente concilia com a nota
-- importada da mesma loja e numero. Divergencias de produto permanecem na
-- mesma FSTD e podem ser reabertas exclusivamente pelo Promotor autor.

alter table public.fstd_processos
  drop constraint if exists fstd_processos_conferencia_status_check;

update public.fstd_processos
set conferencia_status = 'revisao_pendente'
where is_avulsa is true
  and conferencia_status = 'divergente';

alter table public.fstd_processos
  add constraint fstd_processos_conferencia_status_check
  check (conferencia_status in ('pendente', 'conferida', 'revisao_pendente', 'divergente'));

comment on column public.fstd_processos.conferencia_status is
  'Conferencia da avulsa: pendente de nota, conferida ou em revisao por divergencia de produtos. O valor divergente permanece aceito apenas para compatibilidade historica.';

create or replace function app_private.conferir_fstd_avulsa(p_processo_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_processo record;
  v_nfd record;
  v_numero_normalizado text;
  v_produtos_divergentes jsonb;
  v_status text;
begin
  select
    p.id,
    p.nfd_numero,
    p.loja_id,
    p.is_avulsa,
    p.status,
    l.codigo::text as loja_codigo
  into v_processo
  from public.fstd_processos p
  join public.lojas l on l.id = p.loja_id
  where p.id = p_processo_id
    and p.is_avulsa is true
    and p.status <> 'cancelada'
  limit 1;

  if v_processo.id is null then
    raise exception 'FSTD avulsa nao encontrada para conferencia.';
  end if;

  v_numero_normalizado := coalesce(
    nullif(ltrim(btrim(v_processo.nfd_numero), '0'), ''),
    '0'
  );

  -- The identity boundary is exact: another store with the same invoice
  -- number is deliberately ignored instead of being linked as a mismatch.
  select n.*
  into v_nfd
  from public.nfd_notas n
  where coalesce(nullif(ltrim(btrim(n.nota_fiscal::text), '0'), ''), '0') = v_numero_normalizado
    and btrim(coalesce(n.codigo_cliente::text, '')) = btrim(v_processo.loja_codigo)
  order by n.data_emissao desc nulls last, n.chave_acesso
  limit 1;

  if not found then
    update public.fstd_processos
    set conferencia_status = 'pendente',
        conferencia_detalhes = jsonb_build_object(
          'status', 'aguardando_nota',
          'mensagem', 'Nenhuma nota importada foi encontrada para esta loja e numero.',
          'codigo_loja', v_processo.loja_codigo,
          'numero_nfd', v_processo.nfd_numero
        ),
        conferencia_em = now(),
        api_nfd_chave_acesso = null,
        updated_at = now()
    where id = v_processo.id;
    return 'pendente';
  end if;

  with fstd_itens as (
    select
      coalesce(fp.produto_id::text, 'codigo:' || upper(btrim(fp.codigo_produto))) as match_key,
      min(fp.codigo_produto) as codigo_fstd,
      min(fp.nome) as nome_fstd,
      sum(fp.quantidade_faturada_galinha)::integer as fstd_galinha,
      sum(fp.quantidade_faturada_codorna)::integer as fstd_codorna
    from public.fstd_produtos fp
    where fp.processo_id = v_processo.id
    group by coalesce(fp.produto_id::text, 'codigo:' || upper(btrim(fp.codigo_produto)))
  ),
  api_itens as (
    select
      coalesce(catalog.produto_id::text, 'codigo:' || upper(btrim(item->>'codigo_produto'))) as match_key,
      min(item->>'codigo_produto') as codigo_api,
      min(coalesce(catalog.nome, item->>'descricao_produto', item->>'codigo_produto')) as nome_api,
      coalesce(sum(coalesce(nullif(item->>'quantidade_galinha', '')::numeric, 0)), 0)::integer as api_galinha,
      coalesce(sum(coalesce(nullif(item->>'quantidade_codorna', '')::numeric, 0)), 0)::integer as api_codorna
    from jsonb_array_elements(coalesce(v_nfd.detalhes, '[]'::jsonb)) item
    left join lateral (
      select expanded.produto_id, expanded.nome
      from public.produtos_expandidos expanded
      where upper(btrim(expanded.codigo_produto)) = upper(btrim(item->>'codigo_produto'))
      order by expanded.status desc, expanded.produto_id
      limit 1
    ) catalog on true
    group by coalesce(catalog.produto_id::text, 'codigo:' || upper(btrim(item->>'codigo_produto')))
  ),
  diferencas as (
    select
      coalesce(fstd.match_key, api.match_key) as match_key,
      coalesce(api.codigo_api, fstd.codigo_fstd) as codigo_produto,
      coalesce(api.nome_api, fstd.nome_fstd) as nome_produto,
      case
        when fstd.match_key is null then 'ausente_na_fstd'
        when api.match_key is null then 'ausente_na_nota'
        else 'quantidade_divergente'
      end as tipo,
      coalesce(fstd.fstd_galinha, 0) as fstd_galinha,
      coalesce(api.api_galinha, 0) as nota_galinha,
      coalesce(fstd.fstd_codorna, 0) as fstd_codorna,
      coalesce(api.api_codorna, 0) as nota_codorna
    from fstd_itens fstd
    full join api_itens api on api.match_key = fstd.match_key
    where fstd.match_key is null
       or api.match_key is null
       or fstd.fstd_galinha is distinct from api.api_galinha
       or fstd.fstd_codorna is distinct from api.api_codorna
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'chave_produto', match_key,
        'codigo_produto', codigo_produto,
        'nome_produto', nome_produto,
        'tipo', tipo,
        'fstd_galinha', fstd_galinha,
        'nota_galinha', nota_galinha,
        'fstd_codorna', fstd_codorna,
        'nota_codorna', nota_codorna
      )
      order by nome_produto, codigo_produto
    ),
    '[]'::jsonb
  )
  into v_produtos_divergentes
  from diferencas;

  if jsonb_array_length(v_produtos_divergentes) > 0 then
    v_status := 'revisao_pendente';
    update public.fstd_processos
    set conferencia_status = v_status,
        conferencia_detalhes = jsonb_build_object(
          'status', v_status,
          'mensagem', 'A loja e o numero conferem, mas os produtos precisam de revisao.',
          'codigo_loja', v_processo.loja_codigo,
          'numero_nfd', v_processo.nfd_numero,
          'api_chave_acesso', v_nfd.chave_acesso,
          'produtos', v_produtos_divergentes
        ),
        conferencia_em = now(),
        api_nfd_chave_acesso = v_nfd.chave_acesso,
        updated_at = now()
    where id = v_processo.id;
  else
    v_status := 'conferida';
    update public.fstd_processos
    set conferencia_status = v_status,
        conferencia_detalhes = jsonb_build_object(
          'status', v_status,
          'mensagem', 'FSTD avulsa conciliada pela loja, numero e produtos.',
          'codigo_loja', v_processo.loja_codigo,
          'numero_nfd', v_processo.nfd_numero,
          'api_chave_acesso', v_nfd.chave_acesso,
          'produtos', '[]'::jsonb
        ),
        conferencia_em = now(),
        api_nfd_chave_acesso = v_nfd.chave_acesso,
        updated_at = now()
    where id = v_processo.id;
  end if;

  return v_status;
end;
$function$;

revoke all on function app_private.conferir_fstd_avulsa(uuid)
from public, anon, authenticated;
grant execute on function app_private.conferir_fstd_avulsa(uuid) to service_role;

create or replace function public.conferir_fstd_avulsas()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_processo_id uuid;
  v_status text;
  v_conferidas integer := 0;
  v_revisoes integer := 0;
  v_pendentes integer := 0;
begin
  for v_processo_id in
    select p.id
    from public.fstd_processos p
    where p.is_avulsa is true
      and p.status <> 'cancelada'
  loop
    v_status := app_private.conferir_fstd_avulsa(v_processo_id);
    if v_status = 'conferida' then
      v_conferidas := v_conferidas + 1;
    elsif v_status = 'revisao_pendente' then
      v_revisoes := v_revisoes + 1;
    else
      v_pendentes := v_pendentes + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'conferidas', v_conferidas,
    'revisoes_pendentes', v_revisoes,
    'divergentes', v_revisoes,
    'pendentes', v_pendentes
  );
end;
$function$;

revoke all on function public.conferir_fstd_avulsas()
from public, anon, authenticated;
grant execute on function public.conferir_fstd_avulsas() to service_role;

create or replace function public.reabrir_fstd_avulsa_revisao(p_processo_id uuid)
returns public.fstd_processos
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_usuario_id uuid;
  v_processo public.fstd_processos;
begin
  if not app_private.is_current_user_promotor_ativo() then
    raise exception 'Somente um Promotor ativo pode revisar sua FSTD avulsa.' using errcode = '42501';
  end if;

  select u.id
  into v_usuario_id
  from public.usuarios u
  where u.auth_user_id = (select auth.uid())
    and u.perfil = 'Promotor'
    and u.ativo is true
    and u.acesso_habilitado is true
  limit 1;

  select p.*
  into v_processo
  from public.fstd_processos p
  where p.id = p_processo_id
    and p.promotor_id = v_usuario_id
    and p.criado_por = v_usuario_id
    and p.is_avulsa is true
    and p.status = 'concluida'
    and p.conferencia_status in ('revisao_pendente', 'divergente')
    and exists (
      select 1
      from public.loja_promotores lp
      where lp.loja_id = p.loja_id
        and lp.promotor_id = v_usuario_id
    )
  for update;

  if v_processo.id is null then
    raise exception 'FSTD avulsa em revisao nao encontrada ou sem permissao.' using errcode = '42501';
  end if;

  update public.fstd_processos
  set status = 'em_andamento',
      finalizada_em = null,
      atualizado_por = v_usuario_id,
      updated_at = now()
  where id = v_processo.id
  returning * into v_processo;

  update public.fstd_documentos
  set conteudo_versao = greatest(conteudo_versao, versao_publicada + 1),
      pdf_path = null,
      pdf_status = 'pendente',
      pdf_erro = null,
      pdf_metadata = coalesce(pdf_metadata, '{}'::jsonb)
        || jsonb_build_object(
          'invalidated_at', now(),
          'invalidated_by', v_usuario_id,
          'invalidated_reason', 'manual_fstd_reopened_for_review'
        ),
      updated_at = now()
  where processo_id = v_processo.id;

  return v_processo;
end;
$function$;

revoke all on function public.reabrir_fstd_avulsa_revisao(uuid)
from public, anon;
grant execute on function public.reabrir_fstd_avulsa_revisao(uuid)
to authenticated;

comment on function public.reabrir_fstd_avulsa_revisao(uuid) is
  'Reabre a mesma FSTD avulsa somente para o Promotor autor corrigir uma revisao pendente.';

create or replace function app_private.conferir_fstd_avulsa_ao_finalizar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.is_avulsa is true
    and new.status = 'concluida'
    and old.status is distinct from new.status then
    perform app_private.conferir_fstd_avulsa(new.id);
  end if;
  return new;
end;
$function$;

revoke all on function app_private.conferir_fstd_avulsa_ao_finalizar()
from public, anon, authenticated;

drop trigger if exists fstd_avulsa_conferir_ao_finalizar
on public.fstd_processos;
create trigger fstd_avulsa_conferir_ao_finalizar
after update of status on public.fstd_processos
for each row execute function app_private.conferir_fstd_avulsa_ao_finalizar();

notify pgrst, 'reload schema';
