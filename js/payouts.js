/* ==========================================================================
   PAYOUTS.JS — Cálculo do que cada professor tem a receber
   Modelo:
   - default_lesson_rate e student_teachers.rate_override representam R$/HORA.
   - Cada registro de attendance carrega duration_minutes (informado pelo
     professor ao lançar a frequência). Registros antigos com NULL caem no
     schedule planejado do aluno/turma, ou em 60 min.
   - Sessão coletiva: (date, class_id) → uma aula paga, independente do
     número de alunos. Duração da sessão = 1ª duração não-nula dos registros,
     ou schedule da turma, ou 60.
   - Sessão individual: 1 registro = 1 cobrança, com sua própria duração.
   Fator por sessão:
     0    → todos justified
     1.0  → ao menos um present/makeup
     0.5  → só absent (falta não justificada paga metade)
   Valor final = R$/hora × duration_minutes/60 × fator × (override ou default).
   ========================================================================== */

window.HT = window.HT || {};

HT.payouts = (() => {

  const DEFAULT_MINUTES = 60;

  /* Fator de pagamento de UMA sessão (coletiva ou individual). */
  function _sessionFactor(records) {
    if (!records.length) return 0;
    if (records.every(r => r.status === 'justified')) return 0;
    if (records.some(r => r.status === 'present' || r.status === 'makeup')) return 1;
    if (records.some(r => r.status === 'absent')) return 0.5;
    return 0;
  }
  function _individualFactor(status) {
    if (status === 'present' || status === 'makeup') return 1;
    if (status === 'absent') return 0.5;
    return 0;
  }
  function _sessionStatusLabel(records) {
    if (records.every(r => r.status === 'justified')) return 'justified';
    if (records.some(r => r.status === 'present' || r.status === 'makeup')) return 'present';
    return 'absent';
  }

  /* Duração efetiva da sessão coletiva. Prioridade:
     1. Qualquer registro com duration_minutes não-nulo (todos devem ter o mesmo,
        já que UI grava uma duração por sessão — mas usamos o primeiro válido);
     2. Schedule planejado da turma;
     3. DEFAULT_MINUTES. */
  function _sessionMinutes(records, classSchedules) {
    const fromRec = records.find(r => r.duration_minutes != null);
    if (fromRec) return Number(fromRec.duration_minutes);
    if (classSchedules && classSchedules[0]?.duration) return Number(classSchedules[0].duration);
    return DEFAULT_MINUTES;
  }

  /* Duração efetiva de aula individual. */
  function _individualMinutes(record, studentSchedules) {
    if (record.duration_minutes != null) return Number(record.duration_minutes);
    if (studentSchedules && studentSchedules[0]?.duration) return Number(studentSchedules[0].duration);
    return DEFAULT_MINUTES;
  }

  /**
   * Calcula payout do professor logado para o período {from, to}.
   */
  async function getMyPayout({ from, to } = {}) {
    const db = HT.supabase;
    const { data: { user } } = await db.auth.getUser();
    if (!user) return { total: 0, count: 0, justifiedCount: 0, items: [], byClass: [] };

    /* Valor por HORA base do professor */
    const { data: prof } = await db.from('profiles')
      .select('default_lesson_rate').eq('id', user.id).single();
    const defaultHourly = Number(prof?.default_lesson_rate || 0);

    /* Overrides por aluno em R$/hora */
    const { data: links } = await db.from('student_teachers')
      .select('student_id, rate_override').eq('teacher_id', user.id);
    const studentHourly = {};
    (links || []).forEach(l => {
      studentHourly[l.student_id] = l.rate_override != null
        ? Number(l.rate_override)
        : defaultHourly;
    });
    const _hourlyFor = sid => (studentHourly[sid] != null ? studentHourly[sid] : defaultHourly);

    /* Attendance no período */
    let q = db.from('attendance')
      .select('id, student_id, class_id, date, status, duration_minutes')
      .eq('teacher_id', user.id);
    if (from) q = q.gte('date', from);
    if (to)   q = q.lte('date', to);
    const { data: att, error } = await q.order('date', { ascending: false });
    if (error) throw error;

    /* Nomes de turma + schedules (p/ fallback de duração) */
    const classIds = [...new Set((att || []).filter(a => a.class_id).map(a => a.class_id))];
    let classMap = {};
    if (classIds.length) {
      const { data: classes } = await db.from('classes')
        .select('id, name, schedules').in('id', classIds);
      (classes || []).forEach(c => { classMap[c.id] = c; });
    }

    /* Alunos individuais — nome + schedules p/ fallback */
    const indStudentIds = [...new Set((att || []).filter(a => !a.class_id).map(a => a.student_id))];
    let studentMap = {};
    if (indStudentIds.length) {
      const { data: studs } = await db.from('students')
        .select('id, name, schedules').in('id', indStudentIds);
      (studs || []).forEach(s => { studentMap[s.id] = s; });
    }

    /* Agrupa por sessão */
    const sessionMap = new Map();
    const individualAtt = [];
    (att || []).forEach(a => {
      if (a.class_id) {
        const key = `${a.date}:${a.class_id}`;
        if (!sessionMap.has(key)) sessionMap.set(key, { date: a.date, classId: a.class_id, records: [] });
        sessionMap.get(key).records.push(a);
      } else {
        individualAtt.push(a);
      }
    });

    const items = [];
    const byClassMap = {};
    let total = 0, count = 0, justifiedCount = 0;

    /* Sessões coletivas */
    sessionMap.forEach(session => {
      const cls     = classMap[session.classId];
      const factor  = _sessionFactor(session.records);
      const minutes = _sessionMinutes(session.records, cls?.schedules);
      const rate    = defaultHourly * (minutes / 60) * factor;
      const paid    = factor > 0;
      const status  = _sessionStatusLabel(session.records);

      if (status === 'justified') justifiedCount += 1;
      if (paid) { total += rate; count += 1; }

      const className = cls?.name || '(turma)';
      items.push({
        date:         session.date,
        classId:      session.classId,
        className,
        label:        className,
        status,
        studentCount: session.records.length,
        minutes,
        rate, paid, factor,
        isSession:    true,
      });

      if (!byClassMap[session.classId]) {
        byClassMap[session.classId] = { classId: session.classId, className, count: 0, total: 0 };
      }
      if (paid) {
        byClassMap[session.classId].count += 1;
        byClassMap[session.classId].total += rate;
      }
    });

    /* Aulas individuais */
    individualAtt.forEach(a => {
      const stud    = studentMap[a.student_id];
      const factor  = _individualFactor(a.status);
      const hourly  = _hourlyFor(a.student_id);
      const minutes = _individualMinutes(a, stud?.schedules);
      const rate    = hourly * (minutes / 60) * factor;
      const paid    = factor > 0;

      if (a.status === 'justified') justifiedCount += 1;
      if (paid) { total += rate; count += 1; }

      const studentName = stud?.name || '(aluno)';
      items.push({
        id:           a.id,
        date:         a.date,
        classId:      null,
        label:        studentName,
        studentName,
        status:       a.status,
        studentCount: 1,
        minutes,
        rate, paid, factor,
        isSession:    false,
      });

      const indKey = `_ind_${a.student_id}`;
      if (!byClassMap[indKey]) {
        byClassMap[indKey] = {
          classId: null, className: null,
          studentName, count: 0, total: 0,
          isIndividual: true,
        };
      }
      if (paid) {
        byClassMap[indKey].count += 1;
        byClassMap[indKey].total += rate;
      }
    });

    items.sort((a, b) => b.date.localeCompare(a.date));

    return { total, count, justifiedCount, items, byClass: Object.values(byClassMap) };
  }

  /**
   * (Admin) Agrega o payout de TODOS os professores no período {from, to}.
   */
  async function getAllTeachersPayout({ from, to } = {}) {
    const db = HT.supabase;

    const { data: teachers, error: tErr } = await db.from('profiles')
      .select('id, name, default_lesson_rate')
      .eq('role', 'teacher');
    if (tErr) throw tErr;

    let q = db.from('attendance')
      .select('id, student_id, teacher_id, class_id, date, status, duration_minutes');
    if (from) q = q.gte('date', from);
    if (to)   q = q.lte('date', to);
    const { data: att, error: aErr } = await q;
    if (aErr) throw aErr;

    /* Overrides */
    const { data: links } = await db.from('student_teachers')
      .select('teacher_id, student_id, rate_override');
    const overrideMap = {};
    (links || []).forEach(l => {
      if (l.rate_override != null) {
        overrideMap[`${l.teacher_id}:${l.student_id}`] = Number(l.rate_override);
      }
    });

    /* Schedules (turma + aluno) para fallback de duração */
    const classIds = [...new Set((att || []).filter(a => a.class_id).map(a => a.class_id))];
    let classMap = {};
    if (classIds.length) {
      const { data: classes } = await db.from('classes')
        .select('id, schedules').in('id', classIds);
      (classes || []).forEach(c => { classMap[c.id] = c; });
    }
    const indStudentIds = [...new Set((att || []).filter(a => !a.class_id).map(a => a.student_id))];
    let studentMap = {};
    if (indStudentIds.length) {
      const { data: studs } = await db.from('students')
        .select('id, schedules').in('id', indStudentIds);
      (studs || []).forEach(s => { studentMap[s.id] = s; });
    }

    const byTeacher = {};
    (teachers || []).forEach(t => {
      byTeacher[t.id] = {
        teacherId:      t.id,
        teacherName:    t.name || '(sem nome)',
        defaultHourly:  Number(t.default_lesson_rate || 0),
        total:          0,
        paidCount:      0,
        totalCount:     0,
        justifiedCount: 0,
        _sessions:      new Map(),
        _individual:    [],
      };
    });

    (att || []).forEach(a => {
      const t = byTeacher[a.teacher_id];
      if (!t) return;
      if (a.class_id) {
        const key = `${a.date}:${a.class_id}`;
        if (!t._sessions.has(key)) t._sessions.set(key, []);
        t._sessions.get(key).push(a);
      } else {
        t._individual.push(a);
      }
    });

    let grandTotal = 0, paidLessons = 0, totalLessons = 0, justifiedLessons = 0;

    Object.values(byTeacher).forEach(t => {
      t._sessions.forEach((records, key) => {
        const classId = records[0]?.class_id;
        const cls     = classMap[classId];
        const factor  = _sessionFactor(records);
        const minutes = _sessionMinutes(records, cls?.schedules);
        const rate    = t.defaultHourly * (minutes / 60) * factor;
        const allJustified = records.every(r => r.status === 'justified');
        t.totalCount += 1;
        totalLessons += 1;
        if (allJustified) { t.justifiedCount += 1; justifiedLessons += 1; }
        if (factor > 0) {
          t.paidCount  += 1;
          t.total      += rate;
          paidLessons  += 1;
          grandTotal   += rate;
        }
      });

      t._individual.forEach(a => {
        const stud    = studentMap[a.student_id];
        const factor  = _individualFactor(a.status);
        const hourly  = overrideMap[`${t.teacherId}:${a.student_id}`] ?? t.defaultHourly;
        const minutes = _individualMinutes(a, stud?.schedules);
        const rate    = hourly * (minutes / 60) * factor;
        t.totalCount += 1;
        totalLessons += 1;
        if (a.status === 'justified') { t.justifiedCount += 1; justifiedLessons += 1; }
        if (factor > 0) {
          t.paidCount  += 1;
          t.total      += rate;
          paidLessons  += 1;
          grandTotal   += rate;
        }
      });

      delete t._sessions;
      delete t._individual;
    });

    return {
      grandTotal, paidLessons, totalLessons, justifiedLessons,
      teacherCount: (teachers || []).length,
      byTeacher: Object.values(byTeacher),
    };
  }

  return {
    getMyPayout,
    getAllTeachersPayout,
    sessionFactor:    _sessionFactor,
    individualFactor: _individualFactor,
  };
})();
