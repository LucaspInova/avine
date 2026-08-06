-- Reconcile manually entered FSTDs with the NFD dataset imported from the API.
alter table public.fstd_processos
  add column if not exists conferencia_status text not null default 'pendente',
  add column if not exists conferencia_detalhes jsonb not null default '{}'::jsonb,
  add column if not exists conferencia_em timestamptz,
  add column if not exists api_nfd_chave_acesso text;

alter table public.fstd_processos
  drop constraint if exists fstd_processos_conferencia_status_check;

alter table public.fstd_processos
  add constraint fstd_processos_conferencia_status_check
  check (conferencia_status in ('pendente', 'conferida', 'divergente'));

comment on column public.fstd_processos.conferencia_status is
  'Resultado da conferencia entre a FSTD avulsa e a NFD importada da API.';
comment on column public.fstd_processos.conferencia_detalhes is
  'Campos divergentes ou informacoes da ultima tentativa de conferencia.';
comment on column public.fstd_processos.conferencia_em is
  'Data e hora da ultima tentativa de conferencia.';
comment on column public.fstd_processos.api_nfd_chave_acesso is
  'Chave de acesso encontrada na NFD importada pela API.';

create index if not exists fstd_processos_conferencia_idx
  on public.fstd_processos (is_avulsa, conferencia_status, status, updated_at desc)
  where is_avulsa is true;

create or replace function public.reset_fstd_avulsa_conferencia_on_process_change()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if new.is_avulsa is true
    and new.status = 'em_andamento'
    and (
      old.nfd_data_emissao is distinct from new.nfd_data_emissao
      or old.nfd_valor is distinct from new.nfd_valor
    ) then
    new.conferencia_status := 'pendente';
    new.conferencia_detalhes := '{}'::jsonb;
    new.conferencia_em := null;
    new.api_nfd_chave_acesso := null;
  end if;

  return new;
end;
$function$;

drop trigger if exists fstd_avulsa_conferencia_process_change
  on public.fstd_processos;
create trigger fstd_avulsa_conferencia_process_change
before update on public.fstd_processos
for each row
execute function public.reset_fstd_avulsa_conferencia_on_process_change();

create or replace function public.reset_fstd_avulsa_conferencia_on_product_change()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  update public.fstd_processos as p
  set
    conferencia_status = 'pendente',
    conferencia_detalhes = '{}'::jsonb,
    conferencia_em = null,
    api_nfd_chave_acesso = null,
    updated_at = now()
  where p.id = new.processo_id
    and p.is_avulsa is true
    and p.status = 'em_andamento';

  return new;
end;
$function$;

drop trigger if exists fstd_avulsa_conferencia_product_change
  on public.fstd_produtos;
create trigger fstd_avulsa_conferencia_product_change
after insert or update of codigo_produto, quantidade_faturada_galinha,
  quantidade_faturada_codorna, status on public.fstd_produtos
for each row
execute function public.reset_fstd_avulsa_conferencia_on_product_change();

create or replace function public.conferir_fstd_avulsas()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_processo record;
  v_nfd record;
  v_numero_normalizado text;
  v_mismatches jsonb;
  v_quantity_mismatches jsonb;
  v_conferidas integer := 0;
  v_divergentes integer := 0;
  v_pendentes integer := 0;
begin
  for v_processo in
    select
      p.id,
      p.nfd_numero,
      p.nfd_data_emissao,
      p.nfd_valor,
      p.loja_id,
      l.codigo::text as loja_codigo
    from public.fstd_processos as p
    join public.lojas as l on l.id = p.loja_id
    where p.is_avulsa is true
      and p.status <> 'cancelada'
  loop
    v_numero_normalizado := nullif(
      ltrim(btrim(v_processo.nfd_numero), '0'),
      ''
    );
    v_numero_normalizado := coalesce(v_numero_normalizado, '0');

    select n.*
    into v_nfd
    from public.nfd_notas as n
    where n.nota_fiscal::text = v_numero_normalizado
    order by
      case
        when btrim(coalesce(n.codigo_cliente::text, '')) = btrim(v_processo.loja_codigo)
          then 0
        else 1
      end,
      n.data_emissao desc nulls last
    limit 1;

    if not found then
      update public.fstd_processos
      set
        conferencia_status = 'pendente',
        conferencia_detalhes = jsonb_build_object(
          'status', 'aguardando_api',
          'mensagem', 'A NFD ainda nao foi encontrada na base importada da API.',
          'numero_nfd', v_processo.nfd_numero
        ),
        conferencia_em = now(),
        api_nfd_chave_acesso = null,
        updated_at = now()
      where id = v_processo.id;

      v_pendentes := v_pendentes + 1;
      continue;
    end if;

    v_mismatches := '[]'::jsonb;

    if btrim(coalesce(v_nfd.codigo_cliente::text, ''))
      is distinct from btrim(v_processo.loja_codigo) then
      v_mismatches := v_mismatches || jsonb_build_array(jsonb_build_object(
        'campo', 'codigo_loja',
        'informado', v_processo.loja_codigo,
        'api', v_nfd.codigo_cliente
      ));
    end if;

    if v_processo.nfd_data_emissao is null
      or v_nfd.data_emissao is null
      or v_processo.nfd_data_emissao is distinct from v_nfd.data_emissao then
      v_mismatches := v_mismatches || jsonb_build_array(jsonb_build_object(
        'campo', 'data_emissao',
        'informado', v_processo.nfd_data_emissao,
        'api', v_nfd.data_emissao
      ));
    end if;

    if v_processo.nfd_valor is null
      or v_nfd.valor_total is null
      or abs(v_processo.nfd_valor - v_nfd.valor_total) > 0.01 then
      v_mismatches := v_mismatches || jsonb_build_array(jsonb_build_object(
        'campo', 'valor',
        'informado', v_processo.nfd_valor,
        'api', v_nfd.valor_total
      ));
    end if;

    if exists (
      select 1
      from public.fstd_produtos as fp
      where fp.processo_id = v_processo.id
        and not exists (
          select 1
          from jsonb_array_elements(coalesce(v_nfd.detalhes, '[]'::jsonb)) as item
          where upper(btrim(item->>'codigo_produto')) = upper(btrim(fp.codigo_produto))
        )
    ) then
      v_mismatches := v_mismatches || jsonb_build_array(jsonb_build_object(
        'campo', 'produtos',
        'mensagem', 'Existe produto na FSTD que nao foi encontrado na NFD da API.'
      ));
    end if;

    if exists (
      select 1
      from (
        select distinct upper(btrim(item->>'codigo_produto')) as codigo_produto
        from jsonb_array_elements(coalesce(v_nfd.detalhes, '[]'::jsonb)) as item
      ) as api_product
      where not exists (
        select 1
        from public.fstd_produtos as fp
        where fp.processo_id = v_processo.id
          and upper(btrim(fp.codigo_produto)) = api_product.codigo_produto
      )
    ) then
      v_mismatches := v_mismatches || jsonb_build_array(jsonb_build_object(
        'campo', 'produtos',
        'mensagem', 'Existe produto na NFD da API que nao foi adicionado na FSTD.'
      ));
    end if;

    select coalesce(jsonb_agg(jsonb_build_object(
      'codigo_produto', fp.codigo_produto,
      'fstd_galinha', fp.quantidade_faturada_galinha,
      'api_galinha', api_product.quantidade_galinha,
      'fstd_codorna', fp.quantidade_faturada_codorna,
      'api_codorna', api_product.quantidade_codorna
    )), '[]'::jsonb)
    into v_quantity_mismatches
    from public.fstd_produtos as fp
    left join lateral (
      select
        coalesce(sum(coalesce((item->>'quantidade_galinha')::numeric, 0)), 0)::integer as quantidade_galinha,
        coalesce(sum(coalesce((item->>'quantidade_codorna')::numeric, 0)), 0)::integer as quantidade_codorna
      from jsonb_array_elements(coalesce(v_nfd.detalhes, '[]'::jsonb)) as item
      where upper(btrim(item->>'codigo_produto')) = upper(btrim(fp.codigo_produto))
    ) as api_product on true
    where fp.processo_id = v_processo.id
      and (
        fp.quantidade_faturada_galinha <> api_product.quantidade_galinha
        or fp.quantidade_faturada_codorna <> api_product.quantidade_codorna
      );

    if jsonb_array_length(v_quantity_mismatches) > 0 then
      v_mismatches := v_mismatches || jsonb_build_array(jsonb_build_object(
        'campo', 'quantidades',
        'itens', v_quantity_mismatches
      ));
    end if;

    if jsonb_array_length(v_mismatches) > 0 then
      update public.fstd_processos
      set
        conferencia_status = 'divergente',
        conferencia_detalhes = jsonb_build_object(
          'numero_nfd', v_processo.nfd_numero,
          'api_chave_acesso', v_nfd.chave_acesso,
          'divergencias', v_mismatches
        ),
        conferencia_em = now(),
        api_nfd_chave_acesso = v_nfd.chave_acesso,
        updated_at = now()
      where id = v_processo.id;

      v_divergentes := v_divergentes + 1;
    else
      update public.fstd_processos
      set
        conferencia_status = 'conferida',
        conferencia_detalhes = jsonb_build_object(
          'numero_nfd', v_processo.nfd_numero,
          'api_chave_acesso', v_nfd.chave_acesso,
          'mensagem', 'NFD avulsa conferida com sucesso.'
        ),
        conferencia_em = now(),
        api_nfd_chave_acesso = v_nfd.chave_acesso,
        updated_at = now()
      where id = v_processo.id;

      v_conferidas := v_conferidas + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'conferidas', v_conferidas,
    'divergentes', v_divergentes,
    'pendentes', v_pendentes
  );
end;
$function$;

revoke all on function public.reset_fstd_avulsa_conferencia_on_process_change() from public, anon;
revoke all on function public.reset_fstd_avulsa_conferencia_on_product_change() from public, anon;
revoke all on function public.conferir_fstd_avulsas() from public, anon, authenticated;
grant execute on function public.conferir_fstd_avulsas() to service_role;

notify pgrst, 'reload schema';
;
