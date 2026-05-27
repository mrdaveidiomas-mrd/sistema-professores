/* ==========================================================================
   PROFESSORES.JS — CRUD de professores (admin only)
   ========================================================================== */

window.HT = window.HT || {};

HT.professores = (() => {

  const grid       = () => document.getElementById('teachersGrid');
  const empty      = () => document.getElementById('emptyTeachers');
  const countEl    = () => document.getElementById('teachersCount');
  const searchInp  = () => document.getElementById('teacherSearch');

  const overlay    = () => document.getElementById('teacherModalOverlay');
  const form       = () => document.getElementById('teacherForm');
  const titleEl    = () => document.getElementById('teacherModalTitle');
  const idInp      = () => document.getElementById('teacherId');
  const nameInp    = () => document.getElementById('teacherName');
  const emailInp   = () => document.getElementById('teacherEmail');
  const phoneInp   = () => document.getElementById('teacherPhone');
  const subjInp    = () => document.getElementById('teacherSubject');
  const rateInp    = () => document.getElementById('teacherRate');
  const activeInp  = () => document.getElementById('teacherActive');
  const statusFs   = () => document.getElementById('teacherStatusFieldset');
  const assignFs   = () => document.getElementById('teacherAssignFieldset');
  const classesFs  = () => document.getElementById('teacherClassesFieldset');
  const studentsList = () => document.getElementById('teacherStudentsList');
  const classesList  = () => document.getElementById('teacherClassesList');
  const saveBtn    = () => document.getElementById('saveTeacherBtn');
  const saveBtnTxt = () => document.getElementById('saveTeacherBtnText');
  const delBtn     = () => document.getElementById('deleteTeacherBtn');
  const alertBox   = () => document.getElementById('teacherAlert');
  const emailErr   = () => document.getElementById('teacherEmailError');
  const nameErr    = () => document.getElementById('teacherNameError');

  let teachers = [];
  let allStudents = [];   /* cache para o seletor de alunos */
  let allClasses  = [];   /* cache para o seletor de turmas */

  /* ---------- Render ---------- */
  function render(list) {
    const g = grid();

    /* Desanexa #emptyTeachers ANTES de qualquer innerHTML para evitar que seja
       destruído pelo parser — o elemento continua vivo em memória via referência. */
    const e = empty();
    if (e && e.parentNode) e.parentNode.removeChild(e);

    if (!list.length) {
      g.innerHTML = '';
      if (e) {
        e.style.display = '';
        g.appendChild(e);
      }
      countEl().textContent = '';
      return;
    }

    countEl().textContent = `${list.length} professor${list.length > 1 ? 'es' : ''}`;
    g.innerHTML = list.map(t => `
      <article class="teacher-card" data-id="${t.id}" role="button" tabindex="0"
               aria-label="Editar professor ${escapeHTML(t.name || t.email)}">
        <div class="teacher-card-header">
          <div class="teacher-card-avatar">${initials(t.name || t.email)}</div>
          <div class="teacher-card-info">
            <div class="teacher-card-name">${escapeHTML(t.name || '(sem nome)')}</div>
            <div class="teacher-card-email">${escapeHTML(t.email)}</div>
          </div>
        </div>
        <div class="teacher-card-meta">
          ${t.subject    ? `<div class="teacher-card-meta-item"><i class="fa-solid fa-book"></i>${escapeHTML(t.subject)}</div>` : ''}
          ${t.defaultRate != null ? `<div class="teacher-card-meta-item"><i class="fa-solid fa-dollar-sign"></i>R$ ${formatBR(t.defaultRate)}/aula</div>` : ''}
          ${t.phone      ? `<div class="teacher-card-meta-item"><i class="fa-solid fa-phone"></i>${escapeHTML(t.phone)}</div>` : ''}
        </div>
        <div class="teacher-card-footer">
          <span class="badge ${t.active ? 'badge--active' : 'badge--inactive'}">
            ${t.active ? 'Ativo' : 'Inativo'}
          </span>
          <span style="font-size:.8rem;color:var(--text-secondary)">
            <i class="fa-solid fa-pen-to-square"></i> Editar
          </span>
        </div>
      </article>
    `).join('');

    /* Reanexar #emptyTeachers oculto — mantém no DOM para que getElementById
       continue a encontrá-lo nas próximas chamadas. */
    if (e) {
      e.style.display = 'none';
      g.appendChild(e);
    }

    g.querySelectorAll('.teacher-card[data-id]').forEach(c => {
      c.addEventListener('click', () => openEdit(c.dataset.id));
      c.addEventListener('keydown', ev => { if (ev.key === 'Enter' || ev.key === ' ') openEdit(c.dataset.id); });
    });
  }

  function initials(s) {
    return (s || '?').trim().split(/\s+/).slice(0,2).map(p => p[0]).join('').toUpperCase();
  }
  const escapeHTML = s => HT.utils.escapeHTML(s);
  function formatBR(n) { return Number(n).toFixed(2).replace('.', ','); }

  function applyFilter() {
    const q = (searchInp().value || '').toLowerCase().trim();
    if (!q) return render(teachers);
    render(teachers.filter(t =>
      (t.name || '').toLowerCase().includes(q) ||
      (t.email || '').toLowerCase().includes(q)
    ));
  }

  /* ---------- Modal ---------- */
  function openInvite() {
    titleEl().textContent = 'Convidar Professor';
    saveBtnTxt().textContent = 'Enviar Convite';
    saveBtn().querySelector('i').className = 'fa-solid fa-paper-plane';
    delBtn().style.display = 'none';
    statusFs().style.display = 'none';
    assignFs().style.display = 'none';
    classesFs().style.display = 'none';
    emailInp().disabled = false;
    form().reset();
    idInp().value = '';
    clearAlerts();
    showModal(true);
  }

  async function openEdit(id) {
    const t = teachers.find(x => x.id === id);
    if (!t) return;
    titleEl().textContent = 'Editar Professor';
    saveBtnTxt().textContent = 'Salvar';
    saveBtn().querySelector('i').className = 'fa-solid fa-floppy-disk';
    delBtn().style.display = '';
    statusFs().style.display = '';
    assignFs().style.display = '';
    classesFs().style.display = '';
    emailInp().disabled = true;
    idInp().value = t.id;
    nameInp().value = t.name || '';
    emailInp().value = t.email || '';
    phoneInp().value = t.phone || '';
    subjInp().value  = t.subject || '';
    rateInp().value  = t.defaultRate ?? '';
    activeInp().checked = !!t.active;
    clearAlerts();
    showModal(true);

    /* carrega alunos/turmas e marca os atribuídos a esse professor */
    try {
      const [students, classes, assignedStudents, assignedClasses] = await Promise.all([
        HT.storage.getStudents(),
        HT.storage.getClasses(),
        HT.storage.getTeacherStudents(t.id),
        HT.storage.getTeacherClasses(t.id),
      ]);
      allStudents = students;
      allClasses  = classes;
      renderStudentsPicker(assignedStudents);
      renderClassesPicker(assignedClasses.map(c => c.id));
    } catch (err) {
      console.error('Erro ao carregar atribuições:', err);
    }
  }

  function renderStudentsPicker(assigned /* [{studentId, rateOverride}] */) {
    const map = {};
    assigned.forEach(a => { map[a.studentId] = a.rateOverride; });

    if (!allStudents.length) {
      studentsList().innerHTML = '<p style="opacity:.6">Nenhum aluno cadastrado ainda.</p>';
      return;
    }
    studentsList().innerHTML = allStudents.map(s => {
      const checked = map.hasOwnProperty(s.id);
      const rate    = map[s.id] ?? '';
      return `
        <div class="schedule-entry" data-student-id="${s.id}" style="display:flex;gap:10px;align-items:center;padding:8px">
          <label class="checkbox-label" style="flex:1">
            <input type="checkbox" class="checkbox-input ts-check" ${checked ? 'checked' : ''} />
            <span class="checkbox-custom"></span>
            <span>${escapeHTML(s.name)}</span>
          </label>
          <input type="number" class="form-input ts-rate" placeholder="R$ aula"
                 min="0" step="0.01" value="${rate}" style="max-width:120px"
                 ${checked ? '' : 'disabled'} />
        </div>`;
    }).join('');

    studentsList().querySelectorAll('.ts-check').forEach(chk => {
      chk.addEventListener('change', e => {
        const rateInput = e.target.closest('.schedule-entry').querySelector('.ts-rate');
        rateInput.disabled = !e.target.checked;
        if (!e.target.checked) rateInput.value = '';
      });
    });
  }

  function renderClassesPicker(assignedIds /* [classId] */) {
    if (!allClasses.length) {
      classesList().innerHTML = '<p style="opacity:.6">Nenhuma turma cadastrada ainda.</p>';
      return;
    }
    classesList().innerHTML = allClasses.map(c => `
      <label class="checkbox-label" style="display:flex;align-items:center;gap:8px;padding:6px 0">
        <input type="checkbox" class="checkbox-input tc-check" data-class-id="${c.id}" ${assignedIds.includes(c.id) ? 'checked' : ''} />
        <span class="checkbox-custom"></span>
        <span>${escapeHTML(c.name)}</span>
      </label>
    `).join('');
  }

  function readStudentsPicker() {
    return Array.from(studentsList().querySelectorAll('.schedule-entry'))
      .filter(row => row.querySelector('.ts-check').checked)
      .map(row => ({
        studentId:    row.dataset.studentId,
        rateOverride: row.querySelector('.ts-rate').value
                        ? Number(row.querySelector('.ts-rate').value) : null,
      }));
  }

  function readClassesPicker() {
    return Array.from(classesList().querySelectorAll('.tc-check'))
      .filter(c => c.checked).map(c => c.dataset.classId);
  }

  function showModal(open) {
    if (open) HT.modals.open('teacherModalOverlay');
    else      HT.modals.close('teacherModalOverlay');
  }

  function clearAlerts() {
    alertBox().textContent = '';
    alertBox().className = 'login-alert';
    emailErr().textContent = '';
    nameErr().textContent = '';
  }

  function setAlert(msg, type='error') {
    alertBox().textContent = msg;
    alertBox().className = `login-alert ${type}`;
  }

  /* ---------- Submit ---------- */
  async function onSubmit(e) {
    e.preventDefault();
    clearAlerts();

    const id     = idInp().value.trim();
    const name   = nameInp().value.trim();
    const email  = emailInp().value.trim();
    const phone  = phoneInp().value.trim();
    const subject = subjInp().value.trim();
    const rate   = rateInp().value ? Number(rateInp().value) : null;
    const active = activeInp().checked;

    let valid = true;
    if (!name)  { nameErr().textContent  = 'Informe o nome.'; valid = false; }
    if (!email) { emailErr().textContent = 'Informe o e-mail.'; valid = false; }
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      emailErr().textContent = 'E-mail inválido.'; valid = false;
    }
    if (!valid) return;

    saveBtn().classList.add('is-loading');
    try {
      if (id) {
        await HT.storage.updateTeacher(id, { name, phone, subject, defaultRate: rate, active });
        await HT.storage.setTeacherStudents(id, readStudentsPicker());
        await HT.storage.setTeacherClasses(id, readClassesPicker());
        setAlert('Professor atualizado.', 'success');
      } else {
        await HT.storage.inviteTeacher({ email, name, defaultRate: rate });
        setAlert('Convite enviado! O professor receberá um e-mail com o link de acesso.', 'success');
      }
      await load();
      setTimeout(() => showModal(false), 900);
    } catch (err) {
      console.error(err);
      setAlert(err.message || 'Erro ao salvar professor.');
    } finally {
      saveBtn().classList.remove('is-loading');
    }
  }

  async function onDelete() {
    const id = idInp().value;
    if (!id) return;
    const ok = await HT.modals.confirm(
      'Excluir este professor? Os vínculos com alunos serão removidos. A conta de login só será removida pelo painel do Supabase.',
      { okLabel: 'Excluir' }
    );
    if (!ok) return;
    try {
      await HT.storage.deleteTeacher(id);
      await load();
      showModal(false);
    } catch (err) {
      setAlert(err.message || 'Erro ao excluir.');
    }
  }

  /* ---------- Load ---------- */
  async function load() {
    try {
      teachers = await HT.storage.getTeachers();
      applyFilter();
    } catch (err) {
      console.error(err);
      grid().innerHTML = `<div class="empty-state"><p>Erro ao carregar professores: ${escapeHTML(err.message)}</p></div>`;
    }
  }

  /* ---------- Init ---------- */
  function init() {
    if (!grid()) return;

    document.getElementById('addTeacherBtn')?.addEventListener('click', openInvite);
    document.getElementById('addFirstTeacherBtn')?.addEventListener('click', openInvite);
    document.getElementById('teacherModalClose')?.addEventListener('click', () => showModal(false));
    document.getElementById('teacherModalCancel')?.addEventListener('click', () => showModal(false));
    overlay()?.addEventListener('click', (e) => { if (e.target === overlay()) showModal(false); });
    form()?.addEventListener('submit', onSubmit);
    delBtn()?.addEventListener('click', onDelete);
    searchInp()?.addEventListener('input', applyFilter);

    load();
  }

  document.addEventListener('DOMContentLoaded', init);

  return { init, load };
})();
