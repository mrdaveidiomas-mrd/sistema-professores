-- =========================================================================
-- 2026-06-17 — Adiciona notas (grades) por aluno e por módulo
-- Motivação: professor/admin pode lançar notas avulsas (prova, participação,
-- projeto etc.) durante o curso. O tipo é texto livre (cada professor define).
-- Cada nota pertence a um módulo (progress_categories) — agrupa naturalmente
-- por módulo na UI do aluno e da página Progresso.
-- =========================================================================

create table if not exists student_grades (
  id          uuid        primary key default gen_random_uuid(),
  student_id  uuid        not null references students(id) on delete cascade,
  module_id   uuid        not null references progress_categories(id) on delete cascade,
  grade_type  text        not null,                         -- ex: "Prova", "Projeto"; texto livre
  value       numeric(4,2) not null check (value >= 0 and value <= 10),
  notes       text,
  recorded_by uuid        references profiles(id) on delete set null,
  recorded_at date        not null default current_date,
  created_at  timestamptz default now()
);

create index if not exists idx_grades_student_module
  on student_grades(student_id, module_id);
create index if not exists idx_grades_module
  on student_grades(module_id);

alter table student_grades enable row level security;

-- RLS — espelha student_progress: admin tudo; professor só os próprios alunos
drop policy if exists "sg admin all"        on student_grades;
drop policy if exists "sg teacher read"     on student_grades;
drop policy if exists "sg teacher insert"   on student_grades;
drop policy if exists "sg teacher update"   on student_grades;
drop policy if exists "sg teacher delete"   on student_grades;

create policy "sg admin all" on student_grades for all
  using (is_admin()) with check (is_admin());

create policy "sg teacher read"   on student_grades for select using (
  exists (select 1 from student_teachers st
          where st.student_id = student_grades.student_id and st.teacher_id = auth.uid())
);
create policy "sg teacher insert" on student_grades for insert with check (
  exists (select 1 from student_teachers st
          where st.student_id = student_grades.student_id and st.teacher_id = auth.uid())
);
create policy "sg teacher update" on student_grades for update using (
  exists (select 1 from student_teachers st
          where st.student_id = student_grades.student_id and st.teacher_id = auth.uid())
);
create policy "sg teacher delete" on student_grades for delete using (
  exists (select 1 from student_teachers st
          where st.student_id = student_grades.student_id and st.teacher_id = auth.uid())
);
