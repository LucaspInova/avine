-- Diferencia a origem dos logs e substitui o job legado por duas fontes
-- idempotentes. O segredo existente e migrado do comando legado para o Vault
-- sem ser materializado nesta migration.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault with schema vault;

alter table public.nfd_logs
  add column if not exists fonte text not null default 'api';

alter table public.nfd_logs
  drop constraint if exists nfd_logs_fonte_check;

alter table public.nfd_logs
  add constraint nfd_logs_fonte_check
  check (fonte in ('api', 'sheets'));

comment on column public.nfd_logs.fonte is
  'Origem da sincronizacao de NFDs: API Avine ou Google Sheets.';

do $migration$
declare
  v_existing_command text;
  v_cron_secret text;
  v_vault_secret_id uuid;
begin
  select id
    into v_vault_secret_id
    from vault.secrets
   where name = 'avine_cron_secret'
   limit 1;

  if v_vault_secret_id is null then
    select command
      into v_existing_command
      from cron.job
     where jobname = 'sync-devolucoes-avine-diario'
     limit 1;

    if v_existing_command is not null then
      select (regexp_match(
        v_existing_command,
        '"x-cron-secret"\s*:\s*"([^"]+)"'
      ))[1]
      into v_cron_secret;
    end if;

    if nullif(v_cron_secret, '') is not null then
      select vault.create_secret(
        v_cron_secret,
        'avine_cron_secret',
        'Segredo compartilhado pelos cron jobs de sincronizacao de NFDs.'
      )
      into v_vault_secret_id;
    end if;
  end if;

  if v_vault_secret_id is null then
    raise warning using
      message = 'Cron de NFDs nao alterado: crie o secret avine_cron_secret no Vault e configure os dois jobs.';
    return;
  end if;

  if exists (
    select 1 from cron.job where jobname = 'sync-devolucoes-avine-diario'
  ) then
    perform cron.unschedule('sync-devolucoes-avine-diario');
  end if;

  perform cron.schedule(
    'sync-devolucoes-avine-api-diario',
    '0 10 * * *',
    $cron$
      select net.http_post(
        url := 'https://witjyrbdguwmcojzcukz.supabase.co/functions/v1/sync-devolucoes-avine-api',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-secret', (
            select decrypted_secret
              from vault.decrypted_secrets
             where name = 'avine_cron_secret'
             limit 1
          )
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 300000
      ) as request_id;
    $cron$
  );

  -- pg_cron usa UTC; 14:00 UTC corresponde a 11:00 em Sao Paulo.
  perform cron.schedule(
    'sync-devolucoes-avine-sheets-diario',
    '0 14 * * *',
    $cron$
      select net.http_post(
        url := 'https://witjyrbdguwmcojzcukz.supabase.co/functions/v1/sync-devolucoes-avine-sheets',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-secret', (
            select decrypted_secret
              from vault.decrypted_secrets
             where name = 'avine_cron_secret'
             limit 1
          )
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 300000
      ) as request_id;
    $cron$
  );
end;
$migration$;
