/* ==========================================================================
   PROGRESSO.JS — Gestão de progresso dos alunos e currículo
   ========================================================================== */

document.addEventListener('DOMContentLoaded', async () => {

  const { utils, storage, modals } = HT;

  /* ====== Estado ====== */
  let allStudents    = [];
  let allClasses     = [];
  let allCategories  = [];
  let allContents    = [];
  let allProgress    = [];
  let currentStudentId = null;
  let pendingDelete  = { type: null, id: null };

  /* Estado do modal de progresso (guias + paginação) */
  let _progCatIdx  = 0;
  let _progPage    = 1;
  const PROG_PAGE  = 10;

  /* ====== Carregar tudo ====== */
  async function load() {
    [allStudents, allClasses, allCategories, allContents, allProgress] = await Promise.all([
      storage.getStudents(),
      storage.getClasses(),
      storage.getProgressCategories(),
      storage.getProgressContents(),
      storage.getAllStudentProgress(),
    ]);
  }

  /* ====== Helpers ====== */
  const findStudent  = id => allStudents.find(s => s.id === id) || null;
  const findClass    = id => allClasses.find(c => c.id === id) || null;
  const findCategory = id => allCategories.find(c => c.id === id) || null;
  const findContent  = id => allContents.find(c => c.id === id) || null;

  function getLatestProgress(studentId, contentId) {
    return allProgress
      .filter(p => p.studentId === studentId && p.contentId === contentId)
      .sort((a, b) => b.date.localeCompare(a.date))[0] || null;
  }

  function getRecentDone(studentId, n = 3) {
    const seen = new Set();
    return allProgress
      .filter(p => p.studentId === studentId && (p.status === 'realizado' || p.status === 'dispensado'))
      .sort((a, b) => b.date.localeCompare(a.date))
      .filter(p => {
        if (seen.has(p.contentId)) return false;
        seen.add(p.contentId);
        return true;
      })
      .slice(0, n)
      .map(p => ({ ...p, contentTitle: findContent(p.contentId)?.title || '—' }));
  }

  /* ====== Alternância de view ====== */
  document.querySelectorAll('#viewStudentsBtn, #viewCurriculumBtn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#viewStudentsBtn, #viewCurriculumBtn').forEach(b => {
        b.classList.remove('app-tab--active');
        b.setAttribute('aria-selected', 'false');
      });
      btn.classList.add('app-tab--active');
      btn.setAttribute('aria-selected', 'true');
      const isStudents = btn.dataset.view === 'students';
      document.getElementById('studentsView').style.display    = isStudents ? '' : 'none';
      document.getElementById('curriculumView').style.display  = isStudents ? 'none' : '';
    });
  });

  /* ========================================================================
     VIEW: ALUNOS
     ======================================================================== */

  const searchInput = document.getElementById('progStudentSearch');
  const filterLevel = document.getElementById('progFilterLevel');

  function getFilteredStudents() {
    const q     = (searchInput?.value || '').toLowerCase();
    const level = filterLevel?.value || '';
    return allStudents.filter(s => {
      if (q     && !s.name.toLowerCase().includes(q)) return false;
      if (level && s.level !== level) return false;
      return true;
    });
  }

  function renderStudents() {
    const grid    = document.getElementById('progCardsGrid');
    const countEl = document.getElementById('progStudentsCount');
    if (!grid) return;

    const list = getFilteredStudents();
    if (countEl) countEl.textContent = `${list.length} aluno${list.length !== 1 ? 's' : ''}`;

    if (!list.length) {
      grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;min-height:200px;background:var(--color-gray-200);border:1.5px dashed var(--gray-200);border-radius:var(--radius-lg); margin-top: 16px;">
        <i class="fa-solid fa-chart-line empty-state-icon"></i>
        <p class="empty-state-title">${allStudents.length ? 'Nenhum aluno encontrado' : 'Nenhum aluno cadastrado'}</p>
        <p class="empty-state-desc">${allStudents.length ? 'Tente outros filtros' : 'Cadastre alunos primeiro em "Alunos"'}</p>
      </div>`;
      return;
    }

    grid.innerHTML = list.map(buildStudentCard).join('');
    grid.querySelectorAll('.prog-card').forEach(card => {
      card.addEventListener('click', () => openStudentProgress(card.dataset.id));
    });
  }

  function buildStudentCard(s) {
    const recent       = getRecentDone(s.id);
    const levelShort   = utils.formatLevelShort(s.level);
    const cls          = s.classId ? findClass(s.classId) : null;
    const studentProgs = allProgress.filter(p => p.studentId === s.id);
    const doneIds      = new Set(studentProgs.filter(p => p.status === 'realizado').map(p => p.contentId));
    const totalContents = allContents.length;
    const pct = totalContents ? Math.round((doneIds.size / totalContents) * 100) : 0;

    const recentHtml = recent.length
      ? recent.map(p => `
          <div class="prog-card-topic">
            <span class="prog-card-topic-title">${p.contentTitle}</span>
            <span class="prog-card-topic-date">${utils.formatDate(p.date)}</span>
          </div>`).join('')
      : '<p class="prog-card-empty-topics">Nenhum conteúdo registrado ainda</p>';

    return `
      <div class="prog-card" data-id="${s.id}" role="button" tabindex="0" aria-label="Ver progresso de ${s.name}">
        <div class="prog-card-header">
          <div class="prog-card-avatar">${utils.getInitials(s.name)}</div>
          <div class="prog-card-info">
            <div class="prog-card-name">${s.name}</div>
            <div class="prog-card-meta">
              ${levelShort ? `<span class="level-badge">${levelShort}</span>` : ''}
              ${cls ? `<span class="prog-card-class"><i class="fa-solid fa-users" style="font-size:.65rem"></i> ${cls.name}</span>` : ''}
            </div>
          </div>
          <i class="fa-solid fa-chevron-right prog-card-arrow"></i>
        </div>
        ${totalContents > 0 ? `
        <div class="prog-bar-wrap">
          <div class="prog-bar-fill" style="width:${pct}%"></div>
        </div>
        <div class="prog-bar-label">${doneIds.size} de ${totalContents} realizados · ${pct}%</div>
        ` : ''}
        <div class="prog-card-body">
          <div class="prog-card-topics-label">Últimas aulas:</div>
          ${recentHtml}
        </div>
      </div>`;
  }

  searchInput?.addEventListener('input', utils.debounce(renderStudents, 250));
  filterLevel?.addEventListener('change', renderStudents);

  /* ========================================================================
     MODAL: Progresso do aluno
     ======================================================================== */

  function openStudentProgress(studentId) {
    const s = findStudent(studentId);
    if (!s) return;
    currentStudentId = studentId;

    document.getElementById('progressStudentAvatar').textContent = utils.getInitials(s.name);
    document.getElementById('studentProgressTitle').textContent  = s.name;
    document.getElementById('studentProgressLevel').textContent  = utils.formatLevel(s.level) || 'Sem nível definido';

    /* Auto-selecionar a guia do nível do aluno */
    const activeCats  = allCategories.filter(cat => allContents.some(c => c.categoryId === cat.id));
    const levelShort  = utils.formatLevelShort(s.level || '').toUpperCase(); // "B1"
    const levelIdx    = activeCats.findIndex(cat => cat.name.toUpperCase().startsWith(levelShort));
    _progCatIdx = levelIdx >= 0 ? levelIdx : 0;
    _progPage   = 1;

    renderProgressBody(studentId);
    modals.open('studentProgressOverlay');
  }

  /* Extrai código curto da categoria ("A1 — Beginner" → "A1") */
  function _catCode(cat) {
    const m = cat.name.match(/^([A-C][12])/i);
    return m ? m[1].toUpperCase() : cat.name.substring(0, 6);
  }
  /* Extrai nome longo ("A1 — Beginner" → "Beginner") */
  function _catSub(cat) {
    const parts = cat.name.split(/\s*—\s*/);
    return parts.length > 1 ? parts[1].trim() : '';
  }

  function renderProgressBody(studentId) {
    const body = document.getElementById('studentProgressBody');
    if (!body) return;

    /* ---- Sem currículo ---- */
    if (!allCategories.length) {
      body.innerHTML = `<div class="empty-state">
        <i class="fa-solid fa-book-open empty-state-icon"></i>
        <p class="empty-state-title">Nenhum conteúdo cadastrado</p>
        <p class="empty-state-desc">Vá para "Currículo" e adicione os conteúdos do programa, ou importe o padrão CEFR.</p>
      </div>`;
      return;
    }

    /* ---- Dados gerais ---- */
    const doneTotal = new Set(
      allProgress.filter(p => p.studentId === studentId && p.status === 'realizado').map(p => p.contentId)
    ).size;
    const totalCont = allContents.length;
    const pctTotal  = totalCont ? Math.round((doneTotal / totalCont) * 100) : 0;

    /* ---- Categorias com itens ---- */
    const activeCats = allCategories.filter(cat => allContents.some(c => c.categoryId === cat.id));
    if (_progCatIdx >= activeCats.length) _progCatIdx = 0;

    const cat      = activeCats[_progCatIdx];
    const items    = allContents.filter(c => c.categoryId === cat.id);
    const total    = items.length;
    const pages    = Math.max(1, Math.ceil(total / PROG_PAGE));
    if (_progPage > pages) _progPage = pages;

    const pageItems = items.slice((_progPage - 1) * PROG_PAGE, _progPage * PROG_PAGE);
    const doneInCat = items.filter(i => getLatestProgress(studentId, i.id)?.status === 'realizado').length;
    const pctCat    = total ? Math.round((doneInCat / total) * 100) : 0;

    /* ---- Guias de categoria ---- */
    const tabsHtml = activeCats.map((c, idx) => {
      const catItems = allContents.filter(x => x.categoryId === c.id);
      const catDone  = catItems.filter(i => getLatestProgress(studentId, i.id)?.status === 'realizado').length;
      const active   = idx === _progCatIdx;
      return `
        <button class="pmtab${active ? ' pmtab--active' : ''}" data-idx="${idx}" type="button"
                title="${c.name}">
          <span class="pmtab-code">${_catCode(c)}</span>
          <span class="pmtab-sub">${_catSub(c) || c.name}</span>
          <span class="pmtab-count">${catDone}/${catItems.length}</span>
        </button>`;
    }).join('');

    /* ---- Itens da página atual ---- */
    const itemsHtml = pageItems.map((item, i) => {
      const latest = allProgress
        .filter(p => p.studentId === studentId && p.contentId === item.id)
        .sort((a, b) => b.date.localeCompare(a.date))[0] || null;
      const status = latest?.status || 'nao_registrado';
      const num    = (_progPage - 1) * PROG_PAGE + i + 1;

      return `
        <div class="prog-item-row">
          <span class="prog-item-num">${num}</span>
          <div class="prog-item-info">
            <span class="prog-item-title">${item.title}</span>
            ${latest?.date
              ? `<span class="prog-item-date">${utils.formatDate(latest.date)}${latest.notes ? ' · ' + latest.notes : ''}</span>`
              : ''}
          </div>
          <button class="prog-badge ${badgeClass(status)}"
                  data-content-id="${item.id}" data-student-id="${studentId}"
                  title="Clique para registrar progresso" type="button">
            ${statusIcon(status)} ${statusLabel(status)}
          </button>
        </div>`;
    }).join('');

    /* ---- Paginação ---- */
    const paginationHtml = pages > 1 ? `
      <div class="prog-modal-pagination">
        <button class="pagination-btn" id="progPrevPage" ${_progPage <= 1 ? 'disabled' : ''} type="button"
                aria-label="Página anterior">
          <i class="fa-solid fa-chevron-left"></i>
        </button>
        <span class="prog-modal-page-info">
          ${(_progPage - 1) * PROG_PAGE + 1}–${Math.min(_progPage * PROG_PAGE, total)} de ${total}
        </span>
        <button class="pagination-btn" id="progNextPage" ${_progPage >= pages ? 'disabled' : ''} type="button"
                aria-label="Próxima página">
          <i class="fa-solid fa-chevron-right"></i>
        </button>
      </div>` : '';

    /* ---- Montar HTML ---- */
    body.innerHTML = `
      <div class="prog-modal-summary">
        <div class="prog-modal-summary-bar">
          <div class="prog-bar-wrap" style="flex:1">
            <div class="prog-bar-fill" style="width:${pctTotal}%"></div>
          </div>
          <span class="prog-modal-summary-pct">${pctTotal}%</span>
        </div>
        <span class="prog-modal-summary-label">${doneTotal} de ${totalCont} conteúdos realizados no total</span>
      </div>

      <div class="prog-modal-tabs-wrap">
        <button class="prog-tabs-nav prog-tabs-nav--prev" id="progTabsPrev" aria-label="Guias anteriores" disabled>
          <i class="fa-solid fa-chevron-left"></i>
        </button>
        <div class="prog-modal-tabs" role="tablist" aria-label="Níveis do currículo">
          ${tabsHtml}
        </div>
        <button class="prog-tabs-nav prog-tabs-nav--next" id="progTabsNext" aria-label="Próximas guias">
          <i class="fa-solid fa-chevron-right"></i>
        </button>
      </div>

      <div class="prog-modal-cat-bar">
        <span class="prog-modal-cat-name">${cat.name}</span>
        <div class="prog-modal-cat-right">
          <div class="prog-cat-minibar">
            <div class="prog-cat-minibar-fill" style="width:${pctCat}%"></div>
          </div>
          <span class="prog-category-count">${doneInCat}/${total} · ${pctCat}%</span>
        </div>
      </div>

      <div class="prog-modal-items">
        ${itemsHtml || '<div class="empty-state empty-state--sm"><p>Nenhum conteúdo nesta categoria.</p></div>'}
      </div>

      ${paginationHtml}`;

    /* ---- Eventos ---- */
    body.querySelectorAll('.pmtab').forEach(btn => {
      btn.addEventListener('click', () => {
        _progCatIdx = +btn.dataset.idx;
        _progPage   = 1;
        renderProgressBody(studentId);
      });
    });

    /* ---- Navegação das guias (scroll com botões) ---- */
    const tabsList = body.querySelector('.prog-modal-tabs');
    const tabsPrev = body.querySelector('#progTabsPrev');
    const tabsNext = body.querySelector('#progTabsNext');

    function _updateTabsNav() {
      if (!tabsList) return;
      const overflows = tabsList.scrollWidth > tabsList.clientWidth + 2;
      const wrap = tabsList.closest('.prog-modal-tabs-wrap');
      wrap?.classList.toggle('prog-modal-tabs-wrap--overflow', overflows);
      if (tabsPrev) tabsPrev.disabled = tabsList.scrollLeft <= 1;
      if (tabsNext) tabsNext.disabled = tabsList.scrollLeft + tabsList.clientWidth >= tabsList.scrollWidth - 1;
    }

    tabsPrev?.addEventListener('click', () => {
      tabsList?.scrollBy({ left: -200, behavior: 'smooth' });
      setTimeout(_updateTabsNav, 320);
    });
    tabsNext?.addEventListener('click', () => {
      tabsList?.scrollBy({ left: 200, behavior: 'smooth' });
      setTimeout(_updateTabsNav, 320);
    });
    tabsList?.addEventListener('scroll', _updateTabsNav, { passive: true });

    /* Garante que a guia ativa fique visível */
    tabsList?.querySelector('.pmtab--active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    /* Inicializa estado dos botões após o layout estar pronto */
    requestAnimationFrame(_updateTabsNav);

    body.querySelector('#progPrevPage')?.addEventListener('click', () => {
      _progPage--;
      renderProgressBody(studentId);
    });
    body.querySelector('#progNextPage')?.addEventListener('click', () => {
      _progPage++;
      renderProgressBody(studentId);
    });

    body.querySelectorAll('.prog-badge[data-content-id]').forEach(btn => {
      btn.addEventListener('click', () => openStatusModal(btn.dataset.studentId, btn.dataset.contentId));
    });
  }

  document.getElementById('studentProgressClose')?.addEventListener('click', () => modals.close('studentProgressOverlay'));

  /* ========================================================================
     MODAL: Status de progresso
     ======================================================================== */

  function openStatusModal(studentId, contentId) {
    const content = findContent(contentId);
    const latest  = getLatestProgress(studentId, contentId);

    document.getElementById('progressStatusStudentId').value      = studentId;
    document.getElementById('progressStatusContentId').value      = contentId;
    document.getElementById('progressStatusContentTitle').textContent = content?.title || '';
    document.getElementById('progressStatusDate').value           = latest?.date || utils.getCurrentDate();
    document.getElementById('progressStatusNotes').value          = latest?.notes || '';

    document.querySelectorAll('input[name="progStatus"]').forEach(r => {
      r.checked = r.value === (latest?.status || '');
    });

    /* Mostrar/ocultar data conforme seleção */
    const toggleDate = () => {
      const val = document.querySelector('input[name="progStatus"]:checked')?.value;
      document.getElementById('progressStatusDateGroup').style.display = val ? '' : 'none';
    };
    document.querySelectorAll('input[name="progStatus"]').forEach(r => r.addEventListener('change', toggleDate));
    toggleDate();

    modals.open('progressStatusOverlay');
  }

  document.getElementById('progressStatusCancel')?.addEventListener('click', () => modals.close('progressStatusOverlay'));
  document.getElementById('progressStatusClose')?.addEventListener('click',  () => modals.close('progressStatusOverlay'));

  document.getElementById('progressStatusForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const studentId = document.getElementById('progressStatusStudentId').value;
    const contentId = document.getElementById('progressStatusContentId').value;
    const status    = document.querySelector('input[name="progStatus"]:checked')?.value || '';
    const date      = document.getElementById('progressStatusDate').value;
    const notes     = document.getElementById('progressStatusNotes').value.trim();
    const btn       = document.getElementById('progressStatusSave');

    if (status && !date) { utils.showToast('Informe a data.', 'error'); return; }

    if (btn) btn.classList.add('is-loading');
    try {
      if (!status) {
        /* Limpar: apaga TODOS os registros deste aluno+conteúdo */
        const toDelete = allProgress.filter(p => p.studentId === studentId && p.contentId === contentId);
        await Promise.all(toDelete.map(p => storage.deleteStudentProgress(p.id)));
      } else {
        await storage.saveStudentProgress({ studentId, contentId, status, date, notes });
      }
      allProgress = await storage.getAllStudentProgress();
      modals.close('progressStatusOverlay');
      renderProgressBody(currentStudentId);
      renderStudents();
      utils.showToast('Progresso atualizado!', 'success');
    } catch (err) {
      utils.showToast('Erro ao salvar progresso.', 'error');
      console.error(err);
    } finally {
      if (btn) btn.classList.remove('is-loading');
    }
  });

  /* ========================================================================
     HELPERS DE STATUS
     ======================================================================== */

  function statusLabel(s) {
    return { realizado: 'Realizado', dispensado: 'Dispensado', nao_realizado: 'Não Realizado', nao_registrado: 'Não Registrado' }[s] || 'Não Registrado';
  }
  function statusIcon(s) {
    return {
      realizado:     '<i class="fa-solid fa-circle-check"></i>',
      dispensado:    '<i class="fa-solid fa-forward"></i>',
      nao_realizado: '<i class="fa-solid fa-circle-xmark"></i>',
      nao_registrado:'<i class="fa-solid fa-minus"></i>',
    }[s] || '<i class="fa-solid fa-minus"></i>';
  }
  function badgeClass(s) {
    return {
      realizado:     'prog-badge--realizado',
      dispensado:    'prog-badge--dispensado',
      nao_realizado: 'prog-badge--nao_realizado',
      nao_registrado:'prog-badge--nao_registrado',
    }[s] || 'prog-badge--nao_registrado';
  }

  /* Expõe helpers para alunos.js (tab de progresso) */
  window.HT = window.HT || {};
  window.HT.progressHelpers = { statusLabel, statusIcon, badgeClass, getLatestProgress: () => getLatestProgress, renderProgressBody };

  /* ========================================================================
     VIEW: CURRÍCULO
     ======================================================================== */

  function renderCurriculum() {
    const list = document.getElementById('curriculumList');
    if (!list) return;

    if (!allCategories.length) {
      list.innerHTML = `<div class="empty-state" style="min-height:200px;background-color:var(--color-gray-400);border:1.5px dashed var(--gray-200);border-radius:var(--radius-lg); margin-top: 16px;">
        <i class="fa-solid fa-book-open empty-state-icon"></i>
        <p class="empty-state-title">Nenhuma categoria criada</p>
        <p class="empty-state-desc">Clique em "Nova Categoria" para adicionar seu currículo.</p>
      </div>`;
      return;
    }

    list.innerHTML = allCategories.map((cat, ci) => {
      const items = allContents.filter(c => c.categoryId === cat.id);
      return `
        <div class="curriculum-category" data-cat-id="${cat.id}">
          <div class="curriculum-cat-header">
            <div class="curriculum-cat-reorder">
              <button class="curriculum-reorder-btn" data-action="cat-up" data-id="${cat.id}" ${ci === 0 ? 'disabled' : ''} title="Mover para cima" type="button">
                <i class="fa-solid fa-chevron-up"></i>
              </button>
              <button class="curriculum-reorder-btn" data-action="cat-down" data-id="${cat.id}" ${ci === allCategories.length-1 ? 'disabled' : ''} title="Mover para baixo" type="button">
                <i class="fa-solid fa-chevron-down"></i>
              </button>
            </div>
            <strong class="curriculum-cat-name">${cat.name}</strong>
            <span class="curriculum-count">${items.length} item${items.length !== 1 ? 's' : ''}</span>
            <div class="curriculum-cat-actions">
              <button class="action-btn action-btn--edit" data-action="edit-cat" data-id="${cat.id}" title="Editar categoria" type="button">
                <i class="fa-solid fa-pen-to-square"></i>
              </button>
              <button class="action-btn action-btn--delete" data-action="delete-cat" data-id="${cat.id}" title="Excluir categoria" type="button">
                <i class="fa-solid fa-trash"></i>
              </button>
              <button class="btn btn--ghost btn--sm" data-action="add-item" data-cat-id="${cat.id}" type="button">
                <i class="fa-solid fa-plus"></i> Item
              </button>
            </div>
          </div>
          <div class="curriculum-items">
            ${items.length ? items.map((item, ii) => `
              <div class="curriculum-item" data-item-id="${item.id}">
                <div class="curriculum-item-reorder">
                  <button class="curriculum-reorder-btn" data-action="item-up" data-id="${item.id}" data-cat-id="${cat.id}" ${ii === 0 ? 'disabled' : ''} type="button"><i class="fa-solid fa-chevron-up"></i></button>
                  <button class="curriculum-reorder-btn" data-action="item-down" data-id="${item.id}" data-cat-id="${cat.id}" ${ii === items.length-1 ? 'disabled' : ''} type="button"><i class="fa-solid fa-chevron-down"></i></button>
                </div>
                <div class="curriculum-item-text">
                  <span class="curriculum-item-title">${item.title}</span>
                  ${item.description ? `<span class="curriculum-item-desc">${item.description}</span>` : ''}
                </div>
                <div class="curriculum-item-actions">
                  <button class="action-btn action-btn--edit" data-action="edit-item" data-id="${item.id}" data-cat-id="${cat.id}" type="button"><i class="fa-solid fa-pen-to-square"></i></button>
                  <button class="action-btn action-btn--delete" data-action="delete-item" data-id="${item.id}" type="button"><i class="fa-solid fa-trash"></i></button>
                </div>
              </div>`).join('')
            : `<div class="curriculum-empty"><i class="fa-solid fa-inbox"></i> Nenhum item. Clique em "+ Item" para adicionar.</div>`}
          </div>
        </div>`;
    }).join('');

    list.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', handleCurriculumAction);
    });
  }

  async function handleCurriculumAction(e) {
    const btn    = e.currentTarget;
    const action = btn.dataset.action;
    const id     = btn.dataset.id;
    const catId  = btn.dataset.catId;

    switch (action) {
      case 'cat-up':   await moveCat(id, -1); break;
      case 'cat-down': await moveCat(id, +1); break;
      case 'item-up':  await moveItem(id, catId, -1); break;
      case 'item-down':await moveItem(id, catId, +1); break;
      case 'edit-cat': openCategoryModal(findCategory(id)); break;
      case 'delete-cat': confirmDeleteCat(id); break;
      case 'edit-item':  openContentModal(catId, findContent(id)); break;
      case 'delete-item':confirmDeleteItem(id); break;
      case 'add-item':   openContentModal(catId); break;
    }
  }

  async function moveCat(id, dir) {
    const idx = allCategories.findIndex(c => c.id === id);
    if (idx + dir < 0 || idx + dir >= allCategories.length) return;
    [allCategories[idx], allCategories[idx + dir]] = [allCategories[idx + dir], allCategories[idx]];
    await Promise.all(allCategories.map((c, i) => storage.saveProgressCategory({ ...c, position: i })));
    allCategories = await storage.getProgressCategories();
    renderCurriculum();
  }

  async function moveItem(id, catId, dir) {
    const items = allContents.filter(c => c.categoryId === catId);
    const idx   = items.findIndex(c => c.id === id);
    if (idx + dir < 0 || idx + dir >= items.length) return;
    [items[idx], items[idx + dir]] = [items[idx + dir], items[idx]];
    await Promise.all(items.map((c, i) => storage.saveProgressContent({ ...c, position: i })));
    allContents = await storage.getProgressContents();
    renderCurriculum();
  }

  /* --- CRUD Categoria --- */
  function openCategoryModal(cat = null) {
    document.getElementById('categoryModalTitle').textContent = cat ? 'Editar Categoria' : 'Nova Categoria';
    document.getElementById('categoryId').value              = cat?.id || '';
    document.getElementById('categoryName').value            = cat?.name || '';
    document.getElementById('categoryNameError').textContent = '';
    modals.open('categoryModalOverlay');
  }

  document.getElementById('addCategoryBtn')?.addEventListener('click', () => openCategoryModal());
  document.getElementById('categoryModalCancel')?.addEventListener('click', () => modals.close('categoryModalOverlay'));
  document.getElementById('categoryModalClose')?.addEventListener('click', () => modals.close('categoryModalOverlay'));

  document.getElementById('categoryForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name  = document.getElementById('categoryName').value.trim();
    const errEl = document.getElementById('categoryNameError');
    errEl.textContent = '';
    if (!name) { errEl.textContent = 'Informe o nome.'; return; }

    const btn = document.getElementById('categoryModalSave');
    if (btn) btn.classList.add('is-loading');
    try {
      const id       = document.getElementById('categoryId').value || undefined;
      const position = id ? findCategory(id)?.position ?? allCategories.length : allCategories.length;
      await storage.saveProgressCategory({ id, name, position });
      allCategories = await storage.getProgressCategories();
      modals.close('categoryModalOverlay');
      renderCurriculum();
      utils.showToast(id ? 'Categoria atualizada!' : 'Categoria criada!', 'success');
    } catch (err) { console.error(err); utils.showToast('Erro ao salvar categoria.', 'error'); }
    finally { if (btn) btn.classList.remove('is-loading'); }
  });

  function confirmDeleteCat(id) {
    const cat   = findCategory(id);
    const count = allContents.filter(c => c.categoryId === id).length;
    document.getElementById('progDeleteDesc').textContent =
      `Excluir a categoria "${cat?.name}"? Os ${count} conteúdo(s) dentro dela também serão excluídos. Esta ação não pode ser desfeita.`;
    pendingDelete = { type: 'category', id };
    modals.open('progDeleteOverlay');
  }

  /* --- CRUD Conteúdo --- */
  function openContentModal(catId, content = null) {
    document.getElementById('contentModalTitle').textContent = content ? 'Editar Conteúdo' : 'Novo Conteúdo';
    document.getElementById('contentId').value               = content?.id || '';
    document.getElementById('contentCategoryId').value       = catId;
    document.getElementById('contentTitle').value            = content?.title || '';
    document.getElementById('contentDescription').value      = content?.description || '';
    document.getElementById('contentTitleError').textContent = '';
    modals.open('contentModalOverlay');
  }

  document.getElementById('contentModalCancel')?.addEventListener('click', () => modals.close('contentModalOverlay'));
  document.getElementById('contentModalClose')?.addEventListener('click', () => modals.close('contentModalOverlay'));

  document.getElementById('contentForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title       = document.getElementById('contentTitle').value.trim();
    const description = document.getElementById('contentDescription').value.trim();
    const categoryId  = document.getElementById('contentCategoryId').value;
    const errEl       = document.getElementById('contentTitleError');
    errEl.textContent = '';
    if (!title) { errEl.textContent = 'Informe o título.'; return; }

    const btn = document.getElementById('contentModalSave');
    if (btn) btn.classList.add('is-loading');
    try {
      const id       = document.getElementById('contentId').value || undefined;
      const existing = allContents.filter(c => c.categoryId === categoryId);
      const position = id ? findContent(id)?.position ?? existing.length : existing.length;
      await storage.saveProgressContent({ id, categoryId, title, description, position });
      allContents = await storage.getProgressContents();
      modals.close('contentModalOverlay');
      renderCurriculum();
      utils.showToast(id ? 'Conteúdo atualizado!' : 'Conteúdo adicionado!', 'success');
    } catch (err) { console.error(err); utils.showToast('Erro ao salvar conteúdo.', 'error'); }
    finally { if (btn) btn.classList.remove('is-loading'); }
  });

  function confirmDeleteItem(id) {
    const item = findContent(id);
    document.getElementById('progDeleteDesc').textContent =
      `Excluir "${item?.title}"? Todo o histórico de progresso deste conteúdo também será removido.`;
    pendingDelete = { type: 'content', id };
    modals.open('progDeleteOverlay');
  }

  document.getElementById('progDeleteCancel')?.addEventListener('click', () => modals.close('progDeleteOverlay'));
  document.getElementById('progDeleteConfirm')?.addEventListener('click', async () => {
    try {
      if (pendingDelete.type === 'category') {
        await storage.deleteProgressCategory(pendingDelete.id);
        allCategories = await storage.getProgressCategories();
        allContents   = await storage.getProgressContents();
      } else if (pendingDelete.type === 'content') {
        await storage.deleteProgressContent(pendingDelete.id);
        allContents = await storage.getProgressContents();
      }
      allProgress = await storage.getAllStudentProgress();
      modals.close('progDeleteOverlay');
      renderCurriculum();
      renderStudents();
      utils.showToast('Excluído com sucesso.', 'warning');
    } catch { utils.showToast('Erro ao excluir.', 'error'); }
  });

  /* ========================================================================
     SEED CEFR
     ======================================================================== */

  document.getElementById('seedCefrBtn')?.addEventListener('click', async () => {
    if (allCategories.length > 0 &&
        !confirm('Isso adicionará os conteúdos CEFR ao currículo atual. Continuar?')) return;

    const btn = document.getElementById('seedCefrBtn');
    if (btn) btn.classList.add('is-loading');
    try {
      await seedCefr();
      allCategories = await storage.getProgressCategories();
      allContents   = await storage.getProgressContents();
      renderCurriculum();
      renderStudents();
      utils.showToast('Conteúdo CEFR importado com sucesso!', 'success');
    } catch (err) {
      utils.showToast('Erro ao importar CEFR.', 'error');
      console.error(err);
    } finally {
      if (btn) btn.classList.remove('is-loading');
    }
  });

  async function seedCefr() {
    const CEFR = [
      { name: 'A1 — Beginner', items: [
        'Alfabeto e Fonética','Cumprimentos e Despedidas','Apresentações Pessoais',
        'Números (1–100)','Cores e Formas','Pronomes Pessoais','Artigos (a, an, the)',
        'Verbo To Be (presente)','Vocabulário: Família','Vocabulário: Objetos do Dia a Dia',
        'Adjetivos Simples','Simple Present','There is / There are',
        'Preposições de Lugar','Dias da Semana e Meses','Horas e Períodos do Dia',
      ]},
      { name: 'A2 — Elementary', items: [
        'Past Simple (verbos regulares)','Past Simple (verbos irregulares)',
        'Present Continuous','Going to (planos futuros)','Comparativos e Superlativos',
        'Verbos Modais: Can / Could','Preposições de Tempo (in, on, at)',
        'Vocabulário: Comida e Bebida','Vocabulário: Viagem e Transporte',
        'Vocabulário: Corpo e Saúde','Vocabulário: Compras e Dinheiro',
        'Have got / Has got','Much / Many / A lot of',
      ]},
      { name: 'B1 — Intermediate', items: [
        'Present Perfect (básico)','Present Perfect vs. Past Simple','Past Continuous',
        'Will / Going to (predições e planos)','First Conditional',
        'Voz Passiva (presente e passado)','Reported Speech (básico)',
        'Verbos Modais: Should / Must / Have to','Relative Clauses (básico)',
        'Vocabulário: Meio Ambiente','Vocabulário: Tecnologia',
        'Phrasal Verbs Comuns','Linking Words / Conectores',
      ]},
      { name: 'B2 — Upper Intermediate', items: [
        'Past Perfect','Second Conditional','Third Conditional',
        'Voz Passiva (avançada)','Modal Perfect (should/could/would + have)',
        'Reported Speech (avançado)','Relative Clauses (avançado)',
        'Causative (have/get something done)','Inversão Estilística',
        'Vocabulário: Negócios e Economia','Vocabulário: Política e Sociedade',
        'Vocabulário: Ciência e Tecnologia','Academic Writing: Estrutura e Coesão',
      ]},
      { name: 'C1 — Advanced', items: [
        'Mixed Conditionals','Subjuntivo e Formas Formais','Discourse Markers Avançados',
        'Nominalização','Cleft Sentences (It is… / What…)','Registro Formal vs. Informal',
        'Idioms e Expressões Fixas','Academic Writing: Argumentação Crítica',
        'Vocabulário Acadêmico (AWL)','Produção Oral: Debates e Negociação',
      ]},
      { name: 'C2 — Proficient', items: [
        'Estruturas Gramaticais Complexas','Nuances de Sentido e Tom',
        'Literatura e Textos Autênticos','Variantes do Inglês (UK, US, AU)',
        'Retórica e Persuasão','Expressões Coloquiais e Gírias Avançadas',
        'Tradução e Interpretação','Escrita Criativa',
      ]},
    ];

    const basePos = allCategories.length;
    for (let ci = 0; ci < CEFR.length; ci++) {
      const cat = CEFR[ci];
      const savedCat = await storage.saveProgressCategory({ name: cat.name, position: basePos + ci });
      for (let ii = 0; ii < cat.items.length; ii++) {
        await storage.saveProgressContent({ categoryId: savedCat.id, title: cat.items[ii], description: '', position: ii });
      }
    }
  }

  /* ====== Init ====== */
  await load();
  renderStudents();
  renderCurriculum();
});
