-- =========================================================================
-- AUDITORIA DE RLS — Verifica que as políticas atuais protegem corretamente
-- os dados de cada papel (admin / teacher).
-- =========================================================================
-- Como usar:
--   1. Rode os blocos SELECT abaixo no SQL Editor para inspecionar as policies
--   2. Faça login como TEACHER no app e verifique que as queries retornam
--      apenas os dados esperados.
-- =========================================================================

-- ----- INVENTÁRIO DE POLICIES ATUAIS -------------------------------------
select
  schemaname, tablename, policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
order by tablename, cmd, policyname;

-- ----- TABELAS COM RLS DESABILITADA (red flag) ---------------------------
select c.relname as table_name, c.relrowsecurity, c.relforcerowsecurity
from   pg_class c
join   pg_namespace n on n.oid = c.relnamespace
where  n.nspname = 'public'
  and  c.relkind = 'r'
  and  c.relrowsecurity = false
order by c.relname;

-- ----- TABELAS SEM NENHUMA POLICY (acesso bloqueado por default — OK,
--       mas indica que a tabela pode estar inacessível) ------------------
select t.tablename
from   pg_tables t
left   join pg_policies p
       on p.schemaname = t.schemaname and p.tablename = t.tablename
where  t.schemaname = 'public' and p.policyname is null;

-- =========================================================================
-- TESTES FUNCIONAIS DE RLS — execute como TEACHER (não como service_role!)
-- =========================================================================
-- 1. set role authenticated;  set request.jwt.claims = '{"sub":"<TEACHER-UUID>"}';
-- 2. Confirme que cada query retorna APENAS o que o teacher deveria ver:

-- Espera: somente alunos vinculados em student_teachers ao UID corrente
-- select id, name from students;

-- Espera: somente turmas onde teacher_id = UID corrente
-- select id, name from classes;

-- Espera: somente registros de attendance onde teacher_id = UID corrente
-- select id, student_id, date from attendance;

-- Espera: ZERO linhas (teachers não devem ler payments)
-- select count(*) from payments;

-- Espera: ZERO linhas de outros teachers (apenas o próprio profile)
-- select id, role from profiles;

-- Espera: somente progresso de alunos vinculados ao UID
-- select id from student_progress;

-- =========================================================================
-- POLICIES DEFENSIVAS RECOMENDADAS (rodar se ainda não existirem)
-- =========================================================================

-- Garante que `profiles` não vaza outros usuários para teachers
do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'profiles' and policyname = 'profile self read'
  ) then
    create policy "profile self read" on profiles for select
      using (id = auth.uid() or is_admin());
  end if;
end $$;

-- Garante que payments é apenas admin
do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'payments' and policyname = 'pay admin only'
  ) then
    create policy "pay admin only" on payments for all
      using (is_admin()) with check (is_admin());
  end if;
end $$;

-- Bloqueia leitura de error_logs por não-admin (caso a migração não tenha rodado)
do $$
begin
  if exists (select 1 from pg_tables where tablename = 'error_logs') then
    if not exists (
      select 1 from pg_policies
      where tablename = 'error_logs' and policyname = 'errlog admin read'
    ) then
      create policy "errlog admin read" on error_logs for select using (is_admin());
    end if;
  end if;
end $$;

-- =========================================================================
-- CHECKLIST FINAL — verificar manualmente:
--  [ ] Teachers não veem payments (RLS payments admin only ✓)
--  [ ] Teachers só veem students vinculados em student_teachers ✓
--  [ ] Teachers só veem classes onde são teacher_id ✓
--  [ ] Teachers só veem attendance onde teacher_id = UID ✓
--  [ ] Teachers só veem student_progress dos próprios alunos ✓
--  [ ] error_logs: insert por qualquer um auth, leitura/admin ✓
-- =========================================================================
