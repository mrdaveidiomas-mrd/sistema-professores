/* ==========================================================================
   FREQUENCIA.JS — Controle de frequência (Supabase async)
   ========================================================================== */

document.addEventListener('DOMContentLoaded', async () => {

  const { utils, storage, modals } = HT;

  /* ====== Cache local ====== */
  let allAttendance  = [];
  let allStudents    = [];
  let allClasses     = [];
  let allProgMods    = [];
  let allProgConts   = [];

  /* ====== Helpers de busca no cache ====== */
  function findStudent(id) { return allStudents.find(s => s.id === id) || null; }
  function findClass(id)   { return allClasses.find(c => c.id === id) || null; }

  /* ====== Estado ====== */
  const PAGE_SIZE       = 15;
  let   currentPage     = 1;
  let   sortField       = 'date';
  let   sortDir         = 'desc';
  let   pendingDeleteId = null;

  /* ====== Refs ====== */
  const searchInput     = document.getElementById('attStudentSearch');
  const dateFrom        = document.getElementById('attDateFrom');
  const dateTo          = document.getElementById('attDateTo');
  const classFilter     = document.getElementById('attClassFilter');
  const statusFilter    = document.getElementById('attStatusFilter');
  const clearFiltersBtn = document.getElementById('clearFiltersBtn');
  const tbody           = document.getElementById('attendanceTableBody');

  /* ====== Carregar todos os dados ====== */
  async function load() {
    [allAttendance, allStudents, allClasses, allProgMods, allProgConts] = await Promise.all([
      storage.getAttendance(),
      storage.getStudents(),
      storage.getClasses(),
      storage.getProgressModules(),
      storage.getProgressContents(),
    ]);
  }

  /* ====== Init ====== */
  async function init() {
    await load();
    populateClassFilter();
    setDefaultDates();
    loadStats();
    render();
  }

  function setDefaultDates() {
    const now = new Date();
    const y = now.getFullYear(), m = now.getMonth();
    if (dateFrom) dateFrom.value = `${y}-${String(m+1).padStart(2,'0')}-01`;
    if (dateTo)   dateTo.value   = utils.getCurrentDate();
  }

  function populateClassFilter() {
    if (!classFilter) return;
    classFilter.innerHTML = '<option value="">Todas as turmas</option>'
      + allClasses.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  }

  /* ====== Stats ====== */
  function loadStats() {
    const month   = utils.getCurrentMonth();
    const records = allAttendance.filter(r => r.date.startsWith(month));
    const present = records.filter(r => r.status === 'present').length;
    const absent  = records.filter(r => r.status !== 'present').length;
    const rate    = records.length ? Math.round((present / records.length) * 100) : 0;

    utils.setTextContent('statMonthLessons', records.length);
    utils.setTextContent('statMonthPresent', present);
    utils.setTextContent('statMonthAbsent',  absent);
    utils.setTextContent('statMonthRate',    `${rate}%`);
  }

  /* ====== Filtro e Ordenação ====== */
  function getFiltered() {
    const q      = (searchInput?.value || '').toLowerCase();
    const from   = dateFrom?.value || '';
    const to     = dateTo?.value   || '';
    const cls    = classFilter?.value  || '';
    const status = statusFilter?.value || '';

    return allAttendance.filter(r => {
      if (from   && r.date < from) return false;
      if (to     && r.date > to)   return false;
      if (status && r.status !== status) return false;
      if (cls    && r.classId !== cls)   return false;
      if (q) {
        const s = findStudent(r.studentId);
        if (!s || !s.name.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }

  function getSorted(list) {
    return [...list].sort((a, b) => {
      let va, vb;
      if (sortField === 'date') {
        va = a.date; vb = b.date;
      } else if (sortField === 'student') {
        va = findStudent(a.studentId)?.name || '';
        vb = findStudent(b.studentId)?.name || '';
      } else if (sortField === 'status') {
        va = a.status; vb = b.status;
      } else {
        va = a[sortField] || ''; vb = b[sortField] || '';
      }
      const cmp = va < vb ? -1 : va > vb ? 1 : 0;
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }

  /* ====== Render tabela ====== */
  function render() {
    const filtered = getFiltered();
    const sorted   = getSorted(filtered);
    const total    = sorted.length;
    const pages    = Math.ceil(total / PAGE_SIZE) || 1;
    currentPage    = Math.min(currentPage, pages);

    const page = sorted.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

    // Contagem
    const countEl = document.getElementById('attCount');
    if (countEl) countEl.textContent = `${total} registro${total !== 1 ? 's' : ''}`;

    // Tabela
    if (tbody) {
      if (!page.length) {
        tbody.innerHTML = `<tr class="empty-row"><td colspan="6">
          <div class="empty-state"><i class="fa-regular fa-calendar-xmark empty-state-icon"></i>
          <p class="empty-state-title">Nenhum registro encontrado</p></div></td></tr>`;
      } else {
        tbody.innerHTML = page.map(r => {
          const student = findStudent(r.studentId);
          const cls     = r.classId ? findClass(r.classId) : null;
          return `
            <tr>
              <td>${utils.formatDate(r.date)}</td>
              <td>${student?.name || '—'}</td>
              <td class="text-small text-muted">${cls?.name || 'Individual'}</td>
              <td>${utils.statusBadge(r.status)}</td>
              <td class="text-small text-muted">${r.lessonContent
                  ? `<span class="lesson-content-cell" title="${r.lessonContent.replace(/"/g,'&quot;')}">${r.lessonContent.length > 40 ? r.lessonContent.slice(0,40) + '…' : r.lessonContent}</span>`
                  : (r.notes || '—')}</td>
              <td>
                <div class="table-row-actions">
                  <button class="action-btn action-btn--edit" data-id="${r.id}" title="Editar">
                    <i class="fa-solid fa-pen-to-square"></i>
                  </button>
                  <button class="action-btn action-btn--delete" data-id="${r.id}" title="Excluir">
                    <i class="fa-solid fa-trash"></i>
                  </button>
                </div>
              </td>
            </tr>`;
        }).join('');

        tbody.querySelectorAll('.action-btn--edit').forEach(btn =>
          btn.addEventListener('click', () => openEditRecord(btn.dataset.id)));
        tbody.querySelectorAll('.action-btn--delete').forEach(btn =>
          btn.addEventListener('click', () => confirmDelete(btn.dataset.id)));
      }
    }

    renderPagination(total, pages);
    updateSortIcons();
  }

  /* ====== Paginação ====== */
  function renderPagination(total, pages) {
    const info    = document.getElementById('attPaginationInfo');
    const pagesEl = document.getElementById('attPaginationPages');
    const prev    = document.getElementById('attPrevPage');
    const next    = document.getElementById('attNextPage');

    if (info)   info.textContent = total ? `${(currentPage-1)*PAGE_SIZE+1}–${Math.min(currentPage*PAGE_SIZE,total)} de ${total}` : '';
    if (prev)   prev.disabled = currentPage <= 1;
    if (next)   next.disabled = currentPage >= pages;

    if (pagesEl) {
      pagesEl.innerHTML = Array.from({ length: Math.min(pages, 7) }, (_, i) => {
        const p = i + 1;
        return `<button class="page-btn${p===currentPage?' page-btn--active':''}" data-page="${p}">${p}</button>`;
      }).join('');
      pagesEl.querySelectorAll('.page-btn').forEach(btn =>
        btn.addEventListener('click', () => { currentPage = +btn.dataset.page; render(); }));
    }
  }

  document.getElementById('attPrevPage')?.addEventListener('click', () => { currentPage--; render(); });
  document.getElementById('attNextPage')?.addEventListener('click', () => { currentPage++; render(); });

  /* ====== Ordenação ====== */
  function updateSortIcons() {
    document.querySelectorAll('#attendanceTable .sortable').forEach(th => {
      const icon = th.querySelector('.sort-icon');
      if (!icon) return;
      const field = th.dataset.sort;
      icon.className = 'fa-solid sort-icon ' +
        (field !== sortField ? 'fa-sort' : sortDir === 'asc' ? 'fa-sort-up sort-icon--asc' : 'fa-sort-down sort-icon--desc');
    });
  }

  document.querySelectorAll('#attendanceTable .sortable').forEach(th => {
    th.addEventListener('click', () => {
      const f = th.dataset.sort;
      if (sortField === f) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
      else { sortField = f; sortDir = 'asc'; }
      currentPage = 1;
      render();
    });
  });

  /* ====== Filtros ====== */
  searchInput?.addEventListener('input',  utils.debounce(() => { currentPage=1; render(); }, 300));
  dateFrom?.addEventListener('change',    () => { currentPage=1; render(); });
  dateTo?.addEventListener('change',      () => { currentPage=1; render(); });
  classFilter?.addEventListener('change', () => { currentPage=1; render(); });
  statusFilter?.addEventListener('change',() => { currentPage=1; render(); });

  clearFiltersBtn?.addEventListener('click', () => {
    if (searchInput)  searchInput.value  = '';
    if (classFilter)  classFilter.value  = '';
    if (statusFilter) statusFilter.value = '';
    setDefaultDates();
    currentPage = 1;
    render();
  });

  /* ====== Curriculum picker (modal de aula) — guias por módulo ====== */
  function buildCurriculumPicker() {
    const picker = document.getElementById('attCurriculumPicker');
    if (!picker) return;

    if (!allProgMods.length || !allProgConts.length) {
      picker.innerHTML = `<div class="att-curriculum-empty">Nenhum conteúdo cadastrado no currículo. Configure em <a href="/progresso/" style="color:var(--color-primary)">Progresso → Currículo</a>.</div>`;
      return;
    }

    /* Filtra só módulos que têm conteúdo */
    const activeMods = allProgMods.filter(mod =>
      allProgConts.some(c => c.moduleId === mod.id)
    );

    if (!activeMods.length) {
      picker.innerHTML = `<div class="att-curriculum-empty">Nenhum conteúdo no currículo.</div>`;
      return;
    }

    /* Guias */
    const tabsHtml = activeMods.map((cat, i) => {
      /* Extrai só o código do nível, ex: "A1 — Beginner" → "A1" */
      const label = mod.name.split('—')[0].trim() || mod.name;
      return `<button type="button" class="att-curr-tab${i === 0 ? ' att-curr-tab--active' : ''}"
                data-cat-idx="${i}">${label}</button>`;
    }).join('');

    /* Painéis (todos ficam no DOM — checkboxes são encontrados mesmo nos ocultos) */
    const panelsHtml = activeMods.map((cat, i) => {
      const items = allProgConts.filter(c => c.moduleId === mod.id);
      const itemsHtml = items.map(item => `
        <div class="att-curriculum-item">
          <input type="checkbox" id="pc_${item.id}" value="${item.id}" />
          <label for="pc_${item.id}">${item.title}</label>
        </div>`).join('');
      return `<div class="att-curr-panel${i === 0 ? ' att-curr-panel--active' : ''}"
                   data-cat-idx="${i}">${itemsHtml}</div>`;
    }).join('');

    picker.innerHTML = `
      <div class="att-curr-tabs">${tabsHtml}</div>
      <div class="att-curr-panels">${panelsHtml}</div>`;

    /* Troca de guia */
    picker.querySelectorAll('.att-curr-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = btn.dataset.catIdx;
        picker.querySelectorAll('.att-curr-tab').forEach(b =>
          b.classList.toggle('att-curr-tab--active', b.dataset.catIdx === idx));
        picker.querySelectorAll('.att-curr-panel').forEach(p =>
          p.classList.toggle('att-curr-panel--active', p.dataset.catIdx === idx));
      });
    });
  }

  function getCheckedContentIds() {
    /* Busca em todos os painéis, incluindo os ocultos */
    return Array.from(document.querySelectorAll('#attCurriculumPicker input[type="checkbox"]:checked'))
      .map(cb => cb.value);
  }

  /* ====== Modal Registrar Aula ====== */
  function openAttModal() {
    const form = document.getElementById('attForm');
    if (!form) return;
    form.reset();
    document.getElementById('attId').value = '';
    document.getElementById('attModalTitle').textContent = 'Registrar Aula';
    document.getElementById('attDate').value = utils.getCurrentDate();
    const lc = document.getElementById('attLessonContent');
    if (lc) lc.value = '';

    // Popular select de turmas
    const attClassSelect = document.getElementById('attClassSelect');
    if (attClassSelect) {
      attClassSelect.innerHTML = '<option value="">Todos / Individual</option>'
        + allClasses.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
    }

    buildCurriculumPicker();
    buildStudentList(null);
    modals.open('attModalOverlay');
  }

  document.getElementById('addAttendanceBtn')?.addEventListener('click', openAttModal);
  document.getElementById('attModalCancel')?.addEventListener('click', () => modals.close('attModalOverlay'));

  /* ---------- Selecionar turma no modal ---------- */
  document.getElementById('attClassSelect')?.addEventListener('change', (e) => {
    buildStudentList(e.target.value || null);
  });

  /* ---- Cria um elemento .att-student-row com handlers de status ---- */
  function makeStudentRow(s, { removable = false } = {}) {
    const row = document.createElement('div');
    row.className = 'att-student-row';
    row.dataset.studentId = s.id;

    const levelShort = utils.formatLevelShort(s.level || '');
    row.innerHTML = `
      <div class="att-student-name-wrap">
        <span class="att-student-name">${s.name}</span>
        ${levelShort ? `<span class="level-badge">${levelShort}</span>` : ''}
      </div>
      <div class="att-status-toggle">
        <button type="button" class="att-status-btn att-status-btn--present is-active" data-status="present">
          <i class="fa-solid fa-circle-check"></i> Presente
        </button>
        <button type="button" class="att-status-btn att-status-btn--absent" data-status="absent">
          <i class="fa-solid fa-circle-xmark"></i> Falta
        </button>
        <button type="button" class="att-status-btn att-status-btn--justified" data-status="justified">
          <i class="fa-solid fa-circle-exclamation"></i> Justif.
        </button>
      </div>
      <input type="hidden" name="att_${s.id}" value="present" />
      ${removable ? `<button type="button" class="att-remove-student" title="Remover"><i class="fa-solid fa-xmark"></i></button>` : ''}`;

    const input = row.querySelector('input[type=hidden]');
    const btns  = row.querySelectorAll('.att-status-btn');
    btns.forEach(btn => btn.addEventListener('click', () => {
      btns.forEach(b => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      input.value = btn.dataset.status;
    }));

    if (removable) {
      row.querySelector('.att-remove-student').addEventListener('click', () => {
        row.remove();
        _syncIndividualEmpty();
        _refreshIndividualSearch();  // re-abre o dropdown se tiver busca ativa
        _refreshIndividualSelect();  // recoloca o aluno nas opções do seletor
      });
    }

    return row;
  }

  /* ---- Mostra/esconde o estado vazio no modo individual ---- */
  function _syncIndividualEmpty() {
    const sel   = document.getElementById('attSelectedStudents');
    if (!sel) return;
    const hasRows = sel.querySelector('.att-student-row');
    const emptyEl = sel.querySelector('.att-individual-empty');
    if (!hasRows && !emptyEl) {
      sel.insertAdjacentHTML('beforeend', `
        <div class="att-individual-empty">
          <i class="fa-solid fa-user-plus"></i>
          <span>Busque e adicione os alunos desta aula acima</span>
        </div>`);
    } else if (hasRows && emptyEl) {
      emptyEl.remove();
    }
  }

  /* ---- Atualiza o dropdown de busca (exclui já adicionados) ---- */
  function _refreshIndividualSearch() {
    const inp = document.getElementById('attStudentSearchInput');
    if (inp && inp.value.trim()) inp.dispatchEvent(new Event('input'));
  }

  /* ---- Configura a busca de alunos no modo individual ---- */
  function _setupIndividualSearch() {
    const inp      = document.getElementById('attStudentSearchInput');
    const dropdown = document.getElementById('attStudentDropdown');
    const sel      = document.getElementById('attSelectedStudents');
    if (!inp || !dropdown || !sel) return;

    const getAddedIds = () =>
      new Set([...sel.querySelectorAll('.att-student-row')].map(r => r.dataset.studentId));

    inp.addEventListener('input', utils.debounce(() => {
      const q = inp.value.trim().toLowerCase();
      if (!q) { dropdown.hidden = true; return; }

      const added   = getAddedIds();
      const matches = allStudents
        .filter(s => s.name.toLowerCase().includes(q) && !added.has(s.id))
        .slice(0, 7);

      if (!matches.length) {
        dropdown.innerHTML = `<div class="att-dropdown-empty">Nenhum aluno encontrado</div>`;
      } else {
        dropdown.innerHTML = matches.map(s => {
          const lvl = utils.formatLevelShort(s.level || '');
          return `<div class="att-dropdown-item" data-id="${s.id}" role="option">
            <span class="att-dropdown-name">${s.name}</span>
            ${lvl ? `<span class="level-badge">${lvl}</span>` : ''}
          </div>`;
        }).join('');

        dropdown.querySelectorAll('.att-dropdown-item').forEach(item => {
          item.addEventListener('mousedown', (e) => {
            e.preventDefault(); // evita blur no input antes do click
            const s = findStudent(item.dataset.id);
            if (!s) return;
            const emptyEl = sel.querySelector('.att-individual-empty');
            if (emptyEl) emptyEl.remove();
            sel.appendChild(makeStudentRow(s, { removable: true }));
            inp.value = '';
            dropdown.hidden = true;
            _refreshIndividualSelect(); // remove o aluno das opções do seletor
            inp.focus();
          });
        });
      }
      dropdown.hidden = false;
    }, 200));

    inp.addEventListener('blur', () => {
      // Pequeno delay para deixar o mousedown do item disparar antes
      setTimeout(() => { dropdown.hidden = true; }, 150);
    });

    inp.addEventListener('focus', () => {
      if (inp.value.trim()) dropdown.hidden = false;
    });
  }

  /* ---- Atualiza as opções do <select> (exclui alunos já adicionados) ---- */
  function _refreshIndividualSelect() {
    const select = document.getElementById('attStudentSelect');
    const added  = document.getElementById('attSelectedStudents');
    if (!select || !added) return;

    const addedIds  = new Set([...added.querySelectorAll('.att-student-row')].map(r => r.dataset.studentId));
    const available = allStudents
      .filter(s => !addedIds.has(s.id))
      .sort((a, b) => a.name.localeCompare(b.name));

    const prev = select.value; // tenta preservar seleção atual
    select.innerHTML = `<option value="">Escolher da lista...</option>` +
      available.map(s => {
        const lvl = utils.formatLevelShort(s.level || '');
        return `<option value="${s.id}">${s.name}${lvl ? ` — ${lvl}` : ''}</option>`;
      }).join('');

    if (available.find(s => s.id === prev)) select.value = prev;
  }

  /* ---- Configura o botão "Adicionar" do seletor ---- */
  function _setupIndividualSelect() {
    const select  = document.getElementById('attStudentSelect');
    const addBtn  = document.getElementById('attStudentSelectAdd');
    const sel     = document.getElementById('attSelectedStudents');
    if (!select || !addBtn || !sel) return;

    _refreshIndividualSelect(); // popula as opções iniciais

    addBtn.addEventListener('click', () => {
      const id = select.value;
      if (!id) return;
      const s = findStudent(id);
      if (!s) return;
      const emptyEl = sel.querySelector('.att-individual-empty');
      if (emptyEl) emptyEl.remove();
      sel.appendChild(makeStudentRow(s, { removable: true }));
      select.value = '';
      _refreshIndividualSelect();  // remove o aluno das opções
      _refreshIndividualSearch();  // sincroniza o dropdown de busca
    });
  }

  /* ---- buildStudentList: ponto de entrada ---- */
  function buildStudentList(classId) {
    const container = document.getElementById('attStudentsList');
    if (!container) return;

    /* ---- MODO TURMA: carrega todos os alunos da turma pré-selecionados ---- */
    if (classId) {
      container.classList.remove('att-students-selector--individual');

      const students = allStudents.filter(s => s.classId === classId);

      if (!students.length) {
        container.innerHTML = `<div class="empty-state empty-state--sm">
          <i class="fa-solid fa-users"></i><p>Nenhum aluno nesta turma</p></div>`;
        return;
      }

      container.innerHTML = '';
      students.forEach(s => container.appendChild(makeStudentRow(s)));
      return;
    }

    /* ---- MODO INDIVIDUAL: busca manual, sem pré-seleção ---- */
    container.classList.add('att-students-selector--individual');
    container.innerHTML = `
      <div class="att-student-search-wrap">

        <!-- Opção 1: busca por nome -->
        <div class="att-search-option">
          <span class="att-search-option-label"><i class="fa-solid fa-magnifying-glass"></i> Buscar pelo nome</span>
          <div style="position:relative">
            <input type="text" id="attStudentSearchInput" class="form-input att-search-input"
                   placeholder="Digite o nome do aluno..." autocomplete="off" />
            <div class="att-student-dropdown" id="attStudentDropdown" hidden></div>
          </div>
        </div>

        <!-- Divisor -->
        <div class="att-search-or"><span>ou</span></div>

        <!-- Opção 2: seletor da lista completa -->
        <div class="att-search-option">
          <span class="att-search-option-label"><i class="fa-solid fa-list"></i> Escolher da lista</span>
          <div class="att-select-row">
            <select id="attStudentSelect" class="form-select" style="flex:1">
              <option value="">Escolher da lista...</option>
            </select>
            <button type="button" id="attStudentSelectAdd" class="btn btn--primary" title="Adicionar aluno">
              <i class="fa-solid fa-plus"></i> Adicionar
            </button>
          </div>
        </div>

      </div>
      <div id="attSelectedStudents">
        <div class="att-individual-empty">
          <i class="fa-solid fa-user-plus"></i>
          <span>Adicione os alunos desta aula acima</span>
        </div>
      </div>`;

    _setupIndividualSearch();
    _setupIndividualSelect();
  }

  /* Quick actions */
  document.getElementById('markAllPresent')?.addEventListener('click', () => {
    document.querySelectorAll('.att-student-row').forEach(row => {
      row.querySelectorAll('.att-status-btn').forEach(b => b.classList.remove('is-active'));
      row.querySelector('.att-status-btn--present')?.classList.add('is-active');
      const inp = row.querySelector('input[type=hidden]');
      if (inp) inp.value = 'present';
    });
  });

  document.getElementById('markAllAbsent')?.addEventListener('click', () => {
    document.querySelectorAll('.att-student-row').forEach(row => {
      row.querySelectorAll('.att-status-btn').forEach(b => b.classList.remove('is-active'));
      row.querySelector('.att-status-btn--absent')?.classList.add('is-active');
      const inp = row.querySelector('input[type=hidden]');
      if (inp) inp.value = 'absent';
    });
  });

  /* ---------- Salvar frequência ---------- */
  document.getElementById('attForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const dateVal       = document.getElementById('attDate').value;
    const classId       = document.getElementById('attClassSelect')?.value || null;
    const notes         = document.getElementById('attGeneralNotes')?.value || '';
    const lessonContent = document.getElementById('attLessonContent')?.value.trim() || '';
    const contentIds    = getCheckedContentIds();

    if (!dateVal) {
      document.getElementById('attDateError').textContent = 'Informe a data.';
      return;
    }

    const rows = document.querySelectorAll('#attStudentsList .att-student-row');
    if (!rows.length) {
      utils.showToast('Adicione ao menos um aluno antes de salvar.', 'error');
      return;
    }

    const saveBtn = document.getElementById('saveAttBtn');
    if (saveBtn) saveBtn.classList.add('is-loading');

    try {
      /* Salvar registros de frequência */
      const attRows = Array.from(rows).map(row => ({
        studentId: row.dataset.studentId,
        status:    row.querySelector('input[type=hidden]')?.value || 'present',
      }));

      /* Derivar teacher_id do contexto para que registros criados pelo admin
         fiquem vinculados ao professor correto (e não ao UID do admin).
         — Com turma: usa o professor da turma.
         — Individual: usa o professor em comum entre todos os alunos selecionados,
           se houver exatamente um; caso contrário, salva sem vínculo (null). */
      let contextTeacherId = undefined; // undefined → _fromAttendance decide pelo papel
      if (classId) {
        contextTeacherId = findClass(classId)?.teacherId || null;
      } else {
        const teacherSets = attRows.map(({ studentId }) => {
          const s = findStudent(studentId);
          return new Set(s?.teacherIds || []);
        });
        if (teacherSets.length) {
          const common = [...teacherSets[0]].filter(tid =>
            teacherSets.every(s => s.has(tid))
          );
          contextTeacherId = common.length === 1 ? common[0] : null;
        }
      }

      /* Salva sequencialmente para evitar concorrência no lock de auth do Supabase */
      for (const { studentId, status } of attRows) {
        await storage.saveAttendance({
          studentId, classId, date: dateVal, status, notes, lessonContent,
          teacherId: contextTeacherId,
        });
      }

      /* Registrar progresso nos conteúdos selecionados (apenas presentes/justificados) */
      if (contentIds.length) {
        const eligible = attRows.filter(r => r.status === 'present' || r.status === 'justified');
        const progressRecords = [];
        eligible.forEach(({ studentId }) => {
          contentIds.forEach(contentId => {
            progressRecords.push({ studentId, contentId, status: 'realizado', date: dateVal, notes: '' });
          });
        });
        if (progressRecords.length) {
          await storage.bulkSaveStudentProgress(progressRecords);
        }
      }

      modals.close('attModalOverlay');
      utils.showToast('Frequência registrada!', 'success');
      allAttendance = await storage.getAttendance();
      loadStats();
      render();
    } catch (err) {
      utils.showToast('Erro ao registrar frequência.', 'error');
      console.error(err);
    } finally {
      if (saveBtn) saveBtn.classList.remove('is-loading');
    }
  });

  /* ====== Modal Editar Registro Individual ====== */
  function openEditRecord(id) {
    const record = allAttendance.find(r => r.id === id);
    if (!record) return;

    // Popular select de alunos
    const sel = document.getElementById('attEditStudentSelect');
    if (sel) {
      sel.innerHTML = '<option value="">Selecione o aluno</option>'
        + allStudents.map(s =>
            `<option value="${s.id}"${s.id === record.studentId ? ' selected' : ''}>${s.name}</option>`
          ).join('');
    }
    const errEl = document.getElementById('attEditStudentError');
    if (errEl) errEl.textContent = '';

    document.getElementById('attEditId').value            = id;
    document.getElementById('attEditDate').value          = record.date;
    document.getElementById('attEditLessonContent').value = record.lessonContent || '';
    document.getElementById('attEditNotes').value         = record.notes || '';

    const radio = document.querySelector(`#attEditForm input[name="status"][value="${record.status}"]`);
    if (radio) radio.checked = true;

    modals.open('attEditOverlay');
  }

  document.getElementById('attEditCancel')?.addEventListener('click', () => modals.close('attEditOverlay'));

  document.getElementById('attEditForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id            = document.getElementById('attEditId').value;
    const studentId     = document.getElementById('attEditStudentSelect')?.value;
    const date          = document.getElementById('attEditDate').value;
    const status        = document.querySelector('#attEditForm input[name="status"]:checked')?.value;
    const lessonContent = document.getElementById('attEditLessonContent')?.value.trim() || '';
    const notes         = document.getElementById('attEditNotes').value;

    const errEl = document.getElementById('attEditStudentError');
    if (!studentId) {
      if (errEl) errEl.textContent = 'Selecione o aluno.';
      return;
    }
    if (errEl) errEl.textContent = '';
    if (!status) return;

    try {
      await storage.saveAttendance({ id, studentId, date, status, lessonContent, notes });
      modals.close('attEditOverlay');
      utils.showToast('Frequência atualizada!', 'success');
      allAttendance = await storage.getAttendance();
      loadStats();
      render();
    } catch (err) {
      utils.showToast('Erro ao atualizar registro.', 'error');
      console.error(err);
    }
  });

  /* ====== Confirmar Exclusão ====== */
  function confirmDelete(id) {
    pendingDeleteId = id;
    modals.open('deleteConfirmOverlay');
  }

  document.getElementById('deleteConfirm')?.addEventListener('click', async () => {
    if (!pendingDeleteId) return;
    try {
      await storage.deleteAttendance(pendingDeleteId);
      modals.close('deleteConfirmOverlay');
      utils.showToast('Registro excluído.', 'warning');
      pendingDeleteId = null;
      allAttendance = await storage.getAttendance();
      loadStats();
      render();
    } catch (err) {
      utils.showToast('Erro ao excluir registro.', 'error');
      console.error(err);
    }
  });

  document.getElementById('deleteCancel')?.addEventListener('click', () => {
    modals.close('deleteConfirmOverlay');
    pendingDeleteId = null;
  });

  /* ====== Exportar CSV ====== */
  document.getElementById('exportAttBtn')?.addEventListener('click', () => {
    const filtered = getSorted(getFiltered());
    if (!filtered.length) {
      utils.showToast('Nenhum registro para exportar.', 'warning');
      return;
    }

    const header = ['Data', 'Aluno', 'Turma', 'Status', 'Conteúdo Ministrado', 'Observações'];
    const statusLabel = { present: 'Presente', absent: 'Falta', justified: 'Justificada', makeup: 'Reposição' };

    const rows = filtered.map(r => {
      const student = findStudent(r.studentId);
      const cls     = r.classId ? findClass(r.classId) : null;
      return [
        utils.formatDate(r.date),
        student?.name || '—',
        cls?.name     || 'Individual',
        statusLabel[r.status] || r.status,
        r.lessonContent || '',
        r.notes || '',
      ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',');
    });

    const csv     = [header.join(','), ...rows].join('\n');
    const blob    = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url     = URL.createObjectURL(blob);
    const a       = document.createElement('a');
    const month   = new Date().toISOString().slice(0, 7);
    a.href        = url;
    a.download    = `frequencia_${month}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    utils.showToast('Exportação concluída!', 'success');
  });

  /* ====== Init ====== */
  await init();
});
