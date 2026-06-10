/* ==========================================================================
   ALUNOS.JS — Gestão de alunos (Supabase async)
   ========================================================================== */

document.addEventListener('DOMContentLoaded', async () => {

  const { utils, storage, modals } = HT;

  const role = await HT.auth.getRole();
  const isAdmin = role === 'admin';

  /* ====== Cache local ====== */
  let allStudents     = [];
  let allClasses      = [];
  let currentId       = null;
  let pendingDeleteId = null;

  /* ====== Helpers de busca no cache ====== */
  function findStudent(id) { return allStudents.find(s => s.id === id) || null; }
  function findClass(id)   { return allClasses.find(c => c.id === id) || null; }

  /* ====== Referências DOM ====== */
  const grid        = document.getElementById('studentsGrid');
  const countEl     = document.getElementById('studentsCount');
  const searchInput = document.getElementById('studentSearch');
  const filterLevel = document.getElementById('filterLevel');
  const filterClass = document.getElementById('filterClass');

  let allCourses     = [];

  function findCourse(id) { return allCourses.find(c => c.id === id) || null; }
  function formatCourseLabel(c) { return c ? `${c.language} — ${c.name}` : ''; }

  /* ====== Carregar e Renderizar ====== */
  async function load() {
    [allStudents, allClasses, allCourses] = await Promise.all([
      storage.getStudents(),
      storage.getClasses(),
      storage.getCourses(),
    ]);
    populateClassFilter();
    render();
  }

  function getFiltered() {
    const q     = (searchInput?.value || '').toLowerCase();
    const level = filterLevel?.value || '';
    const cls   = filterClass?.value  || '';

    return allStudents.filter(s => {
      if (q     && !s.name.toLowerCase().includes(q)) return false;
      if (level && s.level   !== level) return false;
      if (cls   && s.classId !== cls)   return false;
      return true;
    });
  }

  function render() {
    const list = getFiltered();

    if (countEl) {
      countEl.textContent = list.length === allStudents.length
        ? `${allStudents.length} aluno${allStudents.length !== 1 ? 's' : ''}`
        : `${list.length} de ${allStudents.length}`;
    }

    const cards = list.map(s => buildCard(s)).join('');
    const empty = `
      <div class="empty-state" id="emptyStudents">
        <i class="fa-solid fa-user-plus empty-state-icon"></i>
        <p class="empty-state-title">Nenhum aluno encontrado</p>
        <p class="empty-state-desc">${allStudents.length ? 'Tente ajustar os filtros' : 'Clique em "Novo Aluno" para começar'}</p>
        ${!allStudents.length ? '<button class="btn btn--primary" id="addFirstStudentBtn"><i class="fa-solid fa-plus"></i> Cadastrar Aluno</button>' : ''}
      </div>`;

    if (grid) grid.innerHTML = list.length ? cards : empty;

    grid?.querySelectorAll('.student-card').forEach(card => {
      card.addEventListener('click', () => openDetail(card.dataset.id));
    });
    document.getElementById('addFirstStudentBtn')
      ?.addEventListener('click', () => openForm());
  }

  function getStudentSchedules(s) {
    if (s.schedules && s.schedules.length) return s.schedules;
    if (s.day) return [{ day: s.day, time: s.time, duration: s.duration || 60 }];
    return [];
  }

  function buildCard(s) {
    const cls       = s.classId ? findClass(s.classId) : null;
    const schedules = getStudentSchedules(s);

    const schedText = schedules.length
      ? schedules.map(sc => `${utils.formatDayShort(sc.day)}${sc.time ? ' ' + sc.time : ''}`).join(' · ')
      : null;

    const meta = [
      schedText
        ? `<div class="student-card-meta-item"><i class="fa-regular fa-clock"></i>${schedText}</div>` : '',
      cls
        ? `<div class="student-card-meta-item"><i class="fa-solid fa-users"></i>${cls.name}</div>`
        : '<div class="student-card-meta-item"><i class="fa-solid fa-user"></i>Individual</div>',
      s.email
        ? `<div class="student-card-meta-item"><i class="fa-regular fa-envelope"></i>${s.email}</div>` : '',
    ].filter(Boolean).join('');

    return `
      <div class="student-card" data-id="${s.id}" role="button" tabindex="0" aria-label="Ver detalhes de ${s.name}">
        <div class="student-card-header">
          <div class="student-card-avatar">${utils.getInitials(s.name)}</div>
          <div class="student-card-info">
            <div class="student-card-name">${s.name}</div>
            <div class="student-card-level">${utils.formatLevel(s.level)}</div>
          </div>
        </div>
        <div class="student-card-meta">${meta}</div>
        <div class="student-card-footer">
          ${utils.levelBadge(s.level)}
          ${isAdmin && s.monthlyFee ? `<span class="text-muted text-small">${utils.formatCurrency(s.monthlyFee)}/mês</span>` : ''}
        </div>
      </div>`;
  }

  /* ====== Filtros ====== */
  function populateClassFilter() {
    if (!filterClass) return;
    const current = filterClass.value;
    filterClass.innerHTML = '<option value="">Todas as turmas</option>'
      + allClasses.map(c => `<option value="${c.id}"${c.id===current?' selected':''}>${c.name}</option>`).join('');
  }

  searchInput?.addEventListener('input',  utils.debounce(render, 250));
  filterLevel?.addEventListener('change', render);
  filterClass?.addEventListener('change', render);

  /* ====== Builder de Horários ====== */
  const DAY_OPTIONS = [
    ['monday','Segunda'], ['tuesday','Terça'], ['wednesday','Quarta'],
    ['thursday','Quinta'], ['friday','Sexta'], ['saturday','Sábado'], ['sunday','Domingo'],
  ];

  function makeDayOptions(selected) {
    return DAY_OPTIONS.map(([v, l]) =>
      `<option value="${v}"${v === selected ? ' selected' : ''}>${l}</option>`
    ).join('');
  }

  function makeScheduleEntry(sc = {}) {
    const entry = document.createElement('div');
    entry.className = 'schedule-entry';
    entry.innerHTML = `
      <div class="form-row form-row--schedule">
        <div class="form-group">
          <label class="form-label">Dia</label>
          <select class="form-select sch-day">
            <option value="">Selecione</option>
            ${makeDayOptions(sc.day)}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Horário </label>
          <input type="time" class="form-input sch-time" value="${sc.time || ''}" />
        </div>
        <div class="form-group">
          <label class="form-label">Duração (min)</label>
          <input type="number" class="form-input sch-dur" placeholder="60"
                 min="15" max="240" step="15" value="${sc.duration || ''}" />
        </div>
        <button type="button" class="btn-remove-schedule" aria-label="Remover horário">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>`;

    entry.querySelector('.btn-remove-schedule').addEventListener('click', () => {
      const all = document.querySelectorAll('#studentSchedules .schedule-entry');
      if (all.length > 1) entry.remove();
    });

    return entry;
  }

  function initStudentSchedules(schedules) {
    const container = document.getElementById('studentSchedules');
    if (!container) return;
    container.innerHTML = '';
    const list = schedules && schedules.length ? schedules : [{}];
    list.forEach(sc => container.appendChild(makeScheduleEntry(sc)));
  }

  function readStudentSchedules() {
    return Array.from(document.querySelectorAll('#studentSchedules .schedule-entry'))
      .map(entry => ({
        day:      entry.querySelector('.sch-day')?.value  || '',
        time:     entry.querySelector('.sch-time')?.value || '',
        duration: Number(entry.querySelector('.sch-dur')?.value)  || 60,
      }))
      .filter(sc => sc.day);
  }

  document.getElementById('addStudentScheduleBtn')?.addEventListener('click', () => {
    const container = document.getElementById('studentSchedules');
    if (container) container.appendChild(makeScheduleEntry());
  });

  /* ====== Modal de Formulário ====== */
  function openForm(student = null) {
    const form = document.getElementById('studentForm');
    if (!form) return;

    form.reset();
    document.getElementById('studentId').value = student?.id || '';
    document.getElementById('studentModalTitle').textContent = student ? 'Editar Aluno' : 'Novo Aluno';

    if (student) {
      utils.setInputValue('studentName',          student.name);
      utils.setInputValue('studentAge',           student.age);
      utils.setInputValue('studentEmail',         student.email);
      utils.setInputValue('studentPhone',         student.phone);
      utils.setInputValue('studentLevel',         student.level);
      utils.setInputValue('studentNotes',         student.notes);
      utils.setInputValue('studentFee',           student.monthlyFee);
      utils.setInputValue('studentPayDay',        student.payDay);
      utils.setInputValue('studentContractStart', student.contractStart);
      utils.setInputValue('studentContractEnd',   student.contractEnd);
      populateCourseSelect(student.courseId);
      populateClassSelect(student.classId);
      initStudentSchedules(getStudentSchedules(student));
    } else {
      populateCourseSelect(null);
      populateClassSelect(null);
      initStudentSchedules([]);
    }

    modals.open('studentModalOverlay');
  }

  function populateClassSelect(selectedId) {
    const sel = document.getElementById('studentClass');
    if (!sel) return;
    sel.innerHTML = '<option value="">Aula individual</option>'
      + allClasses.map(c => `<option value="${c.id}"${c.id===selectedId?' selected':''}>${c.name}</option>`).join('');
  }

  function populateCourseSelect(selectedId) {
    const sel = document.getElementById('studentCourse');
    if (!sel) return;
    if (!allCourses.length) {
      sel.innerHTML = '<option value="">— Nenhum curso cadastrado (vá em Progresso → Curso) —</option>';
      sel.disabled = true;
      return;
    }
    sel.disabled = false;
    sel.innerHTML = '<option value="">Selecione um curso</option>'
      + allCourses.map(c =>
          `<option value="${c.id}"${c.id === selectedId ? ' selected' : ''}>${formatCourseLabel(c)}</option>`
        ).join('');
  }

  document.getElementById('addStudentBtn')?.addEventListener('click', () => openForm());
  document.getElementById('studentModalCancel')?.addEventListener('click', () => modals.close('studentModalOverlay'));

  /* Salvar formulário */
  document.getElementById('studentForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const nameErr   = document.getElementById('nameError');
    const levelErr  = document.getElementById('levelError');
    const courseErr = document.getElementById('courseError');
    nameErr.textContent = levelErr.textContent = '';
    if (courseErr) courseErr.textContent = '';

    const name     = utils.getInputValue('studentName');
    const level    = utils.getInputValue('studentLevel');
    const courseId = utils.getInputValue('studentCourse');
    let valid = true;

    if (!name)     { nameErr.textContent   = 'Informe o nome.';      valid = false; }
    if (!courseId && courseErr) {
      courseErr.textContent = 'Selecione um curso.'; valid = false;
    }
    if (!level)    { levelErr.textContent  = 'Selecione o nível.';   valid = false; }
    if (!valid) return;

    const id        = document.getElementById('studentId').value;
    const schedules = readStudentSchedules();

    const saveBtn = document.getElementById('studentModalSave');
    if (saveBtn) saveBtn.classList.add('is-loading');

    try {
      await storage.saveStudent({
        id:            id || undefined,
        name,
        age:           utils.getInputValue('studentAge')           || null,
        email:         utils.getInputValue('studentEmail')         || '',
        phone:         utils.getInputValue('studentPhone')         || '',
        courseId:      courseId || null,
        classId:       utils.getInputValue('studentClass')         || null,
        level,
        schedules,
        notes:         utils.getInputValue('studentNotes')         || '',
        monthlyFee:    Number(utils.getInputValue('studentFee'))   || 0,
        payDay:        Number(utils.getInputValue('studentPayDay'))|| null,
        contractStart: utils.getInputValue('studentContractStart') || null,
        contractEnd:   utils.getInputValue('studentContractEnd')   || null,
      });

      modals.close('studentModalOverlay');
      utils.showToast(id ? 'Aluno atualizado!' : 'Aluno cadastrado!', 'success');
      await load();
    } catch (err) {
      utils.showToast('Erro ao salvar aluno. Tente novamente.', 'error');
      console.error(err);
    } finally {
      if (saveBtn) saveBtn.classList.remove('is-loading');
    }
  });

  /* ====== Modal de Detalhe ====== */
  function openDetail(id) {
    const s = findStudent(id);
    if (!s) return;
    currentId = id;

    document.getElementById('detailStudentName').textContent  = s.name;
    document.getElementById('detailStudentLevel').textContent = utils.formatLevel(s.level);
    document.getElementById('detailAvatar').innerHTML =
      `<span style="font-size:1.5rem;font-weight:700;color:var(--color-primary)">${utils.getInitials(s.name)}</span>`;

    const cls    = s.classId  ? findClass(s.classId)   : null;
    const course = s.courseId ? findCourse(s.courseId) : null;
    utils.setTextContent('detailEmail',         s.email  || '—');
    utils.setTextContent('detailPhone',         utils.formatPhone(s.phone));
    utils.setTextContent('detailAge',           s.age    ? `${s.age} anos` : '—');
    utils.setTextContent('detailCourse',        course ? formatCourseLabel(course) : '—');
    utils.setTextContent('detailClass',         cls?.name || 'Individual');
    utils.setTextContent('detailLevel',         utils.formatLevel(s.level));
    utils.setTextContent('detailFee',           s.monthlyFee ? utils.formatCurrency(s.monthlyFee)+'/mês' : '—');
    utils.setTextContent('detailContractStart', utils.formatDate(s.contractStart));
    utils.setTextContent('detailContractEnd',   utils.formatDate(s.contractEnd));
    utils.setTextContent('detailNotes',         s.notes  || '—');

    // Horários
    const schedules = getStudentSchedules(s);
    const schedEl   = document.getElementById('detailSchedules');
    if (schedEl) {
      schedEl.innerHTML = schedules.length
        ? schedules.map(sc =>
            `<span class="schedule-chip">${utils.formatDay(sc.day)}${sc.time ? ' · ' + sc.time : ''}${sc.duration ? ' (' + sc.duration + ' min)' : ''}</span>`
          ).join('')
        : '<span>—</span>';
    }

    loadAttendanceTab(id);
    if (isAdmin) loadFinanceTab(id);
    activateTab('btnTabProfile', 'tabProfile');
    modals.open('studentDetailOverlay');
  }

  async function loadAttendanceTab(studentId) {
    const records = await storage.getStudentAttendance(studentId);
    const present = records.filter(r => r.status === 'present').length;
    const absent  = records.filter(r => r.status !== 'present').length;
    const rate    = records.length ? Math.round((present / records.length) * 100) : 0;

    utils.setTextContent('attPresent', present);
    utils.setTextContent('attAbsent',  absent);
    utils.setTextContent('attRate',    `${rate}%`);

    const tbody = document.getElementById('attTableBody');
    if (!tbody) return;

    if (!records.length) {
      tbody.innerHTML = `<tr class="empty-row"><td colspan="3">
        <div class="empty-state empty-state--sm"><i class="fa-regular fa-calendar-xmark"></i><p>Sem registros</p></div>
      </td></tr>`;
      return;
    }

    tbody.innerHTML = records.map(r => `
      <tr>
        <td>${utils.formatDate(r.date)}</td>
        <td>${utils.statusBadge(r.status)}</td>
        <td class="text-muted text-small">${r.lessonContent || r.notes || '—'}</td>
      </tr>`).join('');
  }

  async function loadFinanceTab(studentId) {
    const payments = await storage.getStudentPayments(studentId);
    const paid     = payments.filter(p => p.status === 'paid').reduce((s, p) => s + Number(p.amount), 0);
    const pending  = payments.filter(p => p.status !== 'paid').reduce((s, p) => s + Number(p.amount), 0);

    utils.setTextContent('finPaid',    utils.formatCurrency(paid));
    utils.setTextContent('finPending', utils.formatCurrency(pending));

    const tbody = document.getElementById('finTableBody');
    if (!tbody) return;

    if (!payments.length) {
      tbody.innerHTML = `<tr class="empty-row"><td colspan="4">
        <div class="empty-state empty-state--sm"><i class="fa-regular fa-credit-card"></i><p>Sem pagamentos</p></div>
      </td></tr>`;
      return;
    }

    tbody.innerHTML = payments.slice(0, 10).map(p => `
      <tr>
        <td>${utils.formatMonthYear(p.reference)}</td>
        <td>${utils.formatCurrency(p.amount)}</td>
        <td>${utils.statusBadge(p.status)}</td>
        <td class="text-small text-muted">${p.paidDate ? utils.formatDate(p.paidDate) : '—'}</td>
      </tr>`).join('');
  }

  /* ---------- Aba: Progresso ---------- */
  async function loadProgressTab(studentId) {
    const body = document.getElementById('tabProgressBody');
    if (!body) return;

    body.innerHTML = `<div class="empty-state empty-state--sm"><i class="fa-solid fa-rotate fa-spin"></i><p>Carregando...</p></div>`;

    try {
      const [modules, contents, records] = await Promise.all([
        storage.getProgressModules(),
        storage.getProgressContents(),
        storage.getStudentProgressRecords(studentId),
      ]);

      if (!modules.length) {
        body.innerHTML = `<div class="empty-state empty-state--sm">
          <i class="fa-solid fa-book-open"></i>
          <p>Nenhum conteúdo cadastrado no currículo.</p>
          <p style="font-size:.8rem;color:var(--text-muted);margin-top:4px">Acesse a página de Progresso para importar ou criar conteúdos.</p>
        </div>`;
        return;
      }

      function getLatest(contentId) {
        return records
          .filter(r => r.contentId === contentId)
          .sort((a, b) => b.date.localeCompare(a.date))[0] || null;
      }

      const STATUS_LABEL = { realizado: 'Realizado', dispensado: 'Dispensado', nao_realizado: 'Não Realizado' };
      const STATUS_COLOR = { realizado: 'var(--color-success)', dispensado: 'var(--color-info)', nao_realizado: 'var(--color-danger)' };

      const doneIds   = new Set(records.filter(r => r.status === 'realizado').map(r => r.contentId));
      const totalCont = contents.length;
      const pct       = totalCont ? Math.round((doneIds.size / totalCont) * 100) : 0;

      let html = `
        <div class="prog-bar-wrap" style="margin: 16px 0 6px 0"><div class="prog-bar-fill" style="width:${pct}%"></div></div>
        <div class="prog-bar-label" style="margin-bottom:14px">${doneIds.size} de ${totalCont} realizados · ${pct}%</div>`;

      modules.forEach(mod => {
        const items = contents.filter(c => c.moduleId === mod.id);
        if (!items.length) return;

        const doneInCat = items.filter(i => getLatest(i.id)?.status === 'realizado').length;

        html += `<div class="prog-module-section">
          <div class="prog-module-header">
            <span>${mod.name}</span>
            <span class="prog-module-count">${doneInCat}/${items.length}</span>
          </div>
          <div class="prog-module-items">`;

        items.forEach(item => {
          const latest = getLatest(item.id);
          const status = latest?.status || 'nao_registrado';
          const labelMap = { ...STATUS_LABEL, nao_registrado: '—' };
          const color    = STATUS_COLOR[status] || 'var(--text-muted)';
          const dot      = `<span style="width:8px;height:8px;border-radius:50%;background:${color};flex-shrink:0;display:inline-block"></span>`;
          html += `<div class="prog-item-row">
            <div class="prog-item-info">
              <span class="prog-item-title">${item.title}</span>
              ${latest?.date ? `<span class="prog-item-date">${utils.formatDate(latest.date)}${latest.notes ? ' · ' + latest.notes : ''}</span>` : ''}
            </div>
            <span style="display:flex;align-items:center;gap:5px;font-size:.75rem;font-weight:600;color:${color};white-space:nowrap">${dot} ${labelMap[status]}</span>
          </div>`;
        });

        html += `</div></div>`;
      });

      body.innerHTML = html;
    } catch (err) {
      body.innerHTML = `<div class="empty-state empty-state--sm"><i class="fa-solid fa-triangle-exclamation"></i><p>Erro ao carregar progresso.</p></div>`;
      console.error(err);
    }
  }

  /* ---------- Tabs ---------- */
  function activateTab(btnId, panelId) {
    document.querySelectorAll('#studentDetailModal .tab').forEach(t => {
      t.classList.remove('tab--active');
      t.setAttribute('aria-selected', 'false');
    });
    document.querySelectorAll('#studentDetailModal .tab-panel').forEach(p => { p.hidden = true; });
    const btn   = document.getElementById(btnId);
    const panel = document.getElementById(panelId);
    if (btn)   { btn.classList.add('tab--active'); btn.setAttribute('aria-selected', 'true'); }
    if (panel) { panel.hidden = false; }
  }

  document.getElementById('btnTabProfile')    ?.addEventListener('click', () => activateTab('btnTabProfile',    'tabProfile'));
  document.getElementById('btnTabAttendance') ?.addEventListener('click', () => {
    activateTab('btnTabAttendance', 'tabAttendance');
    if (currentId) loadAttendanceTab(currentId);
  });
  if (isAdmin) {
    document.getElementById('btnTabFinance')?.addEventListener('click', () => {
      activateTab('btnTabFinance', 'tabFinance');
      if (currentId) loadFinanceTab(currentId);
    });
  }
  document.getElementById('btnTabProgress')   ?.addEventListener('click', () => {
    activateTab('btnTabProgress', 'tabProgress');
    if (currentId) loadProgressTab(currentId);
  });

  /* ---------- Helper genérico de impressão ---------- */
  function _printReport({ title, student, bodyHTML, summaryHTML = '' }) {
    const today = new Date().toLocaleDateString('pt-BR', { day:'2-digit', month:'long', year:'numeric' });
    const esc   = utils.escapeHTML;

    const html = `<!DOCTYPE html><html lang="pt-BR"><head>
      <meta charset="utf-8">
      <title>${esc(title)} — ${esc(student.name)}</title>
      <style>
        @page { margin: 16mm; }
        body { font-family: 'Inter', system-ui, sans-serif; color: #1f2937; line-height: 1.5; }
        table { width:100%;border-collapse:collapse;font-size:.9rem }
        th, td { padding: 6px 8px; text-align: left; border-bottom: 1px solid #e5e7eb; }
        th { background:#f3f4f6;font-weight:600;font-size:.8rem;text-transform:uppercase;letter-spacing:.04em;color:#4b5563 }
        h1 { color: #032d6f; margin: 0 0 4px 0; }
        h3 { margin:0 0 8px 0;border-bottom:2px solid #032d6f;padding-bottom:4px }
        .header { border-bottom: 3px solid #032d6f; padding-bottom: 12px; margin-bottom: 16px; }
        .meta { display:flex;gap:24px;color:#4b5563;font-size:.9rem;flex-wrap:wrap }
        .summary { display:flex;gap:24px;margin:12px 0 20px;padding:12px 16px;background:#f9fafb;border-radius:8px;flex-wrap:wrap }
        .summary-item { display:flex;flex-direction:column;gap:2px }
        .summary-label { font-size:.75rem;color:#6b7280;text-transform:uppercase;letter-spacing:.04em }
        .summary-value { font-size:1.15rem;font-weight:700;color:#1f2937 }
        .badge { display:inline-block;padding:2px 8px;border-radius:4px;font-size:.78rem;font-weight:600 }
        .badge-present  { background:#dcfce7;color:#15803d }
        .badge-absent   { background:#fee2e2;color:#dc2626 }
        .badge-justified{ background:#dbeafe;color:#1d4ed8 }
        .badge-makeup   { background:#fef3c7;color:#b45309 }
        .badge-paid     { background:#dcfce7;color:#15803d }
        .badge-pending  { background:#fef3c7;color:#b45309 }
        .badge-overdue  { background:#fee2e2;color:#dc2626 }
        .badge-cancelled{ background:#e5e7eb;color:#4b5563 }
        .footer { margin-top:32px;padding-top:8px;border-top:1px solid #e5e7eb;font-size:.75rem;color:#9ca3af;text-align:center }
        @media print { .no-print { display:none } }
      </style>
    </head><body>
      <div class="header">
        <h1>${esc(title)}</h1>
        <div class="meta">
          <div><strong>Aluno:</strong> ${esc(student.name)}</div>
          <div><strong>Nível:</strong> ${esc(utils.formatLevel(student.level))}</div>
          <div><strong>Emitido em:</strong> ${today}</div>
        </div>
      </div>
      ${summaryHTML}
      ${bodyHTML}
      <div class="footer">Mr. Dave Idiomas — relatório gerado automaticamente</div>
      <script>setTimeout(() => window.print(), 250);<\/script>
    </body></html>`;

    const w = window.open('', '_blank');
    if (!w) {
      utils.showToast('Bloqueador de pop-ups impediu a impressão.', 'warning');
      return;
    }
    w.document.write(html);
    w.document.close();
  }

  /* ---------- Imprimir relatório de progresso ---------- */
  document.getElementById('printProgressBtn')?.addEventListener('click', async () => {
    if (!currentId) return;
    const s = findStudent(currentId);
    if (!s) return;

    try {
      const [modules, contents, records] = await Promise.all([
        storage.getProgressModules(),
        storage.getProgressContents(),
        storage.getStudentProgressRecords(currentId),
      ]);

      const STATUS_LABEL = { realizado: 'Realizado', dispensado: 'Dispensado', nao_realizado: 'Não realizado' };
      const STATUS_COLOR = { realizado: '#15803d', dispensado: '#0369a1', nao_realizado: '#dc2626' };
      const getLatest = id => records
        .filter(r => r.contentId === id)
        .sort((a, b) => b.date.localeCompare(a.date))[0] || null;

      const doneIds = new Set(records.filter(r => r.status === 'realizado').map(r => r.contentId));
      const pct = contents.length ? Math.round((doneIds.size / contents.length) * 100) : 0;

      const esc = utils.escapeHTML;

      const sectionsHTML = modules.map(mod => {
        const items = contents.filter(c => c.moduleId === mod.id);
        if (!items.length) return '';
        const doneInCat = items.filter(i => getLatest(i.id)?.status === 'realizado').length;
        const rows = items.map(item => {
          const latest = getLatest(item.id);
          const status = latest?.status || 'nao_registrado';
          const lbl    = STATUS_LABEL[status] || '—';
          const color  = STATUS_COLOR[status] || '#666';
          const date   = latest?.date ? utils.formatDate(latest.date) : '';
          const notes  = latest?.notes ? ` — ${esc(latest.notes)}` : '';
          return `<tr>
            <td>${esc(item.title)}</td>
            <td style="color:${color};font-weight:600;white-space:nowrap">${lbl}</td>
            <td style="color:#666;font-size:.85rem">${date}${notes}</td>
          </tr>`;
        }).join('');

        return `<section style="margin-top:20px;page-break-inside:avoid">
          <h3 style="display:flex;justify-content:space-between;align-items:baseline">
            <span>${esc(mod.name)}</span>
            <span style="font-size:.9rem;font-weight:400;color:#666">${doneInCat}/${items.length}</span>
          </h3>
          <table><tbody>${rows}</tbody></table>
        </section>`;
      }).join('');

      const summaryHTML = `
        <div class="summary">
          <div class="summary-item">
            <span class="summary-label">Realizados</span>
            <span class="summary-value">${doneIds.size} / ${contents.length}</span>
          </div>
          <div class="summary-item">
            <span class="summary-label">Conclusão</span>
            <span class="summary-value">${pct}%</span>
          </div>
        </div>
        <div style="background:#e5e7eb;height:10px;border-radius:5px;overflow:hidden;margin:0 0 20px">
          <div style="background:#032d6f;height:100%;width:${pct}%"></div>
        </div>`;

      _printReport({
        title: 'Relatório de Progresso',
        student: s,
        summaryHTML,
        bodyHTML: sectionsHTML || '<p style="color:#666">Nenhum conteúdo cadastrado no currículo.</p>',
      });
    } catch (err) {
      console.error(err);
      utils.showToast('Erro ao gerar relatório.', 'error');
    }
  });

  /* ---------- Imprimir relatório de frequência ---------- */
  document.getElementById('printAttendanceBtn')?.addEventListener('click', async () => {
    if (!currentId) return;
    const s = findStudent(currentId);
    if (!s) return;

    try {
      const records = await storage.getStudentAttendance(currentId);
      const esc     = utils.escapeHTML;

      const present   = records.filter(r => r.status === 'present').length;
      const absent    = records.filter(r => r.status === 'absent').length;
      const justified = records.filter(r => r.status === 'justified').length;
      const makeup    = records.filter(r => r.status === 'makeup').length;
      const rate      = records.length ? Math.round((present / records.length) * 100) : 0;

      const STATUS_BADGE = {
        present:   '<span class="badge badge-present">Presente</span>',
        absent:    '<span class="badge badge-absent">Ausente</span>',
        justified: '<span class="badge badge-justified">Justificada</span>',
        makeup:    '<span class="badge badge-makeup">Reposição</span>',
      };

      const summaryHTML = `
        <div class="summary">
          <div class="summary-item"><span class="summary-label">Presenças</span><span class="summary-value" style="color:#15803d">${present}</span></div>
          <div class="summary-item"><span class="summary-label">Faltas</span><span class="summary-value" style="color:#dc2626">${absent}</span></div>
          <div class="summary-item"><span class="summary-label">Justificadas</span><span class="summary-value" style="color:#1d4ed8">${justified}</span></div>
          <div class="summary-item"><span class="summary-label">Reposições</span><span class="summary-value" style="color:#b45309">${makeup}</span></div>
          <div class="summary-item"><span class="summary-label">Frequência</span><span class="summary-value">${rate}%</span></div>
        </div>`;

      const bodyHTML = !records.length
        ? '<p style="color:#666">Nenhum registro de frequência.</p>'
        : `<table>
            <thead>
              <tr><th>Data</th><th>Status</th><th>Conteúdo / Observação</th></tr>
            </thead>
            <tbody>
              ${records.map(r => `
                <tr>
                  <td style="white-space:nowrap">${utils.formatDate(r.date)}</td>
                  <td>${STATUS_BADGE[r.status] || esc(r.status)}</td>
                  <td style="color:#4b5563">${esc(r.lessonContent || r.notes || '')}</td>
                </tr>`).join('')}
            </tbody>
          </table>`;

      _printReport({
        title: 'Relatório de Frequência',
        student: s,
        summaryHTML,
        bodyHTML,
      });
    } catch (err) {
      console.error(err);
      utils.showToast('Erro ao gerar relatório.', 'error');
    }
  });

  /* ---------- Imprimir relatório financeiro do aluno (admin only) ---------- */
  document.getElementById('printFinanceBtn')?.addEventListener('click', async () => {
    if (!currentId || !isAdmin) return;
    const s = findStudent(currentId);
    if (!s) return;

    try {
      const payments = await storage.getStudentPayments(currentId);
      const esc      = utils.escapeHTML;

      const STATUS_BADGE = {
        paid:      '<span class="badge badge-paid">Pago</span>',
        pending:   '<span class="badge badge-pending">Pendente</span>',
        overdue:   '<span class="badge badge-overdue">Em atraso</span>',
        cancelled: '<span class="badge badge-cancelled">Cancelado</span>',
      };

      const bodyHTML = !payments.length
        ? '<p style="color:#666">Nenhum pagamento registrado.</p>'
        : `<table>
            <thead>
              <tr>
                <th>Referência</th>
                <th>Valor</th>
                <th>Vencimento</th>
                <th>Status</th>
                <th>Pago em</th>
                <th>Método</th>
              </tr>
            </thead>
            <tbody>
              ${payments.map(p => `
                <tr>
                  <td style="white-space:nowrap">${esc(utils.formatMonthYear(p.reference))}</td>
                  <td style="white-space:nowrap;font-weight:600">${utils.formatCurrency(p.amount)}</td>
                  <td style="white-space:nowrap;color:#4b5563">${p.dueDate ? utils.formatDate(p.dueDate) : '—'}</td>
                  <td>${STATUS_BADGE[p.status] || esc(p.status)}</td>
                  <td style="white-space:nowrap;color:#4b5563">${p.paidDate ? utils.formatDate(p.paidDate) : '—'}</td>
                  <td style="color:#4b5563">${esc(utils.formatMethod(p.method))}</td>
                </tr>`).join('')}
            </tbody>
          </table>`;

      _printReport({
        title: 'Relatório Financeiro',
        student: s,
        bodyHTML,
      });
    } catch (err) {
      console.error(err);
      utils.showToast('Erro ao gerar relatório.', 'error');
    }
  });

  /* ---------- Editar / Excluir ---------- */
  document.getElementById('editStudentBtn')?.addEventListener('click', () => {
    modals.close('studentDetailOverlay');
    openForm(findStudent(currentId));
  });

  document.getElementById('deleteStudentBtn')?.addEventListener('click', () => {
    pendingDeleteId = currentId;
    const s = findStudent(currentId);
    document.getElementById('deleteConfirmDesc').textContent =
      `Tem certeza que deseja excluir "${s?.name}"? Todos os registros de frequência e pagamentos deste aluno também serão removidos. Esta ação não pode ser desfeita.`;
    modals.open('deleteConfirmOverlay');
  });

  document.getElementById('deleteConfirm')?.addEventListener('click', async () => {
    if (!pendingDeleteId) return;
    try {
      await storage.deleteStudent(pendingDeleteId);
      modals.close('deleteConfirmOverlay');
      modals.close('studentDetailOverlay');
      utils.showToast('Aluno excluído.', 'warning');
      pendingDeleteId = null;
      await load();
    } catch (err) {
      utils.showToast('Erro ao excluir aluno.', 'error');
      console.error(err);
    }
  });

  document.getElementById('deleteCancel')?.addEventListener('click', () => {
    modals.close('deleteConfirmOverlay');
    pendingDeleteId = null;
  });

  /* ====== Init ====== */
  await load();
});
