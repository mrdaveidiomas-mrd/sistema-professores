-- =========================================================================
-- 2026-08-11 — Duração da aula por registro de frequência
-- Motivação: valor pago ao professor passa a ser proporcional ao tempo
-- efetivamente ministrado. O professor informa a duração ao lançar cada
-- aula. Valor base do professor (default_lesson_rate) e override por aluno
-- (student_teachers.rate_override) passam a ser interpretados como R$/hora.
--
-- Registros antigos ficam com duration_minutes NULL — o cálculo em
-- payouts.js cai no schedule planejado do aluno/turma e, na ausência
-- deste, em 60 minutos.
-- =========================================================================

alter table attendance
  add column if not exists duration_minutes int
    check (duration_minutes is null or duration_minutes > 0);

comment on column attendance.duration_minutes is
  'Duração efetiva da aula em minutos, informada pelo professor. '
  'Pagamento = default_lesson_rate (R$/hora) × duration_minutes/60 × fator '
  '(1 = presente, 0.5 = falta, 0 = justificada não reposta).';
