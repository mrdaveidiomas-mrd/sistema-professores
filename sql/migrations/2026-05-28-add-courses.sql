-- =========================================================================
-- MIGRATION: 2026-05-28-add-courses.sql
-- =========================================================================
-- Adiciona o conceito de CURSO (ex: "Inglês - Adulto Regular", "Espanhol -
-- Conversação"). Cada aluno pertence a um curso. Cada curso tem seus próprios
-- módulos e conteúdos de currículo.
--
-- ⚠️ APAGA dados existentes de progresso (módulos, conteúdos, registros).
--    Confirmado com o usuário antes de aplicar.
--
-- Idempotente após a primeira execução. Pode ser rodada novamente sem efeito.
-- =========================================================================


-- ----- 0) LIMPEZA: apaga conteúdo de progresso existente -----------------
-- (decisão do usuário: clean slate em vez de migrar pra curso "Legacy")
delete from student_progress;
delete from progress_contents;
delete from progress_categories;


-- ----- 1) Tabela courses --------------------------------------------------
create table if not exists courses (
  id          uuid        primary key default gen_random_uuid(),
  name        text        not null,                 -- ex: "Adulto Regular"
  language    text        not null,                 -- ex: "Inglês" (texto livre)
  description text,                                 -- opcional
  active      boolean     not null default true,
  created_at  timestamptz default now()
);

alter table courses enable row level security;

-- RLS: admin gerencia, professor lê (precisa pra ver alunos)
drop policy if exists "courses admin all"    on courses;
drop policy if exists "courses teacher read" on courses;

create policy "courses admin all"    on courses for all
  using (is_admin()) with check (is_admin());

create policy "courses teacher read" on courses for select
  using (auth.uid() is not null);


-- ----- 2) FK students.course_id ------------------------------------------
-- NULL permitido (aluno sem curso atribuído). UI obriga seleção na criação.
alter table students
  add column if not exists course_id uuid
  references courses(id) on delete set null;

create index if not exists idx_students_course_id on students(course_id);


-- ----- 3) FK progress_categories.course_id -------------------------------
-- Cada módulo (linha em progress_categories) pertence a um curso.
-- Nota: tabela mantém nome "progress_categories" por compatibilidade —
-- no domínio do app, o conceito é "Módulo".
alter table progress_categories
  add column if not exists course_id uuid
  references courses(id) on delete cascade;

create index if not exists idx_pc_course_id on progress_categories(course_id);


-- =========================================================================
-- VERIFICAÇÃO PÓS-MIGRATION (opcional)
-- =========================================================================
-- select count(*) as cursos from courses;
-- select id, name, language from courses;
-- =========================================================================
