/* ==========================================================================
   STORAGE.JS — Camada de dados (Supabase) com papéis admin/professor
   - RLS no banco já restringe o que cada papel enxerga.
   - Aqui apenas definimos as queries; o filtro acontece via policies.
   ========================================================================== */

window.HT = window.HT || {};

HT.storage = (() => {

  const db = HT.supabase;

  async function _uid() {
    const { data: { user } } = await db.auth.getUser();
    if (!user) throw new Error('Usuário não autenticado.');
    return user.id;
  }

  /* ====================================================================
     MAPPERS
     ==================================================================== */

  function _toStudent(r) {
    return {
      id:            r.id,
      name:          r.name,
      age:           r.age,
      email:         r.email       || '',
      phone:         r.phone       || '',
      classId:       r.class_id    || null,
      level:         r.level       || '',
      schedules:     r.schedules   || [],
      monthlyFee:    r.monthly_fee,
      payDay:        r.pay_day,
      contractStart: r.contract_start || null,
      contractEnd:   r.contract_end   || null,
      notes:         r.notes          || '',
      teacherIds:    (r.student_teachers || []).map(st => st.teacher_id),
      createdAt:     r.created_at,
    };
  }
  function _fromStudent(d) {
    return {
      name:           d.name,
      age:            d.age           || null,
      email:          d.email         || null,
      phone:          d.phone         || null,
      class_id:       d.classId       || null,
      level:          d.level         || null,
      schedules:      d.schedules     || [],
      monthly_fee:    d.monthlyFee    ? +d.monthlyFee : null,
      pay_day:        d.payDay        ? +d.payDay      : null,
      contract_start: d.contractStart || null,
      contract_end:   d.contractEnd   || null,
      notes:          d.notes         || '',
    };
  }

  function _toClass(r) {
    return {
      id:         r.id,
      name:       r.name,
      level:      r.level     || '',
      schedules:  r.schedules || [],
      studentIds: (r.students || []).map(s => s.id),
      teacherId:  r.teacher_id || null,
      notes:      r.notes     || '',
      createdAt:  r.created_at,
    };
  }
  function _fromClass(d) {
    return {
      name:       d.name,
      level:      d.level     || null,
      schedules:  d.schedules || [],
      teacher_id: d.teacherId || null,
      notes:      d.notes     || '',
    };
  }

  function _toAttendance(r) {
    return {
      id:            r.id,
      studentId:     r.student_id,
      classId:       r.class_id     || null,
      teacherId:     r.teacher_id   || null,
      date:          r.date,
      status:        r.status,
      lessonContent: r.lesson_content || '',
      notes:         r.notes          || '',
      createdAt:     r.created_at,
    };
  }
  async function _fromAttendance(d, isInsert = false) {
    const base = {
      student_id:     d.studentId,
      class_id:       d.classId       || null,
      date:           d.date,
      status:         d.status,
      lesson_content: d.lessonContent || '',
      notes:          d.notes         || '',
    };

    if (isInsert) {
      /* teacher_id: usa o valor explícito quando disponível.
         Caso contrário, professor usa o próprio UID (exigido pela RLS);
         admin usa null (os próprios registros ficam sem vínculo de professor
         — correto quando não há professor derivável do contexto). */
      if (d.teacherId !== undefined && d.teacherId !== null) {
        base.teacher_id = d.teacherId;
      } else {
        const role = await HT.auth.getRole();
        base.teacher_id = role === 'teacher' ? await _uid() : null;
      }
    }
    /* No UPDATE, teacher_id não é incluído: preserva o valor original no banco. */

    return base;
  }

  function _toPayment(r) {
    return {
      id:        r.id,
      studentId: r.student_id,
      reference: r.reference,
      amount:    r.amount,
      dueDate:   r.due_date  || null,
      status:    r.status,
      paidDate:  r.paid_date || null,
      method:    r.method    || null,
      notes:     r.notes     || '',
      createdAt: r.created_at,
    };
  }
  function _fromPayment(d) {
    return {
      student_id: d.studentId,
      reference:  d.reference,
      amount:     +d.amount,
      due_date:   d.dueDate   || null,
      status:     d.status,
      paid_date:  d.paidDate  || null,
      method:     d.method    || null,
      notes:      d.notes     || '',
    };
  }

  /* ====================================================================
     ALUNOS  (RLS: admin tudo, prof apenas alunos vinculados)
     ==================================================================== */

  async function getStudents() {
    const { data, error } = await db.from('students')
      .select('*, student_teachers(teacher_id)')
      .order('name');
    if (error) throw error;
    return data.map(_toStudent);
  }

  /**
   * Paginated alternative for large datasets.
   * @param {object} opts - { page, pageSize, search, level, classId }
   * @returns {Promise<{ items, total, page, pageSize }>}
   */
  async function getStudentsPage({ page = 1, pageSize = 50, search = '', level = '', classId = '' } = {}) {
    let q = db.from('students')
      .select('*, student_teachers(teacher_id)', { count: 'exact' })
      .order('name');

    if (search)  q = q.ilike('name', `%${search}%`);
    if (level)   q = q.eq('level', level);
    if (classId) q = q.eq('class_id', classId);

    const from = (page - 1) * pageSize;
    const to   = from + pageSize - 1;
    const { data, error, count } = await q.range(from, to);
    if (error) throw error;
    return {
      items: (data || []).map(_toStudent),
      total: count ?? 0,
      page, pageSize,
    };
  }

  async function getStudent(id) {
    const { data, error } = await db.from('students')
      .select('*, student_teachers(teacher_id, rate_override)')
      .eq('id', id).single();
    if (error) return null;
    return _toStudent(data);
  }

  async function saveStudent(data) {
    const row = _fromStudent(data);
    let saved;
    if (data.id) {
      const { data: u, error } = await db.from('students')
        .update(row).eq('id', data.id).select().single();
      if (error) throw error;
      saved = u;
    } else {
      const { data: ins, error } = await db.from('students')
        .insert(row).select().single();
      if (error) throw error;
      saved = ins;
    }
    /* sincronizar professores vinculados (admin only — RLS bloqueia prof) */
    if (Array.isArray(data.teacherIds)) {
      await setStudentTeachers(saved.id, data.teacherIds);
    }
    return getStudent(saved.id);
  }

  async function deleteStudent(id) {
    const { error } = await db.from('students').delete().eq('id', id);
    if (error) throw error;
  }

  /* ====================================================================
     STUDENT_TEACHERS (vínculo aluno↔professor + sobrescrita)
     ==================================================================== */

  async function setStudentTeachers(studentId, teacherIds) {
    /* remove vínculos que não estão na nova lista */
    const { data: current } = await db.from('student_teachers')
      .select('teacher_id').eq('student_id', studentId);
    const currentIds = (current || []).map(r => r.teacher_id);

    const toRemove = currentIds.filter(t => !teacherIds.includes(t));
    const toAdd    = teacherIds.filter(t => !currentIds.includes(t));

    if (toRemove.length) {
      await db.from('student_teachers').delete()
        .eq('student_id', studentId).in('teacher_id', toRemove);
    }
    if (toAdd.length) {
      await db.from('student_teachers').insert(
        toAdd.map(teacher_id => ({ student_id: studentId, teacher_id }))
      );
    }
  }

  /* Lado do professor: lista alunos vinculados (com rate_override) */
  async function getTeacherStudents(teacherId) {
    const { data, error } = await db.from('student_teachers')
      .select('student_id, rate_override, students(name)')
      .eq('teacher_id', teacherId);
    if (error) throw error;
    return (data || []).map(r => ({
      studentId:    r.student_id,
      studentName:  r.students?.name || '',
      rateOverride: r.rate_override,
    }));
  }

  /* Substitui o conjunto de alunos vinculados a um professor (com overrides) */
  async function setTeacherStudents(teacherId, items /* [{studentId, rateOverride}] */) {
    const { data: current } = await db.from('student_teachers')
      .select('student_id').eq('teacher_id', teacherId);
    const currentIds = (current || []).map(r => r.student_id);
    const newIds     = items.map(i => i.studentId);

    const toRemove = currentIds.filter(id => !newIds.includes(id));
    if (toRemove.length) {
      await db.from('student_teachers').delete()
        .eq('teacher_id', teacherId).in('student_id', toRemove);
    }
    /* upsert para inserir novos e atualizar overrides */
    if (items.length) {
      const rows = items.map(i => ({
        student_id:    i.studentId,
        teacher_id:    teacherId,
        rate_override: i.rateOverride ?? null,
      }));
      const { error } = await db.from('student_teachers').upsert(rows);
      if (error) throw error;
    }
  }

  /* Atribui turmas a um professor (define classes.teacher_id) */
  async function setTeacherClasses(teacherId, classIds) {
    /* Remove vínculo das que não estão mais na lista */
    const { data: current } = await db.from('classes')
      .select('id').eq('teacher_id', teacherId);
    const currentIds = (current || []).map(c => c.id);
    const toRemove = currentIds.filter(id => !classIds.includes(id));
    if (toRemove.length) {
      await db.from('classes').update({ teacher_id: null }).in('id', toRemove);
    }
    if (classIds.length) {
      await db.from('classes').update({ teacher_id: teacherId }).in('id', classIds);
    }
  }

  async function getTeacherClasses(teacherId) {
    const { data, error } = await db.from('classes')
      .select('id, name').eq('teacher_id', teacherId);
    if (error) throw error;
    return data || [];
  }

  /* ====================================================================
     TURMAS
     ==================================================================== */

  /**
   * Constrói um mapa { classId → [studentId, …] } com base nos vínculos
   * student_teachers do professor logado.  Necessário porque a RLS de students
   * filtra pelo vínculo direto em student_teachers; a join classes→students
   * retorna vazio para o professor quando os alunos não possuem registro em
   * student_teachers (cenário em que o admin atribuiu alunos à turma sem criar
   * o vínculo no student_teachers).
   */
  async function _buildTeacherClassStudentMap(uid) {
    const { data, error } = await db.from('student_teachers')
      .select('student_id, students(class_id)')
      .eq('teacher_id', uid);
    if (error) throw error;
    const map = {};
    for (const row of (data || [])) {
      const cid = row.students?.class_id;
      if (cid) {
        if (!map[cid]) map[cid] = [];
        map[cid].push(row.student_id);
      }
    }
    return map;
  }

  async function getClasses() {
    const role = await HT.auth.getRole();

    if (role !== 'admin') {
      /* Professor: a join classes→students é barrada pela RLS.
         Buscamos as turmas normalmente e reconstruímos studentIds via
         student_teachers (que o professor PODE ler). */
      const uid = await _uid();
      const [classRes, mapResult] = await Promise.all([
        db.from('classes').select('*').order('name'),
        _buildTeacherClassStudentMap(uid),
      ]);
      if (classRes.error) throw classRes.error;
      return classRes.data.map(r => {
        const cls = _toClass(r);          /* studentIds = [] (sem join) */
        cls.studentIds = mapResult[r.id] || [];
        return cls;
      });
    }

    /* Admin: join normal */
    const { data, error } = await db.from('classes')
      .select('*, students(id)')
      .order('name');
    if (error) throw error;
    return data.map(_toClass);
  }

  async function getClass(id) {
    const role = await HT.auth.getRole();

    if (role !== 'admin') {
      const uid = await _uid();
      const [classRes, mapResult] = await Promise.all([
        db.from('classes').select('*').eq('id', id).single(),
        _buildTeacherClassStudentMap(uid),
      ]);
      if (classRes.error) return null;
      const cls = _toClass(classRes.data);
      cls.studentIds = mapResult[id] || [];
      return cls;
    }

    const { data, error } = await db.from('classes')
      .select('*, students(id)').eq('id', id).single();
    if (error) return null;
    return _toClass(data);
  }

  async function saveClass(data) {
    const row = _fromClass(data);
    let classId = data.id;

    if (data.id) {
      const { error } = await db.from('classes').update(row).eq('id', data.id);
      if (error) throw error;
    } else {
      const { data: ins, error } = await db.from('classes').insert(row).select().single();
      if (error) throw error;
      classId = ins.id;
    }

    if (Array.isArray(data.studentIds)) {
      const newIds = data.studentIds;
      const { data: current } = await db.from('students').select('id').eq('class_id', classId);
      const currentIds = (current || []).map(s => s.id);

      const toRemove = currentIds.filter(i => !newIds.includes(i));
      const toAdd    = newIds.filter(i => !currentIds.includes(i));

      if (toRemove.length) await db.from('students').update({ class_id: null }).in('id', toRemove);
      if (toAdd.length)    await db.from('students').update({ class_id: classId }).in('id', toAdd);

      /* Sincroniza student_teachers: garante que todos os alunos da turma
         tenham vínculo com o professor da turma.  Usa ignoreDuplicates para
         preservar rate_override existente. */
      const teacherId = data.teacherId || row.teacher_id || null;
      if (teacherId && newIds.length) {
        const links = newIds.map(sid => ({ student_id: sid, teacher_id: teacherId }));
        await db.from('student_teachers')
          .upsert(links, { onConflict: 'student_id,teacher_id', ignoreDuplicates: true });
      }
    }
    return getClass(classId);
  }

  async function deleteClass(id) {
    await db.from('students').update({ class_id: null }).eq('class_id', id);
    const { error } = await db.from('classes').delete().eq('id', id);
    if (error) throw error;
  }

  /* ====================================================================
     FREQUÊNCIA  (prof vê só as suas — RLS)
     ==================================================================== */

  async function getAttendance() {
    const { data, error } = await db.from('attendance')
      .select('*').order('date', { ascending: false });
    if (error) throw error;
    return data.map(_toAttendance);
  }

  /**
   * Paginated attendance with optional filters.
   * Suporta: page, pageSize, dateFrom, dateTo, status, classId, studentId, teacherId.
   */
  async function getAttendancePage({
    page = 1, pageSize = 50,
    dateFrom = '', dateTo = '', status = '',
    classId = '', studentId = '', teacherId = '',
  } = {}) {
    let q = db.from('attendance')
      .select('*', { count: 'exact' })
      .order('date', { ascending: false });

    if (dateFrom)  q = q.gte('date', dateFrom);
    if (dateTo)    q = q.lte('date', dateTo);
    if (status)    q = q.eq('status', status);
    if (classId)   q = q.eq('class_id', classId);
    if (studentId) q = q.eq('student_id', studentId);
    if (teacherId) q = q.eq('teacher_id', teacherId);

    const from = (page - 1) * pageSize;
    const to   = from + pageSize - 1;
    const { data, error, count } = await q.range(from, to);
    if (error) throw error;
    return {
      items: (data || []).map(_toAttendance),
      total: count ?? 0,
      page, pageSize,
    };
  }

  async function getStudentAttendance(studentId) {
    const { data, error } = await db.from('attendance')
      .select('*').eq('student_id', studentId).order('date', { ascending: false });
    if (error) throw error;
    return data.map(_toAttendance);
  }

  async function saveAttendance(data) {
    if (data.id) {
      /* UPDATE: teacher_id não é repassado — preserva o valor original no banco */
      const row = await _fromAttendance(data, false);
      const { data: u, error } = await db.from('attendance')
        .update(row).eq('id', data.id).select().single();
      if (error) throw error;
      return _toAttendance(u);
    }
    /* INSERT: teacher_id é definido com base no contexto / papel */
    const row = await _fromAttendance(data, true);
    const { data: ins, error } = await db.from('attendance')
      .insert(row).select().single();
    if (error) throw error;
    return _toAttendance(ins);
  }

  async function deleteAttendance(id) {
    const { error } = await db.from('attendance').delete().eq('id', id);
    if (error) throw error;
  }

  /* ====================================================================
     PAGAMENTOS — só admin (RLS bloqueia prof)
     ==================================================================== */

  async function getPayments() {
    const { data, error } = await db.from('payments')
      .select('*').order('reference', { ascending: false });
    if (error) throw error;
    return data.map(_toPayment);
  }

  /**
   * Paginated payments with optional filters.
   * Suporta: page, pageSize, reference (mês YYYY-MM), status, studentId.
   */
  async function getPaymentsPage({
    page = 1, pageSize = 50,
    reference = '', status = '', studentId = '',
  } = {}) {
    let q = db.from('payments')
      .select('*', { count: 'exact' })
      .order('reference', { ascending: false });

    if (reference) q = q.eq('reference', reference);
    if (status)    q = q.eq('status', status);
    if (studentId) q = q.eq('student_id', studentId);

    const from = (page - 1) * pageSize;
    const to   = from + pageSize - 1;
    const { data, error, count } = await q.range(from, to);
    if (error) throw error;
    return {
      items: (data || []).map(_toPayment),
      total: count ?? 0,
      page, pageSize,
    };
  }

  async function getStudentPayments(studentId) {
    const { data, error } = await db.from('payments')
      .select('*').eq('student_id', studentId).order('reference', { ascending: false });
    if (error) throw error;
    return data.map(_toPayment);
  }

  async function savePayment(data) {
    const row = _fromPayment(data);
    if (data.id) {
      const { data: u, error } = await db.from('payments')
        .update(row).eq('id', data.id).select().single();
      if (error) throw error;
      return _toPayment(u);
    }
    const { data: ins, error } = await db.from('payments')
      .insert(row).select().single();
    if (error) throw error;
    return _toPayment(ins);
  }

  async function deletePayment(id) {
    const { error } = await db.from('payments').delete().eq('id', id);
    if (error) throw error;
  }

  /* ====================================================================
     PERFIL
     ==================================================================== */

  async function getProfile() {
    const { data: { user } } = await db.auth.getUser();
    if (!user) return null;
    const { data } = await db.from('profiles').select('*').eq('id', user.id).single();
    return {
      name:    data?.name    || '',
      email:   data?.email   || user.email || '',
      phone:   data?.phone   || '',
      subject: data?.subject || '',
      bio:     data?.bio     || '',
      photo:   data?.photo   || null,
      role:    data?.role    || 'teacher',
      defaultLessonRate: data?.default_lesson_rate ?? null,
    };
  }

  async function saveProfile(profileData) {
    const { data: { user } } = await db.auth.getUser();
    if (!user) throw new Error('Não autenticado.');

    const row = {
      id:      user.id,
      name:    profileData.name    || null,
      email:   profileData.email   || null,
      phone:   profileData.phone   || null,
      subject: profileData.subject || null,
      bio:     profileData.bio     || null,
      updated_at: new Date().toISOString(),
    };
    if (profileData.photo !== undefined) row.photo = profileData.photo;

    const { error } = await db.from('profiles').upsert(row);
    if (error) throw error;
    return getProfile();
  }

  /* ====================================================================
     PROFESSORES  (admin only)
     ==================================================================== */

  async function getTeachers() {
    const { data, error } = await db.from('profiles')
      .select('id, name, email, phone, subject, default_lesson_rate, active, created_at')
      .eq('role', 'teacher').order('name');
    if (error) throw error;
    return (data || []).map(t => ({
      id:         t.id,
      name:       t.name        || '',
      email:      t.email       || '',
      phone:      t.phone       || '',
      subject:    t.subject     || '',
      defaultRate: t.default_lesson_rate,
      active:     t.active,
      createdAt:  t.created_at,
    }));
  }

  async function getTeacher(id) {
    const { data, error } = await db.from('profiles')
      .select('*').eq('id', id).single();
    if (error) return null;
    return data;
  }

  async function updateTeacher(id, fields) {
    const row = {};
    if (fields.name !== undefined)        row.name = fields.name;
    if (fields.phone !== undefined)       row.phone = fields.phone;
    if (fields.subject !== undefined)     row.subject = fields.subject;
    if (fields.defaultRate !== undefined) row.default_lesson_rate = fields.defaultRate;
    if (fields.active !== undefined)      row.active = fields.active;
    row.updated_at = new Date().toISOString();
    const { error } = await db.from('profiles').update(row).eq('id', id);
    if (error) throw error;
  }

  async function deleteTeacher(id) {
    /* remove o profile; auth.users será removido pelo admin no painel ou via Edge Function */
    const { error } = await db.from('profiles').delete().eq('id', id);
    if (error) throw error;
  }

  /* Convidar professor — envia magic-link via anon key (sem Edge Function) */
  async function inviteTeacher({ email, name, defaultRate }) {
    const { error } = await db.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
        data: {
          name:                 name        || null,
          default_lesson_rate:  defaultRate ?? null,
        },
      },
    });
    if (error) throw error;
    return { success: true };
  }

  /* ====================================================================
     PROGRESSO — Categorias / Conteúdos / Registros
     ==================================================================== */

  function _toProgressCategory(r) {
    return { id: r.id, name: r.name, position: r.position ?? 0, createdAt: r.created_at };
  }
  async function getProgressCategories() {
    const { data, error } = await db.from('progress_categories').select('*').order('position');
    if (error) throw error;
    return data.map(_toProgressCategory);
  }
  async function saveProgressCategory(d) {
    const row = { name: d.name, position: d.position ?? 0 };
    if (d.id) {
      const { data: u, error } = await db.from('progress_categories')
        .update(row).eq('id', d.id).select().single();
      if (error) throw error;
      return _toProgressCategory(u);
    }
    const { data: ins, error } = await db.from('progress_categories')
      .insert(row).select().single();
    if (error) throw error;
    return _toProgressCategory(ins);
  }
  async function deleteProgressCategory(id) {
    const { error } = await db.from('progress_categories').delete().eq('id', id);
    if (error) throw error;
  }

  function _toProgressContent(r) {
    return {
      id: r.id, categoryId: r.category_id,
      title: r.title, description: r.description || '',
      position: r.position ?? 0, createdAt: r.created_at,
    };
  }
  async function getProgressContents() {
    const { data, error } = await db.from('progress_contents').select('*').order('position');
    if (error) throw error;
    return data.map(_toProgressContent);
  }
  async function saveProgressContent(d) {
    const row = {
      category_id: d.categoryId, title: d.title,
      description: d.description || null, position: d.position ?? 0,
    };
    if (d.id) {
      const { data: u, error } = await db.from('progress_contents')
        .update(row).eq('id', d.id).select().single();
      if (error) throw error;
      return _toProgressContent(u);
    }
    const { data: ins, error } = await db.from('progress_contents')
      .insert(row).select().single();
    if (error) throw error;
    return _toProgressContent(ins);
  }
  async function deleteProgressContent(id) {
    const { error } = await db.from('progress_contents').delete().eq('id', id);
    if (error) throw error;
  }

  function _toStudentProgress(r) {
    return {
      id: r.id, studentId: r.student_id, contentId: r.content_id,
      status: r.status, date: r.date, notes: r.notes || '', createdAt: r.created_at,
    };
  }
  async function getStudentProgressRecords(studentId) {
    const { data, error } = await db.from('student_progress')
      .select('*').eq('student_id', studentId).order('date', { ascending: false });
    if (error) throw error;
    return data.map(_toStudentProgress);
  }
  async function getAllStudentProgress() {
    const { data, error } = await db.from('student_progress')
      .select('*').order('date', { ascending: false });
    if (error) throw error;
    return data.map(_toStudentProgress);
  }
  async function saveStudentProgress(d) {
    const row = {
      student_id: d.studentId, content_id: d.contentId,
      status: d.status, date: d.date, notes: d.notes || null,
    };
    if (d.id) {
      const { data: u, error } = await db.from('student_progress')
        .update(row).eq('id', d.id).select().single();
      if (error) throw error;
      return _toStudentProgress(u);
    }
    const { data: ins, error } = await db.from('student_progress')
      .insert(row).select().single();
    if (error) throw error;
    return _toStudentProgress(ins);
  }
  async function bulkSaveStudentProgress(records) {
    if (!records.length) return;
    const rows = records.map(d => ({
      student_id: d.studentId, content_id: d.contentId,
      status: d.status, date: d.date, notes: d.notes || null,
    }));
    const { error } = await db.from('student_progress').insert(rows);
    if (error) throw error;
  }
  async function deleteStudentProgress(id) {
    const { error } = await db.from('student_progress').delete().eq('id', id);
    if (error) throw error;
  }

  /* ====================================================================
     DISPONIBILIDADE
     ==================================================================== */

  function _toAvailability(r) {
    return {
      id:           r.id,
      teacherId:    r.teacher_id,
      title:        r.title        || '',
      type:         r.type         || 'available',
      isRecurring:  r.is_recurring,
      dayOfWeek:    r.day_of_week  ?? null,
      specificDate: r.specific_date || null,
      startTime:    r.start_time,
      endTime:      r.end_time,
      notes:        r.notes        || '',
      createdAt:    r.created_at,
    };
  }

  function _fromAvailability(d, teacherId) {
    return {
      teacher_id:    teacherId,
      title:         d.title        || null,
      type:          d.type         || 'available',
      is_recurring:  d.isRecurring  ?? true,
      day_of_week:   d.dayOfWeek    ?? null,
      specific_date: d.specificDate || null,
      start_time:    d.startTime,
      end_time:      d.endTime,
      notes:         d.notes        || null,
    };
  }

  /* Carrega disponibilidade de um professor (admin passa teacherId; professor omite) */
  async function getAvailability(teacherId) {
    const uid = teacherId || (await _uid());
    const { data, error } = await db.from('teacher_availability')
      .select('*').eq('teacher_id', uid).order('created_at');
    if (error) throw error;
    return (data || []).map(_toAvailability);
  }

  async function saveAvailability(d) {
    const uid = await _uid();
    const teacherId = d.teacherId || uid;
    const row = _fromAvailability(d, teacherId);
    if (d.id) {
      const { data: u, error } = await db.from('teacher_availability')
        .update(row).eq('id', d.id).select().single();
      if (error) throw error;
      return _toAvailability(u);
    }
    const { data: ins, error } = await db.from('teacher_availability')
      .insert(row).select().single();
    if (error) throw error;
    return _toAvailability(ins);
  }

  async function deleteAvailability(id) {
    const { error } = await db.from('teacher_availability').delete().eq('id', id);
    if (error) throw error;
  }

  /**
   * Retorna horários para o calendário de disponibilidade do professor.
   * Alunos em turma → uma entrada por turma (usa o horário da turma).
   * Alunos sem turma → uma entrada por aluno (usa o horário individual).
   *
   * Formato retornado: [
   *   { type: 'class',   classId, label, schedules },
   *   { type: 'student', studentId, label, schedules },
   * ]
   */
  async function getTeacherStudentSchedules(teacherId) {
    const uid = teacherId || (await _uid());

    /* Alunos vinculados ao professor (incluindo class_id) */
    const { data, error } = await db.from('student_teachers')
      .select('student_id, students(id, name, schedules, class_id)')
      .eq('teacher_id', uid);
    if (error) throw error;

    const students = (data || []).filter(r => r.students).map(r => r.students);

    /* Separar alunos com e sem turma */
    const withClass    = students.filter(s => s.class_id);
    const withoutClass = students.filter(s => !s.class_id);

    /* Buscar schedules das turmas (única fonte de horário para aulas coletivas) */
    const classIds = [...new Set(withClass.map(s => s.class_id))];
    let classMap = {};
    if (classIds.length) {
      const { data: classes } = await db.from('classes')
        .select('id, name, schedules')
        .in('id', classIds);
      (classes || []).forEach(c => { classMap[c.id] = c; });
    }

    /* Entradas de turma (uma por turma, com horário da turma) */
    const classEntries = classIds
      .filter(id => classMap[id])
      .map(id => ({
        type:      'class',
        classId:   id,
        label:     classMap[id].name,
        schedules: classMap[id].schedules || [],
      }));

    /* Entradas individuais (alunos sem turma, com horário próprio) */
    const individualEntries = withoutClass.map(s => ({
      type:      'student',
      studentId: s.id,
      label:     s.name,
      schedules: s.schedules || [],
    }));

    return [...classEntries, ...individualEntries];
  }

  /* ====================================================================
     MATERIAIS (Storage bucket: "materials" — deve ser público)
     ==================================================================== */

  const MATERIALS_BUCKET = 'materials';

  /* ── Pastas ── */
  async function getFolders() {
    const { data, error } = await db.from('material_folders')
      .select('*').order('position').order('name');
    if (error) throw error;
    return (data || []).map(r => ({
      id: r.id, name: r.name, color: r.color || '#032d6f',
      position: r.position, createdAt: r.created_at,
    }));
  }

  async function saveFolder({ id, name, color }) {
    const uid = await _uid();
    if (id) {
      const { error } = await db.from('material_folders')
        .update({ name, color: color || '#032d6f' }).eq('id', id);
      if (error) throw error;
      return;
    }
    const { error } = await db.from('material_folders')
      .insert({ name, color: color || '#032d6f', created_by: uid });
    if (error) throw error;
  }

  async function deleteFolder(id) {
    /* materials.folder_id → null automaticamente via ON DELETE SET NULL */
    const { error } = await db.from('material_folders').delete().eq('id', id);
    if (error) throw error;
  }

  /* ── Materiais ── */
  async function getMaterials() {
    const { data, error } = await db.from('materials')
      .select('*, folder:material_folders(id, name, color)')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []).map(r => ({
      id:          r.id,
      name:        r.name,
      description: r.description || '',
      filePath:    r.file_path,
      fileName:    r.file_name   || '',
      fileSize:    r.file_size   || 0,
      mimeType:    r.mime_type   || '',
      category:    r.category    || '',
      folderId:    r.folder_id   || null,
      folderName:  r.folder?.name  || null,
      folderColor: r.folder?.color || null,
      createdAt:   r.created_at,
    }));
  }

  async function saveMaterial({ id, name, description, category, folderId, filePath, fileName, fileSize, mimeType }) {
    const uid = await _uid();
    const row = {
      name,
      description:  description || null,
      category:     category    || null,
      folder_id:    folderId    || null,
      file_path:    filePath,
      file_name:    fileName    || null,
      file_size:    fileSize    || null,
      mime_type:    mimeType    || null,
      uploaded_by:  uid,
      updated_at:   new Date().toISOString(),
    };
    if (id) {
      const { error } = await db.from('materials').update(row).eq('id', id);
      if (error) throw error;
      return;
    }
    const { error } = await db.from('materials').insert(row);
    if (error) throw error;
  }

  async function deleteMaterial(id, filePath) {
    if (filePath) {
      await db.storage.from(MATERIALS_BUCKET).remove([filePath]);
    }
    const { error } = await db.from('materials').delete().eq('id', id);
    if (error) throw error;
  }

  const ALLOWED_EXTENSIONS = new Set([
    'pdf','doc','docx','xls','xlsx','ppt','pptx','odt','ods','odp',
    'jpg','jpeg','png','gif','webp','svg','mp4','mp3','wav','zip',
    'csv','txt','md','json',
  ]);
  const MAX_FILE_MB = 50;

  async function uploadMaterialFile(file) {
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      throw new Error(`Tipo de arquivo não permitido: .${ext}`);
    }
    if (file.size > MAX_FILE_MB * 1024 * 1024) {
      throw new Error(`O arquivo excede o limite de ${MAX_FILE_MB} MB.`);
    }
    const path = `${crypto.randomUUID()}.${ext}`;
    const { data, error } = await db.storage
      .from(MATERIALS_BUCKET)
      .upload(path, file, { contentType: file.type, upsert: false });
    if (error) throw error;
    const { data: { publicUrl } } = db.storage.from(MATERIALS_BUCKET).getPublicUrl(data.path);
    return { path: data.path, publicUrl, fileName: file.name, fileSize: file.size, mimeType: file.type };
  }

  function getMaterialPublicUrl(filePath) {
    const { data: { publicUrl } } = db.storage.from(MATERIALS_BUCKET).getPublicUrl(filePath);
    return publicUrl;
  }

  /* ====================================================================
     PENDENTES DE REPOSIÇÃO (faltas justificadas sem reposição registrada)
     ==================================================================== */

  /**
   * Retorna alunos com faltas justificadas que ainda não têm reposição.
   * Reposição = registro com status 'makeup' do MESMO aluno em data >= falta.
   * (Aproximação: 1 falta justificada → 1 reposição esperada, ordem cronológica.)
   */
  async function getPendingMakeups() {
    const { data, error } = await db.from('attendance')
      .select('id, student_id, class_id, date, status')
      .in('status', ['justified', 'makeup'])
      .order('date', { ascending: true });
    if (error) throw error;

    /* Agrupa por aluno: contabiliza justified vs makeup, retorna pendentes (justified - makeup > 0) */
    const byStudent = new Map();
    for (const r of (data || [])) {
      if (!byStudent.has(r.student_id)) {
        byStudent.set(r.student_id, { justified: [], makeup: [] });
      }
      byStudent.get(r.student_id)[r.status === 'justified' ? 'justified' : 'makeup'].push(r);
    }

    const pending = [];
    for (const [studentId, { justified, makeup }] of byStudent) {
      const owed = justified.length - makeup.length;
      if (owed > 0) {
        pending.push({
          studentId,
          owed,
          oldestUnpaid: justified[justified.length - owed]?.date || justified[0].date,
          totalJustified: justified.length,
          totalMakeup:    makeup.length,
        });
      }
    }
    return pending;
  }

  return {
    getStudents, getStudent, saveStudent, deleteStudent,
    getStudentsPage,
    getClasses,  getClass,  saveClass,  deleteClass,
    getAttendance, getStudentAttendance, saveAttendance, deleteAttendance,
    getAttendancePage, getPendingMakeups,
    getPayments, getStudentPayments, savePayment, deletePayment,
    getPaymentsPage,
    getProfile, saveProfile,
    getTeachers, getTeacher, updateTeacher, deleteTeacher, inviteTeacher,
    setStudentTeachers,
    getTeacherStudents, setTeacherStudents,
    getTeacherClasses,  setTeacherClasses,
    getProgressCategories, saveProgressCategory, deleteProgressCategory,
    getProgressContents,   saveProgressContent,  deleteProgressContent,
    getStudentProgressRecords, getAllStudentProgress,
    saveStudentProgress, bulkSaveStudentProgress, deleteStudentProgress,
    getAvailability, saveAvailability, deleteAvailability,
    getTeacherStudentSchedules,
    getFolders, saveFolder, deleteFolder,
    getMaterials, saveMaterial, deleteMaterial, uploadMaterialFile, getMaterialPublicUrl,
  };

})();
