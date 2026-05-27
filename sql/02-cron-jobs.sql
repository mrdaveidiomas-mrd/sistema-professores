-- =========================================================================
-- HEY, TEACHER! / Mr-Dave — Jobs agendados (pg_cron + Edge Function)
-- =========================================================================
-- Idempotente. Rodar DEPOIS de:
--   • 01-bootstrap.sql (cria as tabelas e policies)
--   • Deploy da Edge Function `generate-monthly-payments`
--   • Habilitar pg_cron e pg_net (Database → Extensions)
--   • Cadastrar segredos no Vault (cron_secret, project_url)
--
-- O que este arquivo agenda:
--   1) Geração mensal de cobranças  → dia 1 de cada mês às 06:00 UTC
--   2) Marcação automática de overdue → diário às 03:15 UTC
-- =========================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- =========================================================================
-- PRÉ-REQUISITO: cadastrar segredos no Vault
-- =========================================================================
-- Use Database → Vault no painel Supabase para guardar:
--    cron_secret   = (mesmo valor da env CRON_SECRET da Edge Function)
--    project_url   = https://<seu-projeto>.supabase.co
--
-- Equivalente via SQL (rodar UMA vez, com os valores reais):
--   select vault.create_secret('SEU_CRON_SECRET', 'cron_secret');
--   select vault.create_secret('https://SEU_PROJETO.supabase.co', 'project_url');
-- =========================================================================


-- =========================================================================
-- 1) Função utilitária — invoca a Edge Function via HTTP
-- =========================================================================
create or replace function _invoke_generate_monthly_payments() returns void
  language plpgsql security definer set search_path = public as $$
declare
  v_url    text;
  v_secret text;
begin
  select decrypted_secret into v_url
    from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into v_secret
    from vault.decrypted_secrets where name = 'cron_secret';

  if v_url is null or v_secret is null then
    raise warning 'Vault secrets project_url/cron_secret não configurados.';
    return;
  end if;

  perform net.http_post(
    url     := v_url || '/functions/v1/generate-monthly-payments',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'X-Cron-Secret', v_secret
    ),
    body    := '{}'::jsonb
  );
end $$;


-- =========================================================================
-- 2) Job: geração mensal — dia 1 às 06:00 UTC
-- =========================================================================
select cron.unschedule('generate-monthly-payments') where exists (
  select 1 from cron.job where jobname = 'generate-monthly-payments'
);

select cron.schedule(
  'generate-monthly-payments',
  '0 6 1 * *',
  $$ select _invoke_generate_monthly_payments(); $$
);


-- =========================================================================
-- 3) Job: marcar pagamentos vencidos — diário às 03:15 UTC
-- =========================================================================
select cron.unschedule('mark-overdue-payments') where exists (
  select 1 from cron.job where jobname = 'mark-overdue-payments'
);

select cron.schedule(
  'mark-overdue-payments',
  '15 3 * * *',
  $$ update payments set status = 'overdue'
       where status = 'pending'
         and due_date is not null
         and due_date < current_date; $$
);


-- =========================================================================
-- VERIFICAÇÃO
-- =========================================================================
-- select jobname, schedule, command from cron.job;
--   ↑ deve listar as duas tarefas acima
-- =========================================================================
