/* ==========================================================================
   GRADES.JS — Módulo compartilhado de NOTAS
   Renderiza listagem agrupada por módulo + modal de CRUD. Reusado pelas
   páginas Alunos (aba Notas) e Progresso (seção inline no modal do aluno).
   ========================================================================== */

window.HT = window.HT || {};

HT.grades = (() => {

  const { storage, modals, utils } = HT;

  let _modalInjected = false;
  let _modalCtx = null;   // { studentId, gradeId, onSaved }

  /* -------------------- Modal markup (lazy) -------------------- */
  function _ensureModal() {
    if (_modalInjected) return;

    const el = document.createElement('div');
    el.id = 'gradeModalOverlay';
    el.className = 'modal-overlay';
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = `
      <div class="modal modal--confirm" role="dialog" aria-modal="true" aria-labelledby="gradeModalTitle">
        <div class="modal-header">
          <h3 class="modal-title" id="gradeModalTitle">Nova Nota</h3>
          <button type="button" class="modal-close" id="gradeModalClose" aria-label="Fechar"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <form class="modal-body" id="gradeForm" novalidate>
          <input type="hidden" id="gradeId" />
          <input type="hidden" id="gradeStudentId" />
          <p id="gradeModuleHint" style="font-size:.8125rem;color:var(--text-secondary);margin:0 0 8px"></p>
          <div class="form-group">
            <label for="gradeModuleSelect" class="form-label">Módulo <span class="required">*</span></label>
            <select id="gradeModuleSelect" class="form-input"></select>
            <span class="form-error" id="gradeModuleError"></span>
          </div>
          <div class="form-group">
            <label for="gradeType" class="form-label">Tipo da nota <span class="required">*</span></label>
            <input type="text" id="gradeType" class="form-input" list="gradeTypeSuggestions" placeholder="Ex: Prova, Participação, Projeto..." maxlength="60" />
            <datalist id="gradeTypeSuggestions">
              <option value="Prova"></option>
              <option value="Participação"></option>
              <option value="Projeto"></option>
              <option value="Trabalho"></option>
              <option value="Apresentação"></option>
              <option value="Tarefa de casa"></option>
            </datalist>
            <span class="form-error" id="gradeTypeError"></span>
          </div>
          <div class="form-row" style="display:flex;gap:12px;flex-wrap:wrap">
            <div class="form-group" style="flex:1;min-width:120px">
              <label for="gradeValue" class="form-label">Valor (0–10) <span class="required">*</span></label>
              <input type="number" id="gradeValue" class="form-input" min="0" max="10" step="0.1" placeholder="9.5" inputmode="decimal" />
              <span class="form-error" id="gradeValueError"></span>
            </div>
            <div class="form-group" style="flex:1;min-width:160px">
              <label for="gradeDate" class="form-label">Data</label>
              <input type="date" id="gradeDate" class="form-input" />
            </div>
          </div>
          <div class="form-group">
            <label for="gradeNotes" class="form-label">Observação <span class="text-muted">(opcional)</span></label>
            <input type="text" id="gradeNotes" class="form-input" placeholder="Ex: Recuperação, prova substitutiva..." maxlength="240" />
          </div>
        </form>
        <div class="modal-footer">
          <button type="button" class="btn btn--ghost" id="gradeModalCancel">Cancelar</button>
          <button type="submit" form="gradeForm" class="btn btn--primary" id="gradeModalSave">
            <i class="fa-solid fa-floppy-disk"></i> <span>Salvar</span>
          </button>
        </div>
      </div>`;

    document.body.appendChild(el);

    el.querySelector('#gradeModalClose').addEventListener('click', () => modals.close('gradeModalOverlay'));
    el.querySelector('#gradeModalCancel').addEventListener('click', () => modals.close('gradeModalOverlay'));
    el.querySelector('#gradeForm').addEventListener('submit', _onSubmit);

    _modalInjected = true;
  }

  /* -------------------- Form helpers -------------------- */
  function _clearError(id) { const e = document.getElementById(id); if (e) e.textContent = ''; }
  function _setError(id, msg) { const e = document.getElementById(id); if (e) e.textContent = msg; }

  async function _onSubmit(e) {
    e.preventDefault();
    ['gradeModuleError', 'gradeTypeError', 'gradeValueError'].forEach(_clearError);

    const moduleId = document.getElementById('gradeModuleSelect').value;
    const gradeType = document.getElementById('gradeType').value.trim();
    const valueRaw  = document.getElementById('gradeValue').value;
    const dateRaw   = document.getElementById('gradeDate').value;
    const notes     = document.getElementById('gradeNotes').value.trim();

    let hasError = false;
    if (!moduleId)  { _setError('gradeModuleError', 'Selecione um módulo.'); hasError = true; }
    if (!gradeType) { _setError('gradeTypeError', 'Informe o tipo da nota.'); hasError = true; }
    const value = Number(valueRaw);
    if (valueRaw === '' || Number.isNaN(value) || value < 0 || value > 10) {
      _setError('gradeValueError', 'Valor deve estar entre 0 e 10.');
      hasError = true;
    }
    if (hasError) return;

    const payload = {
      id:         document.getElementById('gradeId').value || undefined,
      studentId:  _modalCtx.studentId,
      moduleId,
      gradeType,
      value:      Math.round(value * 100) / 100,
      notes,
      recordedAt: dateRaw || new Date().toISOString().slice(0, 10),
    };

    try {
      await storage.saveStudentGrade(payload);
      utils.showToast(payload.id ? 'Nota atualizada.' : 'Nota lançada!', 'success');
      modals.close('gradeModalOverlay');
      _modalCtx?.onSaved?.();
    } catch (err) {
      console.error(err);
      utils.showToast('Erro ao salvar nota.', 'error');
    }
  }

  /* -------------------- API: open create/edit modal -------------------- */
  async function openModal({ studentId, moduleId = null, gradeId = null, modules, onSaved }) {
    _ensureModal();

    let modulesList = modules;
    if (!modulesList) modulesList = await storage.getProgressModules();

    if (!modulesList.length) {
      utils.showToast('Cadastre módulos no currículo antes de lançar notas.', 'warning');
      return;
    }

    _modalCtx = { studentId, onSaved };

    const select = document.getElementById('gradeModuleSelect');
    select.innerHTML = modulesList.map(m =>
      `<option value="${m.id}">${utils.escapeHTML(m.name)}</option>`
    ).join('');

    document.getElementById('gradeStudentId').value = studentId;
    document.getElementById('gradeId').value = '';
    document.getElementById('gradeType').value = '';
    document.getElementById('gradeValue').value = '';
    document.getElementById('gradeDate').value = new Date().toISOString().slice(0, 10);
    document.getElementById('gradeNotes').value = '';
    document.getElementById('gradeModuleHint').textContent = '';

    if (gradeId) {
      const all = await storage.getStudentGrades(studentId);
      const g = all.find(x => x.id === gradeId);
      if (g) {
        document.getElementById('gradeModalTitle').textContent = 'Editar Nota';
        document.getElementById('gradeId').value = g.id;
        select.value = g.moduleId;
        document.getElementById('gradeType').value  = g.gradeType;
        document.getElementById('gradeValue').value = g.value;
        document.getElementById('gradeDate').value  = g.recordedAt;
        document.getElementById('gradeNotes').value = g.notes;
      }
    } else {
      document.getElementById('gradeModalTitle').textContent = 'Nova Nota';
      if (moduleId) select.value = moduleId;
    }

    modals.open('gradeModalOverlay');
  }

  /* -------------------- API: render listing into container -------------------- */
  async function render(container, { studentId, modules: providedModules }) {
    if (!container) return;
    container.innerHTML = `<div class="empty-state empty-state--sm"><i class="fa-solid fa-rotate fa-spin"></i><p>Carregando...</p></div>`;

    try {
      const [modules, grades] = await Promise.all([
        providedModules ? Promise.resolve(providedModules) : storage.getProgressModules(),
        storage.getStudentGrades(studentId),
      ]);

      if (!modules.length) {
        container.innerHTML = `
          <div class="empty-state empty-state--sm">
            <i class="fa-solid fa-book-open"></i>
            <p>Nenhum módulo cadastrado no currículo.</p>
            <p style="font-size:.8rem;color:var(--text-muted);margin-top:4px">Acesse a página de Progresso para cadastrar módulos antes de lançar notas.</p>
          </div>`;
        return;
      }

      const byModule = new Map(modules.map(m => [m.id, []]));
      grades.forEach(g => { if (byModule.has(g.moduleId)) byModule.get(g.moduleId).push(g); });

      let html = `
        <div class="grades-toolbar">
          <div class="grades-summary">
            <span class="grades-summary-count">${grades.length}</span>
            <span class="grades-summary-label">${grades.length === 1 ? 'nota lançada' : 'notas lançadas'}</span>
          </div>
          <button type="button" class="btn btn--primary btn--sm" data-grade-action="new">
            <i class="fa-solid fa-plus"></i> Nova nota
          </button>
        </div>`;

      modules.forEach(mod => {
        const list = byModule.get(mod.id) || [];
        const avg = list.length
          ? (list.reduce((s, g) => s + (g.value || 0), 0) / list.length).toFixed(1).replace('.', ',')
          : null;

        html += `
          <section class="grades-module">
            <header class="grades-module-header">
              <span class="grades-module-name">${utils.escapeHTML(mod.name)}</span>
              <span class="grades-module-meta">
                ${avg ? `<span class="grades-module-avg" title="Média do módulo">Média ${avg}</span>` : ''}
                <span class="grades-module-count">${list.length}</span>
                <button type="button" class="btn btn--ghost btn--xs" data-grade-action="new" data-module-id="${mod.id}">
                  <i class="fa-solid fa-plus"></i> Lançar
                </button>
              </span>
            </header>`;

        if (!list.length) {
          html += `<div class="grades-empty">Sem notas neste módulo.</div>`;
        } else {
          html += `<ul class="grades-list">`;
          list.forEach(g => {
            const valStr = g.value.toFixed(1).replace('.', ',');
            const color = g.value >= 7 ? 'var(--color-success)' : g.value >= 5 ? 'var(--color-warning)' : 'var(--color-danger)';
            html += `
              <li class="grade-row">
                <span class="grade-value" style="color:${color}">${valStr}</span>
                <div class="grade-info">
                  <span class="grade-type">${utils.escapeHTML(g.gradeType)}</span>
                  <span class="grade-meta">${utils.formatDate(g.recordedAt)}${g.notes ? ' · ' + utils.escapeHTML(g.notes) : ''}</span>
                </div>
                <div class="grade-actions">
                  <button type="button" class="btn-icon-only" data-grade-action="edit"   data-grade-id="${g.id}" aria-label="Editar"><i class="fa-solid fa-pen"></i></button>
                  <button type="button" class="btn-icon-only btn-icon-only--danger" data-grade-action="delete" data-grade-id="${g.id}" aria-label="Excluir"><i class="fa-solid fa-trash"></i></button>
                </div>
              </li>`;
          });
          html += `</ul>`;
        }
        html += `</section>`;
      });

      container.innerHTML = html;

      container.querySelectorAll('[data-grade-action]').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.preventDefault();
          const action  = btn.dataset.gradeAction;
          const gradeId = btn.dataset.gradeId;
          const moduleId = btn.dataset.moduleId || null;
          const reload = () => render(container, { studentId, modules: providedModules });

          if (action === 'new') {
            openModal({ studentId, moduleId, modules, onSaved: reload });
          } else if (action === 'edit') {
            openModal({ studentId, gradeId, modules, onSaved: reload });
          } else if (action === 'delete') {
            const ok = await modals.confirm('Excluir esta nota? Esta ação não pode ser desfeita.', {
              title: 'Excluir nota', okLabel: 'Excluir', okClass: 'btn--danger',
            });
            if (!ok) return;
            try {
              await storage.deleteStudentGrade(gradeId);
              utils.showToast('Nota excluída.', 'warning');
              reload();
            } catch (err) {
              console.error(err);
              utils.showToast('Erro ao excluir nota.', 'error');
            }
          }
        });
      });
    } catch (err) {
      console.error(err);
      container.innerHTML = `<div class="empty-state empty-state--sm"><i class="fa-solid fa-triangle-exclamation"></i><p>Erro ao carregar notas.</p></div>`;
    }
  }

  return { render, openModal };
})();
