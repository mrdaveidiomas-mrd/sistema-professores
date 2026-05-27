/* ==========================================================================
   MATERIAIS.JS — Pastas, listagem, pré-visualização e upload
   Estrutura: vista raiz (pastas + arquivos sem pasta) → vista de pasta (arquivos)
   Busca: retorna resultados em todos os materiais, independente de pasta.
   ========================================================================== */

window.HT = window.HT || {};

HT.materiais = (() => {

  /* ── estado ── */
  let materials       = [];
  let folders         = [];
  let role            = 'teacher';
  let currentFolderId = null;   /* null = vista raiz */
  let pendingFile     = null;

  /* ── tipos de arquivo ── */
  const FILE_TYPES = {
    pptx: { icon: 'fa-file-powerpoint', color: '#ea580c' },
    ppt:  { icon: 'fa-file-powerpoint', color: '#ea580c' },
    pdf:  { icon: 'fa-file-pdf',        color: '#dc2626' },
    docx: { icon: 'fa-file-word',       color: '#2563eb' },
    doc:  { icon: 'fa-file-word',       color: '#2563eb' },
    xlsx: { icon: 'fa-file-excel',      color: '#16a34a' },
    xls:  { icon: 'fa-file-excel',      color: '#16a34a' },
    jpg:  { icon: 'fa-file-image',      color: '#7c3aed' },
    jpeg: { icon: 'fa-file-image',      color: '#7c3aed' },
    png:  { icon: 'fa-file-image',      color: '#7c3aed' },
    webp: { icon: 'fa-file-image',      color: '#7c3aed' },
  };
  const OFFICE_EXTS = new Set(['pptx','ppt','docx','doc','xlsx','xls']);
  const IMAGE_EXTS  = new Set(['jpg','jpeg','png','webp','gif','svg']);

  const FOLDER_COLORS = [
    '#032d6f','#2563eb','#0d9488','#16a34a',
    '#ea580c','#dc2626','#7c3aed','#db2777','#6b7280',
  ];

  /* ── helpers ── */
  function getExt(m) {
    return ((m.fileName || m.name || '').split('.').pop() || '').toLowerCase();
  }
  function getTypeInfo(m) {
    return FILE_TYPES[getExt(m)] || { icon: 'fa-file', color: '#6b7280' };
  }
  function formatSize(b) {
    if (!b) return '';
    return b < 1048576 ? `${(b/1024).toFixed(0)} KB` : `${(b/1048576).toFixed(1)} MB`;
  }
  function formatDate(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString('pt-BR', { day:'2-digit', month:'short', year:'numeric' });
  }
  const escapeHTML = s => HT.utils.escapeHTML(s);

  /* ── menu de ações compartilhado (appended ao body) ── */
  let _actionsMenu = null;

  function _ensureActionsMenu() {
    if (_actionsMenu) return _actionsMenu;
    _actionsMenu = document.createElement('div');
    _actionsMenu.className = 'card-actions-menu';
    _actionsMenu.setAttribute('role', 'menu');
    _actionsMenu.style.display = 'none';
    document.body.appendChild(_actionsMenu);
    document.addEventListener('click', e => {
      if (!e.target.closest('.card-menu-btn') && !e.target.closest('.card-actions-menu')) {
        _closeActionsMenu();
      }
    });
    window.addEventListener('scroll',  _closeActionsMenu, { passive: true });
    window.addEventListener('resize',  _closeActionsMenu, { passive: true });
    return _actionsMenu;
  }

  function _openActionsMenu(triggerBtn, items) {
    const menu = _ensureActionsMenu();
    _closeActionsMenu();

    menu.innerHTML = items.map(item => `
      <button class="card-actions-item${item.danger ? ' danger' : ''}" data-key="${escapeHTML(item.key)}">
        <i class="fa-solid ${item.icon}"></i>${escapeHTML(item.label)}
      </button>`).join('');

    menu.style.visibility = 'hidden';
    menu.style.display    = 'block';

    const r  = triggerBtn.getBoundingClientRect();
    const mW = menu.offsetWidth;
    const mH = menu.offsetHeight;

    let top  = r.bottom + 4;
    let left = r.right  - mW;
    if (left < 4)                           left = 4;
    if (left + mW > window.innerWidth - 4)  left = window.innerWidth - mW - 4;
    if (top  + mH > window.innerHeight - 4) top  = r.top - mH - 4;

    menu.style.top        = `${top  + window.scrollY}px`;
    menu.style.left       = `${left + window.scrollX}px`;
    menu.style.visibility = '';

    triggerBtn.classList.add('active');
    triggerBtn.setAttribute('aria-expanded', 'true');

    menu.querySelectorAll('[data-key]').forEach(btn => {
      const item = items.find(i => i.key === btn.dataset.key);
      btn.addEventListener('click', () => { _closeActionsMenu(); item?.handler(); });
    });
  }

  function _closeActionsMenu() {
    if (!_actionsMenu) return;
    _actionsMenu.style.display = 'none';
    document.querySelectorAll('.card-menu-btn.active').forEach(b => {
      b.classList.remove('active');
      b.setAttribute('aria-expanded', 'false');
    });
  }

  /* ── DOM shortcuts ── */
  const content  = () => document.getElementById('materialsContent');
  const countEl  = () => document.getElementById('materialsCount');
  const searchInp = () => document.getElementById('materialSearch');
  const breadcrumb = () => document.getElementById('breadcrumb');

  /* ====================================================================
     BREADCRUMB
     ==================================================================== */
  function updateBreadcrumb() {
    const bc = breadcrumb();
    if (!bc) return;
    if (!currentFolderId) {
      bc.style.display = 'none';
      bc.innerHTML = '';
      return;
    }
    const folder = folders.find(f => f.id === currentFolderId);
    bc.style.display = 'flex';
    bc.innerHTML = `
      <button class="breadcrumb-back" id="bcBack">
        <i class="fa-solid fa-arrow-left"></i> Voltar
      </button>
      <button class="breadcrumb-link" id="bcRoot">
        <i class="fa-solid fa-folder-open"></i> Materiais
      </button>
      <span class="breadcrumb-sep">/</span>
      <span class="breadcrumb-current" style="color:${folder?.color || 'var(--color-primary)'}">
        <i class="fa-solid fa-folder"></i> ${escapeHTML(folder?.name || '')}
      </span>`;
    document.getElementById('bcBack')?.addEventListener('click', () => navigateTo(null));
    document.getElementById('bcRoot')?.addEventListener('click', () => navigateTo(null));
  }

  /* ====================================================================
     NAVEGAÇÃO
     ==================================================================== */
  function navigateTo(folderId) {
    currentFolderId = folderId;
    searchInp().value = '';
    updateBreadcrumb();
    renderView();
  }

  /* ====================================================================
     RENDER PRINCIPAL — despacha para vista raiz ou de pasta
     ==================================================================== */
  function renderView() {
    const q = (searchInp()?.value || '').trim().toLowerCase();
    if (q) { renderSearch(q); return; }
    if (currentFolderId === null) renderRoot();
    else renderFolderContents(currentFolderId);
  }

  /* ── Vista raiz: pastas + arquivos sem pasta ── */
  function renderRoot() {
    const ungrouped = materials.filter(m => !m.folderId);
    const fCount = id => materials.filter(m => m.folderId === id).length;
    countEl().textContent = '';

    let html = '';

    if (folders.length) {
      html += `<div class="folders-grid" id="foldersGrid">`;
      html += folders.map(f => {
        const count = fCount(f.id);
        const adminBtns = role === 'admin' ? `
          <button class="card-menu-btn" data-folder-menu="${f.id}"
                  aria-label="Opções da pasta" aria-expanded="false" title="Opções">
            <i class="fa-solid fa-ellipsis-vertical"></i>
          </button>` : '';
        return `
          <div class="folder-card" data-folder-open="${f.id}"
               style="--folder-color:${f.color}" role="button" tabindex="0"
               aria-label="Abrir pasta ${escapeHTML(f.name)}">
            ${adminBtns}
            <div class="folder-card-icon"><i class="fa-solid fa-folder"></i></div>
            <div class="folder-card-name">${escapeHTML(f.name)}</div>
            <div class="folder-card-count">${count} arquivo${count !== 1 ? 's' : ''}</div>
          </div>`;
      }).join('');
      html += '</div>';
    }

    if (ungrouped.length || !folders.length) {
      if (folders.length) {
        html += `<p class="materials-section-label">
                   <i class="fa-solid fa-inbox" style="margin-right:4px"></i>Sem pasta
                 </p>`;
      }
      html += renderMaterialCards(ungrouped, false);
    }

    if (!folders.length && !ungrouped.length) {
      html = emptyHTML('Nenhum material ainda', 'Os materiais de aula aparecerão aqui');
    }

    content().innerHTML = html;
    bindFolderCardEvents();
    bindMaterialCardEvents();
  }

  /* ── Vista de pasta: arquivos dentro de uma pasta ── */
  function renderFolderContents(folderId) {
    const list = materials.filter(m => m.folderId === folderId);
    countEl().textContent = list.length
      ? `${list.length} material${list.length !== 1 ? 'is' : ''}`
      : '';

    if (!list.length) {
      content().innerHTML = emptyHTML('Pasta vazia',
        role === 'admin' ? 'Envie materiais e escolha esta pasta ao fazer upload.' : 'Nenhum material nesta pasta.');
      return;
    }

    content().innerHTML = renderMaterialCards(list, false);
    bindMaterialCardEvents();
  }

  /* ── Busca global (ignora pasta atual) ── */
  function renderSearch(q) {
    const list = materials.filter(m =>
      m.name.toLowerCase().includes(q) ||
      m.description.toLowerCase().includes(q) ||
      (m.category || '').toLowerCase().includes(q)
    );

    countEl().textContent = list.length
      ? `${list.length} resultado${list.length !== 1 ? 's' : ''}`
      : 'Nenhum resultado';

    if (!list.length) {
      content().innerHTML = emptyHTML('Nenhum resultado', `Nada encontrado para "${escapeHTML(q)}"`);
      return;
    }

    content().innerHTML = renderMaterialCards(list, true /* mostra tag de pasta */);
    bindMaterialCardEvents();
  }

  /* ====================================================================
     HTML DE CARDS DE MATERIAL
     ==================================================================== */
  function renderMaterialCards(list, showFolderTag) {
    if (!list.length) return '';
    return `<div class="cards-grid">${list.map(m => materialCardHTML(m, showFolderTag)).join('')}</div>`;
  }

  function materialCardHTML(m, showFolderTag) {
    const { icon, color } = getTypeInfo(m);
    const meta = [formatSize(m.fileSize), formatDate(m.createdAt)].filter(Boolean).join(' · ');
    const folderTag = showFolderTag && m.folderId
      ? `<div class="material-folder-tag"
             style="--folder-tag-bg:${hexToRgba(m.folderColor||'#032d6f',.12)};--folder-tag-color:${m.folderColor||'#032d6f'}">
           <i class="fa-solid fa-folder" style="font-size:.65rem"></i>${escapeHTML(m.folderName)}
         </div>` : '';
    const adminBtns = role === 'admin' ? `
      <button class="folder-action-btn" data-material-menu="${m.id}"
              title="Opções" aria-label="Opções do material" aria-expanded="false">
        <i class="fa-solid fa-ellipsis-vertical"></i>
      </button>` : '';

    return `
      <article class="material-card" data-id="${m.id}" role="button" tabindex="0"
               aria-label="Abrir ${escapeHTML(m.name)}"
               style="--material-accent:${color}">
        <div class="material-card-icon" style="color:${color}">
          <i class="fa-solid ${icon}"></i>
        </div>
        <div class="material-card-body">
          ${folderTag}
          <div class="material-card-name">${escapeHTML(m.name)}</div>
          ${m.description ? `<div class="material-card-desc">${escapeHTML(m.description)}</div>` : ''}
          ${m.category ? `<span class="material-card-category">${escapeHTML(m.category)}</span>` : ''}
        </div>
        <div class="material-card-footer">
          <span class="material-card-meta">${escapeHTML(meta)}</span>
          <div style="display:flex;gap:2px">
            <button class="folder-action-btn material-download-btn" data-id="${m.id}" title="Baixar">
              <i class="fa-solid fa-download"></i>
            </button>
            ${adminBtns}
          </div>
        </div>
      </article>`;
  }

  function hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1,3),16);
    const g = parseInt(hex.slice(3,5),16);
    const b = parseInt(hex.slice(5,7),16);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  function emptyHTML(title, desc) {
    return `<div class="empty-state" style="min-height:260px">
      <i class="fa-solid fa-folder-open empty-state-icon"></i>
      <p class="empty-state-title">${escapeHTML(title)}</p>
      <p class="empty-state-desc">${escapeHTML(desc)}</p>
    </div>`;
  }

  /* ====================================================================
     BIND DE EVENTOS NOS CARDS
     ==================================================================== */
  function bindFolderCardEvents() {
    content().querySelectorAll('[data-folder-open]').forEach(el => {
      const open = () => navigateTo(el.dataset.folderOpen);
      el.addEventListener('click', e => {
        if (e.target.closest('[data-folder-menu]')) return;
        open();
      });
      el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') open(); });
    });

    if (role !== 'admin') return;

    content().querySelectorAll('[data-folder-menu]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        if (btn.classList.contains('active')) { _closeActionsMenu(); return; }
        const id = btn.dataset.folderMenu;
        _openActionsMenu(btn, [
          { key: 'edit', icon: 'fa-pen',   label: 'Editar',   handler: () => openFolderModal(id) },
          { key: 'del',  icon: 'fa-trash',  label: 'Excluir',  danger: true, handler: () => onDeleteFolder(id) },
        ]);
      });
    });
  }

  function bindMaterialCardEvents() {
    content().querySelectorAll('.material-card').forEach(card => {
      card.addEventListener('click', e => {
        if (e.target.closest('.material-download-btn,[data-material-menu]')) return;
        openPreview(card.dataset.id);
      });
      card.addEventListener('keydown', e => {
        if ((e.key === 'Enter' || e.key === ' ') && !e.target.closest('button')) openPreview(card.dataset.id);
      });
    });

    content().querySelectorAll('.material-download-btn').forEach(btn =>
      btn.addEventListener('click', e => { e.stopPropagation(); downloadMaterial(btn.dataset.id); }));

    if (role !== 'admin') return;
    content().querySelectorAll('[data-material-menu]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        if (btn.classList.contains('active')) { _closeActionsMenu(); return; }
        const id = btn.dataset.materialMenu;
        _openActionsMenu(btn, [
          { key: 'edit', icon: 'fa-pen',  label: 'Editar',  handler: () => openEditMaterial(id) },
          { key: 'del',  icon: 'fa-trash', label: 'Excluir', danger: true, handler: () => onDeleteMaterial(id) },
        ]);
      });
    });
  }

  async function downloadMaterial(id) {
    const m = materials.find(x => x.id === id);
    if (!m) return;
    const publicUrl = HT.storage.getMaterialPublicUrl(m.filePath);
    try {
      const resp = await fetch(publicUrl);
      const blob = await resp.blob();
      const url  = URL.createObjectURL(blob);
      Object.assign(document.createElement('a'), { href: url, download: m.fileName || m.name }).click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch { window.open(publicUrl, '_blank'); }
  }

  /* ====================================================================
     MODAL DE PASTA (criar / editar)
     ==================================================================== */
  function openFolderModal(id) {
    const folder = id ? folders.find(f => f.id === id) : null;
    document.getElementById('folderId').value        = id || '';
    document.getElementById('folderName').value      = folder?.name  || '';
    document.getElementById('folderColor').value     = folder?.color || '#032d6f';
    document.getElementById('folderNameError').textContent = '';
    document.getElementById('folderAlert').textContent     = '';
    document.getElementById('folderAlert').className       = 'login-alert';
    document.getElementById('folderModalTitle').textContent = id ? 'Editar Pasta' : 'Nova Pasta';
    document.getElementById('deleteFolderBtn').style.display = id ? '' : 'none';
    renderColorSwatches(folder?.color || '#032d6f');
    HT.modals.open('folderModalOverlay');
  }

  function renderColorSwatches(selected) {
    const wrap = document.getElementById('colorSwatches');
    wrap.innerHTML = FOLDER_COLORS.map(c => `
      <button type="button" class="color-swatch${c === selected ? ' active' : ''}"
              data-color="${c}" style="background:${c};color:${c}" title="${c}"></button>
    `).join('');
    wrap.querySelectorAll('.color-swatch').forEach(btn => {
      btn.addEventListener('click', () => {
        document.getElementById('folderColor').value = btn.dataset.color;
        wrap.querySelectorAll('.color-swatch').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });
  }

  async function onFolderSubmit(e) {
    e.preventDefault();
    const id    = document.getElementById('folderId').value || null;
    const name  = document.getElementById('folderName').value.trim();
    const color = document.getElementById('folderColor').value;
    const nameErr = document.getElementById('folderNameError');
    const alertEl = document.getElementById('folderAlert');
    const saveBtn = document.getElementById('folderSaveBtn');

    nameErr.textContent = '';
    if (!name) { nameErr.textContent = 'Informe o nome da pasta.'; return; }

    saveBtn.classList.add('is-loading');
    try {
      await HT.storage.saveFolder({ id, name, color });
      await load();
      HT.modals.close('folderModalOverlay');
      HT.utils.showToast(id ? 'Pasta atualizada!' : 'Pasta criada!', 'success');
    } catch (err) {
      alertEl.textContent = err.message || 'Erro ao salvar pasta.';
      alertEl.className   = 'login-alert error';
    } finally {
      saveBtn.classList.remove('is-loading');
    }
  }

  async function onDeleteFolder(id) {
    const folder = folders.find(f => f.id === id);
    const count  = materials.filter(m => m.folderId === id).length;
    const msg = count
      ? `Excluir a pasta "${folder?.name}"? Os ${count} material(is) dentro dela ficarão sem pasta.`
      : `Excluir a pasta "${folder?.name}"?`;
    const ok = await HT.modals.confirm(msg, { okLabel: 'Excluir pasta' });
    if (!ok) return;
    try {
      await HT.storage.deleteFolder(id);
      if (currentFolderId === id) navigateTo(null);
      await load();
      HT.modals.close('folderModalOverlay');
      HT.utils.showToast('Pasta excluída.', 'warning');
    } catch (err) {
      HT.utils.showToast(err.message || 'Erro ao excluir pasta.', 'error');
    }
  }

  /* ====================================================================
     MODAL DE EDITAR MATERIAL
     ==================================================================== */
  function openEditMaterial(id) {
    const m = materials.find(x => x.id === id);
    if (!m) return;

    document.getElementById('editMaterialId').value          = m.id;
    document.getElementById('editMaterialName').value        = m.name;
    document.getElementById('editMaterialCategory').value   = m.category || '';
    document.getElementById('editMaterialDescription').value = m.description || '';
    document.getElementById('editMaterialNameError').textContent = '';
    document.getElementById('editMaterialAlert').textContent     = '';
    document.getElementById('editMaterialAlert').className       = 'login-alert';

    populateFolderSelect('editMaterialFolder', m.folderId);

    const cats = [...new Set(materials.map(x => x.category).filter(Boolean))];
    document.getElementById('editCategoryDatalist').innerHTML =
      cats.map(c => `<option value="${escapeHTML(c)}">`).join('');

    HT.modals.open('editMaterialOverlay');
  }

  async function onEditMaterialSubmit(e) {
    e.preventDefault();
    const id       = document.getElementById('editMaterialId').value;
    const name     = document.getElementById('editMaterialName').value.trim();
    const folderId = document.getElementById('editMaterialFolder').value || null;
    const category = document.getElementById('editMaterialCategory').value.trim();
    const desc     = document.getElementById('editMaterialDescription').value.trim();
    const nameErr  = document.getElementById('editMaterialNameError');
    const alertEl  = document.getElementById('editMaterialAlert');
    const saveBtn  = document.getElementById('editMaterialSaveBtn');

    nameErr.textContent = '';
    if (!name) { nameErr.textContent = 'Informe o nome.'; return; }

    const m = materials.find(x => x.id === id);
    if (!m) return;

    saveBtn.classList.add('is-loading');
    try {
      await HT.storage.saveMaterial({
        id, name, description: desc, category, folderId,
        filePath: m.filePath, fileName: m.fileName,
        fileSize: m.fileSize, mimeType: m.mimeType,
      });
      await load();
      HT.modals.close('editMaterialOverlay');
      HT.utils.showToast('Material atualizado!', 'success');
    } catch (err) {
      alertEl.textContent = err.message || 'Erro ao salvar.';
      alertEl.className   = 'login-alert error';
    } finally {
      saveBtn.classList.remove('is-loading');
    }
  }

  /* ====================================================================
     MODAL DE UPLOAD
     ==================================================================== */
  function openUpload() {
    pendingFile = null;
    document.getElementById('uploadForm').reset();
    document.getElementById('fileDropSelected').style.display = 'none';
    document.getElementById('fileError').textContent          = '';
    document.getElementById('materialNameError').textContent  = '';
    document.getElementById('uploadAlert').textContent        = '';
    document.getElementById('uploadAlert').className          = 'login-alert';
    document.getElementById('uploadProgressWrap').style.display = 'none';

    populateFolderSelect('materialFolder', currentFolderId);

    const cats = [...new Set(materials.map(m => m.category).filter(Boolean))];
    document.getElementById('categoryDatalist').innerHTML =
      cats.map(c => `<option value="${escapeHTML(c)}">`).join('');

    HT.modals.open('uploadModalOverlay');
  }

  function populateFolderSelect(selectId, selectedId) {
    const sel = document.getElementById(selectId);
    if (!sel) return;
    sel.innerHTML = `<option value="">Sem pasta</option>` +
      folders.map(f =>
        `<option value="${f.id}" ${f.id === selectedId ? 'selected' : ''}>${escapeHTML(f.name)}</option>`
      ).join('');
  }

  function bindFileInput() {
    const input    = document.getElementById('fileInput');
    const dropArea = document.getElementById('fileDropArea');
    if (!input || !dropArea) return;

    const handleFile = file => {
      if (!file) return;
      if (file.size > 50 * 1024 * 1024) {
        document.getElementById('fileError').textContent = 'Arquivo muito grande. Máximo 50 MB.';
        return;
      }
      document.getElementById('fileError').textContent = '';
      pendingFile = file;
      const nameInp = document.getElementById('materialName');
      if (!nameInp.value) nameInp.value = file.name.replace(/\.[^.]+$/, '');
      document.getElementById('fileDropSelected').style.display = 'flex';
      document.getElementById('fileDropName').textContent = file.name;
      document.getElementById('fileDropSize').textContent = formatSize(file.size);
    };

    dropArea.addEventListener('click',  () => input.click());
    dropArea.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') input.click(); });
    input.addEventListener('change', () => handleFile(input.files[0]));
    dropArea.addEventListener('dragover',  e => { e.preventDefault(); dropArea.classList.add('drag-over'); });
    dropArea.addEventListener('dragleave', ()  => dropArea.classList.remove('drag-over'));
    dropArea.addEventListener('drop', e => {
      e.preventDefault(); dropArea.classList.remove('drag-over');
      handleFile(e.dataTransfer.files[0]);
    });
  }

  async function onUploadSubmit(e) {
    e.preventDefault();
    const name     = document.getElementById('materialName').value.trim();
    const folderId = document.getElementById('materialFolder').value || null;
    const category = document.getElementById('materialCategory').value.trim();
    const desc     = document.getElementById('materialDescription').value.trim();
    const alertEl  = document.getElementById('uploadAlert');
    const nameErr  = document.getElementById('materialNameError');
    const fileErr  = document.getElementById('fileError');
    const saveBtn  = document.getElementById('uploadSaveBtn');

    nameErr.textContent = ''; fileErr.textContent = ''; alertEl.textContent = '';
    let valid = true;
    if (!name)        { nameErr.textContent = 'Informe o nome.';          valid = false; }
    if (!pendingFile) { fileErr.textContent = 'Selecione um arquivo.';    valid = false; }
    if (!valid) return;

    saveBtn.classList.add('is-loading');
    document.getElementById('uploadProgressWrap').style.display = '';
    setProgress(0, 'Enviando arquivo…');

    try {
      const { path, fileName, fileSize, mimeType } =
        await HT.storage.uploadMaterialFile(pendingFile);
      setProgress(70, 'Salvando metadados…');
      await HT.storage.saveMaterial({ name, description: desc, category, folderId,
        filePath: path, fileName, fileSize, mimeType });
      setProgress(100, 'Concluído!');
      await load();
      HT.utils.showToast('Material enviado!', 'success');
      setTimeout(() => HT.modals.close('uploadModalOverlay'), 400);
    } catch (err) {
      console.error(err);
      alertEl.textContent = err.message || 'Erro ao enviar.';
      alertEl.className   = 'login-alert error';
    } finally {
      saveBtn.classList.remove('is-loading');
      document.getElementById('uploadProgressWrap').style.display = 'none';
    }
  }

  function setProgress(pct, label) {
    document.getElementById('uploadProgressFill').style.width = `${pct}%`;
    document.getElementById('uploadProgressLabel').textContent = label;
  }

  /* ====================================================================
     PRÉ-VISUALIZAÇÃO
     ==================================================================== */
  function openPreview(id) {
    const m = materials.find(x => x.id === id);
    if (!m) return;
    const publicUrl = HT.storage.getMaterialPublicUrl(m.filePath);
    const ext = getExt(m);

    document.getElementById('previewTitle').textContent = m.name;

    const dlBtn = document.getElementById('previewDownloadBtn');
    dlBtn._dlHandler && dlBtn.removeEventListener('click', dlBtn._dlHandler);
    dlBtn._dlHandler = async () => {
      try {
        const resp = await fetch(publicUrl);
        const blob = await resp.blob();
        const url  = URL.createObjectURL(blob);
        Object.assign(document.createElement('a'), { href: url, download: m.fileName || m.name }).click();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      } catch { window.open(publicUrl, '_blank'); }
    };
    dlBtn.addEventListener('click', dlBtn._dlHandler);

    let body = '';
    if (OFFICE_EXTS.has(ext)) {
      const viewer = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(publicUrl)}`;
      body = `<div class="preview-notice"><i class="fa-solid fa-circle-info"></i>
               Pré-visualização via Microsoft Office Online. Se não carregar, faça o download.</div>
              <iframe class="preview-iframe" src="${viewer}" title="${escapeHTML(m.name)}"
                      allowfullscreen loading="lazy"></iframe>`;
    } else if (ext === 'pdf') {
      body = `<iframe class="preview-iframe" src="${escapeHTML(publicUrl)}"
                      title="${escapeHTML(m.name)}" loading="lazy"></iframe>`;
    } else if (IMAGE_EXTS.has(ext)) {
      body = `<div class="preview-image-wrap">
                <img class="preview-image" src="${escapeHTML(publicUrl)}"
                     alt="${escapeHTML(m.name)}" loading="lazy" />
              </div>`;
    } else {
      const { icon, color } = getTypeInfo(m);
      body = `<div class="preview-unsupported">
                <i class="fa-solid ${icon}" style="color:${color}"></i>
                <p>Pré-visualização não disponível para este formato.</p>
                <p style="font-size:.8rem">Faça o download para abrir o arquivo.</p>
              </div>`;
    }

    document.getElementById('previewBody').innerHTML = body;
    HT.modals.open('previewModalOverlay');
  }

  /* ====================================================================
     EXCLUIR MATERIAL
     ==================================================================== */
  async function onDeleteMaterial(id) {
    const m = materials.find(x => x.id === id);
    if (!m) return;
    const ok = await HT.modals.confirm(`Excluir "${m.name}"? O arquivo será removido permanentemente.`, { okLabel: 'Excluir' });
    if (!ok) return;
    try {
      await HT.storage.deleteMaterial(id, m.filePath);
      HT.utils.showToast('Material excluído.', 'warning');
      await load();
    } catch (err) {
      HT.utils.showToast(err.message || 'Erro ao excluir.', 'error');
    }
  }

  /* ====================================================================
     CARGA
     ==================================================================== */
  async function load() {
    try {
      [materials, folders] = await Promise.all([
        HT.storage.getMaterials(),
        HT.storage.getFolders(),
      ]);
      updateBreadcrumb();
      renderView();
    } catch (err) {
      console.error(err);
      content().innerHTML = `<div class="empty-state" style="min-height:260px">
        <i class="fa-solid fa-triangle-exclamation empty-state-icon" style="color:var(--color-danger)"></i>
        <p class="empty-state-title">Erro ao carregar</p>
        <p class="empty-state-desc">${escapeHTML(err.message)}</p>
      </div>`;
    }
  }

  /* ====================================================================
     INIT
     ==================================================================== */
  async function init() {
    if (!document.getElementById('materialsContent')) return;

    role = (await HT.auth.getRole()) || 'teacher';

    if (role === 'admin') {
      document.getElementById('topbarActions').innerHTML = `
        <button class="btn btn--ghost btn--sm" id="newFolderBtn">
          <i class="fa-solid fa-folder-plus"></i>
          <span>Nova Pasta</span>
        </button>
        <button class="btn btn--primary btn--sm" id="addMaterialBtn">
          <i class="fa-solid fa-cloud-arrow-up"></i>
          <span>Enviar Material</span>
        </button>`;

      document.getElementById('newFolderBtn')
        .addEventListener('click', () => openFolderModal(null));
      document.getElementById('addMaterialBtn')
        .addEventListener('click', openUpload);

      /* Folder modal events */
      document.getElementById('folderForm')
        .addEventListener('submit', onFolderSubmit);
      document.getElementById('folderModalClose')
        .addEventListener('click', () => HT.modals.close('folderModalOverlay'));
      document.getElementById('folderModalCancel')
        .addEventListener('click', () => HT.modals.close('folderModalOverlay'));
      document.getElementById('deleteFolderBtn')
        .addEventListener('click', () => onDeleteFolder(document.getElementById('folderId').value));

      /* Upload modal events */
      document.getElementById('uploadForm')
        .addEventListener('submit', onUploadSubmit);
      document.getElementById('uploadModalClose')
        .addEventListener('click', () => HT.modals.close('uploadModalOverlay'));
      document.getElementById('uploadModalCancel')
        .addEventListener('click', () => HT.modals.close('uploadModalOverlay'));
      bindFileInput();

      /* Edit material modal events */
      document.getElementById('editMaterialForm')
        .addEventListener('submit', onEditMaterialSubmit);
      document.getElementById('editMaterialClose')
        .addEventListener('click', () => HT.modals.close('editMaterialOverlay'));
      document.getElementById('editMaterialCancel')
        .addEventListener('click', () => HT.modals.close('editMaterialOverlay'));
    }

    /* Preview events */
    document.getElementById('previewClose').addEventListener('click', () => {
      HT.modals.close('previewModalOverlay');
      document.getElementById('previewBody').innerHTML = '';
    });

    /* Busca */
    searchInp().addEventListener('input', HT.utils.debounce(() => renderView(), 250));

    await load();
  }

  document.addEventListener('DOMContentLoaded', init);
  return { init, load };

})();
