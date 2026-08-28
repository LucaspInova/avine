-- Sincroniza as finalizacoes do Glide na aba COPIA V1 para o historico legado.
-- Esta migration nao altera a estrutura de public.fstd_legado e nao remove dados.

alter table public.nfd_logs
  drop constraint if exists nfd_logs_fonte_check;

alter table public.nfd_logs
  add constraint nfd_logs_fonte_check
  check (fonte in ('api', 'sheets', 'copia_v1'));

alter table public.nfd_logs
  add column if not exists registros_existentes integer not null default 0,
  add column if not exists registros_divergentes integer not null default 0;

comment on column public.nfd_logs.fonte is
  'Origem da sincronizacao de NFDs: API Avine, Google Sheets de itens ou COPIA V1 do Glide.';

comment on column public.nfd_logs.registros_existentes is
  'Quantidade de registros da fonte que ja existiam no destino ao finalizar a sincronizacao.';

comment on column public.nfd_logs.registros_divergentes is
  'Quantidade de registros COPIA V1 mantidos no legado, mas ausentes ou alterados na fonte.';

-- O indice parcial existente protege os lotes historicos. Este indice completo
-- tambem permite ao Data API usar ON CONFLICT (source_hash) durante o cron;
-- valores NULL continuam podendo se repetir no PostgreSQL.
create unique index if not exists fstd_legado_source_hash_full_uidx
  on public.fstd_legado (source_hash);

do $migration$
declare
  v_job_id bigint;
begin
  select jobid
    into v_job_id
    from cron.job
   where jobname = 'sync-fstd-legado-copia-v1'
   limit 1;

  if v_job_id is null then
    perform cron.schedule(
      'sync-fstd-legado-copia-v1',
      '5,35 * * * *',
      $cron$
        select net.http_post(
          url := 'https://witjyrbdguwmcojzcukz.supabase.co/functions/v1/sync-fstd-legado-copia-v1',
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
  else
    perform cron.alter_job(
      v_job_id,
      schedule => '5,35 * * * *',
      command => $cron$
        select net.http_post(
          url := 'https://witjyrbdguwmcojzcukz.supabase.co/functions/v1/sync-fstd-legado-copia-v1',
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
  end if;
end;
$migration$;
