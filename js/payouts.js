/* ==========================================================================
   PAYOUTS.JS — Cálculo do que cada professor tem a receber
   Modelo de sessão coletiva:
   - Quando há class_id, uma sessão = (date, class_id) — uma aula, independente
     do número de alunos. O professor recebe UMA vez por sessão.
   - Quando não há class_id (aula individual), cada registro = uma cobrança.
   Fator de pagamento por sessão:
   - 0    se todos os alunos estão JUSTIFIED
   - 1.0  se há ao menos um PRESENT ou MAKEUP
   - 0.5  se só há ABSENT (e talvez JUSTIFIED), sem nenhum PRESENT/MAKEUP
          (falta não justificada paga metade ao professor)
   ========================================================================== */

window.HT = window.HT || {};

HT.payouts = (() => {

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
  /* Status representativo para exibição na tabela de aulas. */
  function _sessionStatusLabel(records) {
    if (records.every(r => r.status === 'justified')) return 'justified';
    if (records.some(r => r.status === 'present' || r.status === 'makeup')) return 'present';
    return 'absent';
  }

  /**
   * Calcula payout do professor logado para o período {from, to}.
   * Retorna {
   *   total, count, justifiedCount,
   *   items:   [{ date, classId, className, label, status, studentCount, rate, paid, isSession }],
   *   byClass: [{ classId, className, count, total, isIndividual?, studentName? }]
   * }
   */
  async function getMyPayout({ from, to } = {}) {
    const db = HT.supabase;
    const { data: { user } } = await db.auth.getUser();
    if (!user) return { total: 0, count: 0, justifiedCount: 0, items: [], byClass: [] };

    /* Valor padrão por sessão */
    const { data: prof } = await db.from('profiles')
      .select('default_lesson_rate').eq('id', user.id).single();
    const defaultRate = Number(prof?.default_lesson_rate || 0);

    /* Frequência no período — inclui class_id para agrupamento de sessões */
    let q = db.from('attendance')
      .select('id, student_id, class_id, date, status')
      .eq('teacher_id', user.id);
    if (from) q = q.gte('date', from);
    if (to)   q = q.lte('date', to);
    const { data: att, error } = await q.order('date', { ascending: false });
    if (error) throw error;

    /* Mapa de nomes de turmas */
    const classIds = [...new Set((att || []).filter(a => a.class_id).map(a => a.class_id))];
    let classMap = {};
    if (classIds.length) {
      const { data: classes } = await db.from('classes').select('id, name').in('id', classIds);
      (classes || []).forEach(c => { classMap[c.id] = c.name; });
    }

    /* Mapa de nomes de alunos (somente aulas individuais) */
    const indStudentIds = [...new Set((att || []).filter(a => !a.class_id).map(a => a.student_id))];
    let nameMap = {};
    if (indStudentIds.length) {
      const { data: studs } = await db.from('students').select('id, name').in('id', indStudentIds);
      (studs || []).forEach(s => { nameMap[s.id] = s.name; });
    }

    /* Agrupa por sessão: (date, class_id) */
    const sessionMap = new Map(); /* key: "date:class_id" */
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

    /* ---- Sessões coletivas de turma ---- */
    sessionMap.forEach(session => {
      const factor = _sessionFactor(session.records);
      const rate   = defaultRate * factor;
      const paid   = factor > 0;
      const status = _sessionStatusLabel(session.records);

      if (status === 'justified') justifiedCount += 1;
      if (paid) { total += rate; count += 1; }

      const className = classMap[session.classId] || '(turma)';
      items.push({
        date:         session.date,
        classId:      session.classId,
        className,
        label:        className,
        status,
        studentCount: session.records.length,
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

    /* ---- Aulas individuais (sem turma) ---- */
    individualAtt.forEach(a => {
      const factor = _individualFactor(a.status);
      const rate   = defaultRate * factor;
      const paid   = factor > 0;

      if (a.status === 'justified') justifiedCount += 1;
      if (paid) { total += rate; count += 1; }

      const studentName = nameMap[a.student_id] || '(aluno)';
      items.push({
        id:           a.id,
        date:         a.date,
        classId:      null,
        label:        studentName,
        studentName,
        status:       a.status,
        studentCount: 1,
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
   * Usa o mesmo modelo de sessão coletiva:
   *   - class_id presente → sessão = (date, class_id, teacher_id): paga 1×
   *   - class_id ausente  → aula individual: paga 1× por registro
   */
  async function getAllTeachersPayout({ from, to } = {}) {
    const db = HT.supabase;

    /* Professores cadastrados */
    const { data: teachers, error: tErr } = await db.from('profiles')
      .select('id, name, default_lesson_rate')
      .eq('role', 'teacher');
    if (tErr) throw tErr;

    /* Frequência no período */
    let q = db.from('attendance').select('id, student_id, teacher_id, class_id, date, status');
    if (from) q = q.gte('date', from);
    if (to)   q = q.lte('date', to);
    const { data: att, error: aErr } = await q;
    if (aErr) throw aErr;

    /* Buckets por professor */
    const byTeacher = {};
    (teachers || []).forEach(t => {
      byTeacher[t.id] = {
        teacherId:      t.id,
        teacherName:    t.name || '(sem nome)',
        defaultRate:    Number(t.default_lesson_rate || 0),
        total:          0,
        paidCount:      0,
        totalCount:     0,
        justifiedCount: 0,
        _sessions:      new Map(), /* temp: key "date:class_id" → records[] */
        _individual:    [],        /* temp: registros sem class_id */
      };
    });

    /* Agrupa */
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
      /* Sessões coletivas */
      t._sessions.forEach(records => {
        const factor = _sessionFactor(records);
        const rate   = t.defaultRate * factor;
        const allJustified = records.every(r => r.status === 'justified');
        t.totalCount += 1;
        totalLessons  += 1;
        if (allJustified) { t.justifiedCount += 1; justifiedLessons += 1; }
        if (factor > 0) {
          t.paidCount  += 1;
          t.total      += rate;
          paidLessons  += 1;
          grandTotal   += rate;
        }
      });

      /* Aulas individuais */
      t._individual.forEach(a => {
        const factor = _individualFactor(a.status);
        const rate   = t.defaultRate * factor;
        t.totalCount += 1;
        totalLessons  += 1;
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
