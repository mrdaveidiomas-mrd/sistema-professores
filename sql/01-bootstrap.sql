-- =========================================================================
-- MR. DAVE IDIOMAS — BOOTSTRAP completo do banco
-- =========================================================================
-- ⚠️  ATENÇÃO: ESTE SCRIPT É DESTRUTIVO. Faz `drop cascade` em todas as
--    tabelas do esquema `public` (na seção 0) e recria do zero.
--
-- USAR APENAS:
--   • No deploy inicial (banco vazio)
--   • Para resetar ambiente de desenvolvimento
--
-- NÃO RODAR EM PRODUÇÃO depois do app já estar com dados.
-- Para mudanças incrementais pós-bootstrap, criar arquivos em
--   sql/migrations/YYYY-MM-DD-<descricao>.sql
--
-- Modelo: ÚNICA escola, com 1+ admins e N professores (RBAC).
--
-- CONTEÚDO:
--   Seção 0 — Reset (drop cascade)
--   Seção 1 — Tabela profiles + funções is_admin/current_role_name
--   Seção 2 — Trigger handle_new_user (auto-cria profile no signup)
--   Seção 3 — Tabelas core: classes, students, student_teachers
--   Seção 4 — Attendance (frequência)
--   Seção 5 — Payments (mensalidades)
--   Seção 6 — Progress (módulos, conteúdos, registros)
--   Seção 7 — Teacher availability (disponibilidade)
--   Seção 8 — Error logs (centralização de erros front-end)
--   Seção 9 — Materials (folders + materials + storage policies)
--   Seção 10 — Indexes (performance de RLS e queries quentes)
--
-- PÓS-DEPLOY (instruções no final).
-- =========================================================================


-- =========================================================================
-- SEÇÃO 0 — RESET (CUIDADO: apaga dados!)
-- =========================================================================
drop table if exists student_progress      cascade;
drop table if exists progress_contents     cascade;
drop table if exists progress_categories   cascade;
drop table if exists payments              cascade;
drop table if exists attendance            cascade;
drop table if exists student_teachers      cascade;
drop table if exists students              cascade;
drop table if exists classes               cascade;
drop table if exists courses               cascade;
drop table if exists teacher_availability  cascade;
drop table if exists error_logs            cascade;
drop table if exists materials             cascade;
drop table if exists material_folders      cascade;
drop table if exists profiles              cascade;

drop function if exists is_admin()          cascade;
drop function if exists current_role_name() cascade;
drop function if exists handle_new_user()   cascade;


-- =========================================================================
-- SEÇÃO 1 — PROFILES + funções auxiliares de papel
-- =========================================================================
create table profiles (
  id                  uuid primary key references auth.users(id) on delete cascade,
  role                text not null default 'teacher' check (role in ('admin','teacher')),
  name                text,
  email               text,
  phone               text,
  subject             text,
  bio                 text,
  photo               text,
  default_lesson_rate numeric(10,2),
  active              boolean not null default true,
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);

-- Funções auxiliares (plpgsql evita validação antecipada)
create or replace function current_role_name() returns text
  language plpgsql stable security definer set search_path = public as $$
begin
  return (select role from profiles where id = auth.uid());
end $$;

create or replace function is_admin() returns boolean
  language plpgsql stable security definer set search_path = public as $$
begin
  return coalesce((select role = 'admin' from profiles where id = auth.uid()), false);
end $$;

alter table profiles enable row level security;
create policy "profile self read"   on profiles for select using (id = auth.uid() or is_admin());
create policy "profile self update" on profiles for update using (id = auth.uid() or is_admin());
create policy "profile insert"      on profiles for insert with check (id = auth.uid() or is_admin());
create policy "profile admin del"   on profiles for delete using (is_admin());


-- =========================================================================
-- SEÇÃO 2 — Trigger handle_new_user (auto-cria profile no signup)
-- =========================================================================
-- IMPORTANTE: role é fixado em 'teacher' (segurança: impede auto-promoção
-- via OTP/magic-link). Admin é promovido manualmente via SQL (pós-deploy).
create or replace function handle_new_user() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, email, name, role, default_lesson_rate)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    'teacher',
    case
      when (new.raw_user_meta_data->>'default_lesson_rate') is not null
        then (new.raw_user_meta_data->>'default_lesson_rate')::numeric
      else null
    end
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();


-- =========================================================================
-- SEÇÃO 3 — Tabelas core: courses, classes, students, student_teachers
-- =========================================================================

-- ----- COURSES (trilhas educacionais — ex: "Inglês — Adulto Regular") ----
create table courses (
  id          uuid        primary key default gen_random_uuid(),
  name        text        not null,                 -- ex: "Adulto Regular"
  language    text        not null,                 -- ex: "Inglês" (texto livre)
  description text,
  active      boolean     not null default true,
  created_at  timestamptz default now()
);
alter table courses enable row level security;
create policy "courses admin all"    on courses for all
  using (is_admin()) with check (is_admin());
create policy "courses teacher read" on courses for select
  using (auth.uid() is not null);

-- ----- CLASSES -----------------------------------------------------------
create table classes (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  level      text,
  schedules  jsonb default '[]'::jsonb,
  notes      text,
  teacher_id uuid references profiles(id) on delete set null,
  created_at timestamptz default now()
);
alter table classes enable row level security;
create policy "classes admin all"    on classes for all
  using (is_admin()) with check (is_admin());
create policy "classes teacher read" on classes for select
  using (teacher_id = auth.uid());

-- ----- STUDENTS ----------------------------------------------------------
create table students (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  age            int,
  email          text,
  phone          text,
  course_id      uuid references courses(id) on delete set null,
  class_id       uuid references classes(id) on delete set null,
  level          text,
  schedules      jsonb default '[]'::jsonb,
  monthly_fee    numeric(10,2),
  pay_day        int,
  contract_start date,
  contract_end   date,
  notes          text,
  created_at     timestamptz default now()
);
alter table students enable row level security;
create policy "students admin all" on students for all
  using (is_admin()) with check (is_admin());
-- "students teacher read" criada após student_teachers existir (abaixo)

-- ----- STUDENT_TEACHERS (M:N) -------------------------------------------
create table student_teachers (
  student_id    uuid references students(id) on delete cascade,
  teacher_id    uuid references profiles(id) on delete cascade,
  rate_override numeric(10,2),
  created_at    timestamptz default now(),
  primary key (student_id, teacher_id)
);
alter table student_teachers enable row level security;
create policy "st admin all"    on student_teachers for all
  using (is_admin()) with check (is_admin());
create policy "st teacher read" on student_teachers for select
  using (teacher_id = auth.uid());

-- Agora student_teachers existe, criamos a policy de students que depende dela
create policy "students teacher read" on students for select
  using (exists (
    select 1 from student_teachers st
    where st.student_id = students.id and st.teacher_id = auth.uid()
  ));


-- =========================================================================
-- SEÇÃO 4 — Attendance (frequência)
-- =========================================================================
create table attendance (
  id             uuid primary key default gen_random_uuid(),
  student_id     uuid references students(id) on delete cascade,
  class_id       uuid references classes(id) on delete set null,
  teacher_id     uuid references profiles(id) on delete set null,
  date           date not null,
  status         text not null check (status in ('present','absent','justified','makeup')),
  lesson_content text,
  notes          text,
  created_at     timestamptz default now()
);
alter table attendance enable row level security;

create policy "att admin all"      on attendance for all
  using (is_admin()) with check (is_admin());
create policy "att teacher read"   on attendance for select
  using (teacher_id = auth.uid());
create policy "att teacher insert" on attendance for insert with check (
  teacher_id = auth.uid()
  and exists (
    select 1 from student_teachers st
    where st.student_id = attendance.student_id and st.teacher_id = auth.uid()
  )
);
create policy "att teacher update" on attendance for update using (teacher_id = auth.uid());
create policy "att teacher delete" on attendance for delete using (teacher_id = auth.uid());


-- =========================================================================
-- SEÇÃO 5 — Payments (mensalidades — só admin)
-- =========================================================================
create table payments (
  id         uuid primary key default gen_random_uuid(),
  student_id uuid references students(id) on delete cascade,
  reference  text not null,
  amount     numeric(10,2) not null,
  due_date   date,
  status     text not null check (status in ('paid','pending','overdue','cancelled')),
  paid_date  date,
  method     text,
  notes      text,
  created_at timestamptz default now()
);
alter table payments enable row level security;
create policy "pay admin only" on payments for all
  using (is_admin()) with check (is_admin());


-- =========================================================================
-- SEÇÃO 6 — Progress (currículo + registros por aluno)
-- =========================================================================
create table progress_categories (
  id         uuid primary key default gen_random_uuid(),
  course_id  uuid references courses(id) on delete cascade,
  name       text not null,
  position   int default 0,
  created_at timestamptz default now()
);
alter table progress_categories enable row level security;
create policy "pc admin all"    on progress_categories for all
  using (is_admin()) with check (is_admin());
create policy "pc teacher read" on progress_categories for select
  using (auth.uid() is not null);

create table progress_contents (
  id          uuid primary key default gen_random_uuid(),
  category_id uuid references progress_categories(id) on delete cascade,
  title       text not null,
  description text,
  position    int default 0,
  created_at  timestamptz default now()
);
alter table progress_contents enable row level security;
create policy "pcontent admin all"    on progress_contents for all
  using (is_admin()) with check (is_admin());
create policy "pcontent teacher read" on progress_contents for select
  using (auth.uid() is not null);

create table student_progress (
  id         uuid primary key default gen_random_uuid(),
  student_id uuid references students(id) on delete cascade,
  content_id uuid references progress_contents(id) on delete cascade,
  status     text not null,
  date       date not null,
  notes      text,
  created_at timestamptz default now()
);
alter table student_progress enable row level security;
create policy "sp admin all" on student_progress for all
  using (is_admin()) with check (is_admin());
create policy "sp teacher read"   on student_progress for select using (
  exists (select 1 from student_teachers st
          where st.student_id = student_progress.student_id and st.teacher_id = auth.uid())
);
create policy "sp teacher insert" on student_progress for insert with check (
  exists (select 1 from student_teachers st
          where st.student_id = student_progress.student_id and st.teacher_id = auth.uid())
);
create policy "sp teacher update" on student_progress for update using (
  exists (select 1 from student_teachers st
          where st.student_id = student_progress.student_id and st.teacher_id = auth.uid())
);
create policy "sp teacher delete" on student_progress for delete using (
  exists (select 1 from student_teachers st
          where st.student_id = student_progress.student_id and st.teacher_id = auth.uid())
);


-- =========================================================================
-- SEÇÃO 7 — Teacher availability (disponibilidade)
-- =========================================================================
create table teacher_availability (
  id            uuid primary key default gen_random_uuid(),
  teacher_id    uuid not null references profiles(id) on delete cascade,
  title         text,
  type          text not null default 'available' check (type in ('available','blocked')),
  is_recurring  boolean not null default true,
  day_of_week   int check (day_of_week between 0 and 6), -- 0=Dom … 6=Sáb (recorrente)
  specific_date date,                                    -- evento único
  start_time    time not null,
  end_time      time not null,
  notes         text,
  created_at    timestamptz default now()
);
alter table teacher_availability enable row level security;

create policy "avail admin all" on teacher_availability for all
  using (is_admin()) with check (is_admin());
create policy "avail teacher read" on teacher_availability for select
  using (teacher_id = auth.uid());
create policy "avail teacher insert" on teacher_availability for insert
  with check (teacher_id = auth.uid());
create policy "avail teacher update" on teacher_availability for update
  using (teacher_id = auth.uid());
create policy "avail teacher delete" on teacher_availability for delete
  using (teacher_id = auth.uid());


-- =========================================================================
-- SEÇÃO 8 — Error logs (centralização de erros front-end)
-- =========================================================================
create table error_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete set null,
  message     text not null,
  stack       text,
  context     jsonb default '{}'::jsonb,
  resolved    boolean not null default false,
  created_at  timestamptz default now()
);
alter table error_logs enable row level security;

-- Qualquer usuário autenticado pode INSERIR seus próprios erros
create policy "errlog self insert" on error_logs for insert
  with check (auth.uid() is not null and (user_id is null or user_id = auth.uid()));

-- Apenas admin pode LER ou ATUALIZAR
create policy "errlog admin read"   on error_logs for select using (is_admin());
create policy "errlog admin update" on error_logs for update using (is_admin());
create policy "errlog admin delete" on error_logs for delete using (is_admin());

-- Opcional: purga automática diária de logs > 90 dias
--   select cron.schedule('purge-old-error-logs', '0 3 * * *',
--     $$ delete from error_logs where created_at < now() - interval '90 days'; $$);


-- =========================================================================
-- SEÇÃO 9 — Materials (folders + materials + storage policies)
-- =========================================================================
-- ⚠️ PRÉ-REQUISITO: criar o bucket "materials" no Storage como PÚBLICO
--    (Painel Supabase → Storage → New bucket → marcar "Public bucket")
--    Necessário para pré-visualização via Microsoft Office Online Viewer.
-- =========================================================================

-- ----- Pastas (material_folders) -----------------------------------------
create table material_folders (
  id          uuid        primary key default gen_random_uuid(),
  name        text        not null,
  color       text        not null default '#032d6f',
  position    int         not null default 0,
  created_by  uuid        references profiles(id) on delete set null,
  created_at  timestamptz default now()
);
alter table material_folders enable row level security;

create policy "folders read" on material_folders for select
  to authenticated using (true);
create policy "folders admin write" on material_folders for all
  using (is_admin()) with check (is_admin());

-- ----- Arquivos (materials) ----------------------------------------------
create table materials (
  id          uuid        primary key default gen_random_uuid(),
  name        text        not null,
  description text,
  file_path   text        not null,   -- caminho no bucket
  file_name   text,                   -- nome original
  file_size   bigint,                 -- bytes
  mime_type   text,
  category    text,
  uploaded_by uuid        references profiles(id) on delete set null,
  folder_id   uuid        references material_folders(id) on delete set null,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);
alter table materials enable row level security;

create policy "materials read" on materials for select
  to authenticated using (true);
create policy "materials admin insert" on materials for insert
  with check (is_admin());
create policy "materials admin update" on materials for update
  using (is_admin());
create policy "materials admin delete" on materials for delete
  using (is_admin());

-- ----- Storage policies (bucket "materials") -----------------------------
-- O Supabase Storage usa RLS em storage.objects separadamente das tabelas.
drop policy if exists "materials storage upload" on storage.objects;
drop policy if exists "materials storage read"   on storage.objects;
drop policy if exists "materials storage update" on storage.objects;
drop policy if exists "materials storage delete" on storage.objects;

create policy "materials storage upload" on storage.objects for insert
  to authenticated with check (
    bucket_id = 'materials' and public.is_admin()
  );

create policy "materials storage read" on storage.objects for select
  to authenticated using (bucket_id = 'materials');

create policy "materials storage update" on storage.objects for update
  to authenticated using (
    bucket_id = 'materials' and public.is_admin()
  );

create policy "materials storage delete" on storage.objects for delete
  to authenticated using (
    bucket_id = 'materials' and public.is_admin()
  );


-- =========================================================================
-- SEÇÃO 10 — INDEXES (performance de RLS e queries quentes)
-- =========================================================================
-- Motivação: policies RLS fazem subqueries do tipo
--   exists (select 1 from student_teachers where teacher_id = auth.uid() ...)
-- Sem índices nas FKs, isso vira seq scan a cada linha lida.

-- ATTENDANCE (tabela mais quente)
create index idx_attendance_teacher_id   on attendance(teacher_id);
create index idx_attendance_student_id   on attendance(student_id);
create index idx_attendance_class_id     on attendance(class_id);
create index idx_attendance_date         on attendance(date);
create index idx_attendance_teacher_date on attendance(teacher_id, date);

-- STUDENT_TEACHERS (consultada por TODAS as policies de teacher)
create index idx_st_teacher_id on student_teachers(teacher_id);
create index idx_st_student_id on student_teachers(student_id);

-- STUDENTS / CLASSES / COURSES
create index idx_students_class_id  on students(class_id);
create index idx_students_course_id on students(course_id);
create index idx_classes_teacher_id on classes(teacher_id);
create index idx_pc_course_id       on progress_categories(course_id);

-- PAYMENTS
create index idx_payments_student_id on payments(student_id);
create index idx_payments_reference  on payments(reference);
create index idx_payments_status_due on payments(status, due_date)
  where status = 'pending';

-- STUDENT_PROGRESS
create index idx_sp_student_id on student_progress(student_id);
create index idx_sp_content_id on student_progress(content_id);

-- TEACHER_AVAILABILITY
create index idx_avail_teacher_day on teacher_availability(teacher_id, day_of_week);

-- MATERIALS
create index idx_materials_folder_id on materials(folder_id);

-- ERROR_LOGS
create index idx_error_logs_user_id    on error_logs(user_id);
create index idx_error_logs_created_at on error_logs(created_at desc);
create index idx_error_logs_unresolved on error_logs(resolved) where resolved = false;


-- =========================================================================
-- ✅ PRONTO! Próximos passos (PÓS-DEPLOY):
--
-- 1) Crie o primeiro usuário pelo painel Supabase:
--      Authentication → Users → Add user → mrdaveidiomas@gmail.com (etc.)
--
-- 2) Promova-o a admin no SQL Editor:
--      update profiles set role = 'admin'
--        where email = 'mrdaveidiomas@gmail.com';
--
-- 3) Faça login no sistema — esse usuário será o administrador.
--
-- 4) Crie o bucket "materials" no Storage (público) se ainda não criou.
--
-- 5) Para ativar geração mensal automática de cobranças, rode também:
--      sql/02-cron-jobs.sql
--    (requer Edge Function `generate-monthly-payments` deployada antes)
-- =========================================================================
