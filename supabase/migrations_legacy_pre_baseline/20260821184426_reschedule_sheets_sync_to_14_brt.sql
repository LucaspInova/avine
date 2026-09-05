-- A planilha costuma ser atualizada apos o agendamento de 11:00 BRT.
-- pg_cron opera em UTC: 17:00 UTC corresponde a 14:00 em Brasilia.
do $migration$
declare
  v_job_id bigint;
begin
  select jobid
    into v_job_id
    from cron.job
   where jobname = 'sync-devolucoes-avine-sheets-diario'
   limit 1;

  if v_job_id is null then
    raise exception
      'Cron job sync-devolucoes-avine-sheets-diario nao encontrado';
  end if;

  perform cron.alter_job(
    v_job_id,
    schedule => '0 17 * * *'
  );
end;
$migration$;
