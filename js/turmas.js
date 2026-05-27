/* ==========================================================================
   TURMAS.JS — Gestão de turmas (Supabase async)
   ========================================================================== */

document.addEventListener('DOMContentLoaded', async () => {

  const { utils, storage, modals } = HT;

  /* ====== Cache local ====== */
  let allClasses         = [];
  let allStudents        = [];
  let currentId          = null;
  let pendingDeleteId    = null;
  let selectedStudentIds = [];

  /* ====== Helpers de busca no cache ====== */
  function findClass(id)   { return allClasses.find(c => c.id === id) || null; }
  function findStudent(id) { return allStudents.find(s => s.id === id) || null; }

  /* ====== Referências DOM ====== */
  const grid        = document.getElementById('classesGrid');
  const searchInput = document.getElementById('classSearch');
  const filterDay   = document.getElementById('filterDay');
  const countEl     = document.getElementById('classesCount');

  /* ====== Carregar ====== */
  async function load() {
    [allClasses, allStudents] = await Promise.all([
      storage.getClasses(),
      storage.getStudents(),
    ]);
    render();
  }

  function getFiltered() {
    const q   = (searchInput?.value || '').toLowerCase();
    const day = filterDay?.value || '';

    return allClasses.filter(c => {
      if (q   && !c.name.toLowerCase().includes(q)) return false;
      if (day && !(c.schedules || []).some(s => s.day === day)) return false;
      return true;
    });
  }

  function render() {
    const list = getFiltered();
    if (countEl) countEl.textContent = `${list.length} turma${list.length !== 1 ? 's' : ''}`;

    const empty = `
      <div class="empty-state">
        <i class="fa-solid fa-users-slash empty-state-icon"></i>
        <p class="empty-state-title">Nenhuma turma encontrada</p>
        <p class="empty-state-desc">${allClasses.length ? 'Tente ajustar os filtros' : 'Clique em "Nova Turma" para começar'}</p>
        ${!allClasses.length ? '<button class="btn btn--primary" id="addFirstClassBtn"><i class="fa-solid fa-plus"></i> Criar Turma</button>' : ''}
      </div>`;

    if (grid) grid.innerHTML = list.length ? list.map(buildCard).join('') : empty;

    grid?.querySelectorAll('.class-card').forEach(card => {
      card.addEventListener('click', () => openDetail(card.dataset.id));
    });
    document.getElementById('addFirstClassBtn')?.addEventListener('click', () => openForm());
  }

  function buildCard(cls) {
    const students  = allStudents.filter(s => s.classId === cls.id);
    const schedText = (cls.schedules || [])
      .map(s => `${utils.formatDayShort(s.day)} ${s.time}`)
      .join(' · ') || '—';

    const avatars = students.slice(0, 3).map(s =>
      `<div class="student-avatar-sm" title="${s.name}">${utils.getInitials(s.name)}</div>`
    ).join('');
    const extra = students.length > 3
      ? `<div class="student-avatar-sm student-avatar-sm--more">+${students.length - 3}</div>` : '';

    return `
      <div class="class-card" data-id="${cls.id}" role="button" tabindex="0" aria-label="Ver turma ${cls.name}">
        <div class="class-card-header">
          <div class="class-card-icon"><i class="fa-solid fa-users"></i></div>
          <div class="class-card-titles">
            <div class="class-card-name">${cls.name}</div>
            <div class="class-card-level">${utils.formatLevel(cls.level)}</div>
          </div>
        </div>
        <div class="class-card-body">
          <div class="class-card-schedule">
            <i class="fa-regular fa-calendar"></i>${schedText}
          </div>
          <div class="class-card-students">
            <div class="student-avatars">${avatars}${extra}</div>
            <span class="student-count-text">${students.length} aluno${students.length !== 1 ? 's' : ''}</span>
          </div>
        </div>
      </div>`;
  }

  /* ====== Filtros ====== */
  searchInput?.addEventListener('input',  utils.debounce(render, 250));
  filterDay?.addEventListener('change',   render);

  /* ====== Modal de Formulário ====== */
  function openForm(cls = null) {
    const form = document.getElementById('classForm');
    if (!form) return;
    form.reset();
    selectedStudentIds = [];

    document.getElementById('classId').value = cls?.id || '';
    document.getElementById('classModalTitle').textContent = cls ? 'Editar Turma' : 'Nova Turma';

    if (cls) {
      utils.setInputValue('className',  cls.name);
      utils.setInputValue('classLevel', cls.level);
      utils.setInputValue('classNotes', cls.notes);
      selectedStudentIds = [...(cls.studentIds || [])];
      rebuildSchedules(cls.schedules || []);
    } else {
      rebuildSchedules([{}]);
    }

    renderStudentSelector();
    renderSelectedStudents();

    modals.open('classModalOverlay');
  }

  /* ---------- Horários dinâmicos ---------- */
  function rebuildSchedules(schedules) {
    const container = document.getElementById('classSchedules');
    if (!container) return;
    container.innerHTML = '';
    (schedules.length ? schedules : [{}]).forEach((s, i) => addScheduleEntry(i, s));
  }

  function addScheduleEntry(index, data = {}) {
    const container = document.getElementById('classSchedules');
    if (!container) return;
    const entry = document.createElement('div');
    entry.className = 'schedule-entry';
    entry.dataset.index = index;
    entry.innerHTML = `
      <div class="form-row form-row--3">
        <div class="form-group">
          <label class="form-label">Dia</label>
          <select name="schedules[${index}][day]" class="form-select">
            <option value="">Selecione</option>
            ${['monday','tuesday','wednesday','thursday','friday','saturday','sunday'].map(d =>
              `<option value="${d}"${d===data.day?' selected':''}>${utils.formatDay(d)}</option>`
            ).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Horário</label>
          <input type="time" name="schedules[${index}][time]" class="form-input" value="${data.time||''}"/>
        </div>
        <div class="form-group">
          <label class="form-label">Duração (min)</label>
          <input type="number" name="schedules[${index}][duration]" class="form-input" value="${data.duration||60}" min="15" max="240" step="15"/>
        </div>
      </div>
      ${index > 0 ? '<button type="button" class="btn btn--ghost btn--sm remove-schedule-btn" style="margin-top:6px"><i class="fa-solid fa-trash"></i> Remover</button>' : ''}`;

    entry.querySelector('.remove-schedule-btn')?.addEventListener('click', () => entry.remove());
    container.appendChild(entry);
  }

  document.getElementById('addScheduleBtn')?.addEventListener('click', () => {
    const count = document.querySelectorAll('.schedule-entry').length;
    addScheduleEntry(count);
  });

  /* ---------- Seletor de alunos ---------- */
  function renderStudentSelector() {
    const list = document.getElementById('studentSelectorList');
    if (!list) return;
    const q       = (document.getElementById('studentSelectorSearch')?.value || '').toLowerCase();
    const students = allStudents
      .filter(s => !selectedStudentIds.includes(s.id))
      .filter(s => !q || s.name.toLowerCase().includes(q));

    list.innerHTML = !students.length
      ? '<div class="empty-state empty-state--sm"><p>Nenhum aluno disponível</p></div>'
      : students.map(s => `
          <div class="selector-student-item" data-id="${s.id}">
            <div class="class-student-item-avatar">${utils.getInitials(s.name)}</div>
            <div class="selector-student-item-info">
              <div class="selector-student-item-name">${s.name}</div>
              <div class="selector-student-item-level">${utils.formatLevel(s.level)}</div>
            </div>
            <i class="fa-solid fa-plus" style="color:var(--color-primary);font-size:.8rem"></i>
          </div>`).join('');

    list.querySelectorAll('.selector-student-item').forEach(item => {
      item.addEventListener('click', () => {
        selectedStudentIds.push(item.dataset.id);
        renderStudentSelector();
        renderSelectedStudents();
      });
    });
  }

  document.getElementById('studentSelectorSearch')
    ?.addEventListener('input', utils.debounce(renderStudentSelector, 200));

  function renderSelectedStudents() {
    const container = document.getElementById('selectedStudentsList');
    if (!container) return;
    container.innerHTML = selectedStudentIds.map(id => {
      const s = findStudent(id);
      return s ? `
        <div class="selected-student-chip" data-id="${id}">
          ${s.name}
          <button type="button" aria-label="Remover ${s.name}"><i class="fa-solid fa-xmark"></i></button>
        </div>` : '';
    }).join('');

    container.querySelectorAll('.selected-student-chip button').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.closest('[data-id]').dataset.id;
        selectedStudentIds = selectedStudentIds.filter(sid => sid !== id);
        renderStudentSelector();
        renderSelectedStudents();
      });
    });
  }

  /* ---------- Salvar ---------- */
  document.getElementById('classForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const nameErr = document.getElementById('classNameError');
    nameErr.textContent = '';
    const name = utils.getInputValue('className');
    if (!name) { nameErr.textContent = 'Informe o nome da turma.'; return; }

    // Coletar horários
    const schedules = [];
    document.querySelectorAll('.schedule-entry').forEach(entry => {
      const day      = entry.querySelector('[name*="[day]"]')?.value;
      const time     = entry.querySelector('[name*="[time]"]')?.value;
      const duration = Number(entry.querySelector('[name*="[duration]"]')?.value) || 60;
      if (day && time) schedules.push({ day, time, duration });
    });

    const id      = document.getElementById('classId').value;
    const saveBtn = document.getElementById('classModalSave');
    if (saveBtn) saveBtn.classList.add('is-loading');

    try {
      /* saveClass já sincroniza students.class_id — não precisa fazer manualmente */
      await storage.saveClass({
        id:         id || undefined,
        name,
        level:      utils.getInputValue('classLevel'),
        schedules,
        studentIds: selectedStudentIds,
        notes:      utils.getInputValue('classNotes'),
      });

      modals.close('classModalOverlay');
      utils.showToast(id ? 'Turma atualizada!' : 'Turma criada!', 'success');
      await load();
    } catch (err) {
      utils.showToast('Erro ao salvar turma. Tente novamente.', 'error');
      console.error(err);
    } finally {
      if (saveBtn) saveBtn.classList.remove('is-loading');
    }
  });

  document.getElementById('classModalCancel')?.addEventListener('click', () => modals.close('classModalOverlay'));

  /* ====== Modal de Detalhe ====== */
  function openDetail(id) {
    const cls = findClass(id);
    if (!cls) return;
    currentId = id;

    document.getElementById('detailClassName').textContent  = cls.name;
    document.getElementById('detailClassLevel').textContent = utils.formatLevel(cls.level);

    // Horários
    const chipContainer = document.getElementById('classScheduleDetail');
    if (chipContainer) {
      chipContainer.innerHTML = (cls.schedules || []).map(s => `
        <div class="schedule-chip">
          <i class="fa-regular fa-calendar"></i>
          ${utils.formatDay(s.day)} · ${s.time} · ${s.duration || 60} min
        </div>`).join('') || '<span class="text-muted">—</span>';
    }

    // Alunos da turma
    const students = allStudents.filter(s => s.classId === cls.id);
    utils.setTextContent('classStudentCount', students.length);
    const studListEl = document.getElementById('classStudentsList');
    if (studListEl) {
      studListEl.innerHTML = !students.length
        ? '<div class="empty-state empty-state--sm"><p>Nenhum aluno nesta turma</p></div>'
        : students.map(s => `
            <div class="class-student-item">
              <div class="class-student-item-avatar">${utils.getInitials(s.name)}</div>
              <div class="class-student-item-name">${s.name}</div>
              <div class="class-student-item-level">${utils.formatLevel(s.level)}</div>
            </div>`).join('');
    }

    utils.setTextContent('classNotesDetail', cls.notes || '—');
    modals.open('classDetailOverlay');
  }

  document.getElementById('editClassBtn')?.addEventListener('click', () => {
    modals.close('classDetailOverlay');
    openForm(findClass(currentId));
  });

  document.getElementById('deleteClassBtn')?.addEventListener('click', () => {
    pendingDeleteId = currentId;
    const cls = findClass(currentId);
    document.getElementById('deleteConfirmDesc').textContent =
      `Excluir a turma "${cls?.name}"? Os alunos não serão excluídos.`;
    modals.open('deleteConfirmOverlay');
  });

  document.getElementById('deleteConfirm')?.addEventListener('click', async () => {
    if (!pendingDeleteId) return;
    try {
      await storage.deleteClass(pendingDeleteId);
      modals.close('deleteConfirmOverlay');
      modals.close('classDetailOverlay');
      utils.showToast('Turma excluída.', 'warning');
      pendingDeleteId = null;
      await load();
    } catch (err) {
      utils.showToast('Erro ao excluir turma.', 'error');
      console.error(err);
    }
  });

  document.getElementById('deleteCancel')?.addEventListener('click', () => {
    modals.close('deleteConfirmOverlay');
    pendingDeleteId = null;
  });

  /* ====== Bind botão principal ====== */
  document.getElementById('addClassBtn')?.addEventListener('click', () => openForm());

  /* ====== Init ====== */
  await load();
});
