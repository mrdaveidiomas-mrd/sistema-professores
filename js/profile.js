/* ==========================================================================
   PROFILE.JS — Perfil editável do usuário (Supabase)
   ========================================================================== */

window.HT = window.HT || {};

HT.profile = (() => {

  let pendingPhoto = undefined; // undefined = sem alteração, null = remover, string = nova foto

  /* ====== Sidebar ====== */
  async function updateSidebar() {
    try {
      const profile     = await HT.storage.getProfile();
      const nameEl      = document.getElementById('sidebarUserName');
      const roleEl      = document.querySelector('.user-role');
      const initialsEl  = document.querySelector('#sidebarAvatar .user-avatar-initials');
      const avatarEl    = document.getElementById('sidebarAvatar');

      if (nameEl)     nameEl.textContent     = profile?.name || 'Professor';

      if (roleEl) {
        let role = 'teacher';
        try { role = (await HT.auth?.getRole()) || 'teacher'; } catch {}
        roleEl.textContent = role === 'admin' ? 'Administrador' : 'Professor';
      }

      if (initialsEl) initialsEl.textContent = getInitials(profile?.name || '');

      if (avatarEl) {
        if (profile?.photo) {
          avatarEl.style.backgroundImage    = `url(${profile.photo})`;
          avatarEl.style.backgroundSize     = 'cover';
          avatarEl.style.backgroundPosition = 'center';
          if (initialsEl) initialsEl.style.opacity = '0';
        } else {
          avatarEl.style.backgroundImage = '';
          if (initialsEl) initialsEl.style.opacity = '';
        }
      }
    } catch { /* silencioso */ }
  }

  function getInitials(name) {
    if (!name) return 'P';
    return name.trim().split(/\s+/).slice(0, 2).map(w => w[0].toUpperCase()).join('');
  }

  /* ====== Redimensionar imagem ====== */
  function resizeImage(file, maxPx, quality, cb) {
    const reader = new FileReader();
    reader.onload = ev => {
      const img = new Image();
      img.onload = () => {
        let w = img.width, h = img.height;
        if (w > maxPx || h > maxPx) {
          if (w > h) { h = Math.round(h * maxPx / w); w = maxPx; }
          else       { w = Math.round(w * maxPx / h); h = maxPx; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        cb(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  }

  /* ====== Injetar Modal ====== */
  function injectModal() {
    if (document.getElementById('profileOverlay')) return;

    const overlay = document.createElement('div');
    overlay.id        = 'profileOverlay';
    overlay.className = 'modal-overlay';
    overlay.setAttribute('aria-hidden', 'true');

    overlay.innerHTML = `
      <div class="modal modal--profile" id="profileModal" role="dialog" aria-modal="true" aria-labelledby="profileModalTitle">

        <div class="modal-header profile-modal-header">
          <div class="profile-header-content">
            <div class="profile-avatar-wrapper">
              <div class="profile-avatar profile-avatar--clickable" id="profileAvatarDisplay" title="Clique para alterar foto">
                <span id="profileAvatarInitials"></span>
                <img id="profileAvatarHeaderPhoto" class="profile-avatar-photo" alt="" />
                <div class="profile-avatar-camera-sm"><i class="fa-solid fa-camera"></i></div>
              </div>
              <div class="profile-header-info">
                <h3 class="modal-title" id="profileModalTitle" style="color:#fff"></h3>
                <span class="profile-header-role" id="profileHeaderRole"></span>
              </div>
            </div>
          </div>
          <button class="modal-close modal-close--light" id="profileClose" aria-label="Fechar perfil">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>

        <!-- Tabs -->
        <div class="tabs" role="tablist">
          <button class="tab tab--active" role="tab" aria-selected="true"
                  aria-controls="profileTabPersonal" id="profileBtnPersonal">
            <i class="fa-solid fa-id-card"></i> Perfil
          </button>
          <button class="tab" role="tab" aria-selected="false"
                  aria-controls="profileTabContact" id="profileBtnContact">
            <i class="fa-solid fa-address-book"></i> Contato
          </button>
          <button class="tab" role="tab" aria-selected="false"
                  aria-controls="profileTabSecurity" id="profileBtnSecurity">
            <i class="fa-solid fa-shield-halved"></i> Acesso
          </button>
        </div>

        <div class="modal-body modal-body--tabs" id="profileBody">

          <!-- Tab Perfil -->
          <div class="tab-panel tab-panel--active" id="profileTabPersonal" role="tabpanel">
            <div class="profile-avatar-edit">
              <div class="profile-avatar profile-avatar--lg profile-avatar--uploadable" id="profileAvatarLg"
                   role="button" tabindex="0" title="Clique para alterar foto de perfil">
                <span id="profileAvatarLgInitials"></span>
                <img id="profileAvatarPhoto" class="profile-avatar-photo" alt="Foto de perfil" />
                <div class="profile-avatar-camera">
                  <i class="fa-solid fa-camera"></i>
                  <span></span>
                </div>
              </div>
              <input type="file" id="profilePhotoInput" accept="image/jpeg,image/png,image/webp" style="display:none;" />
              <div class="profile-avatar-actions">
                <button type="button" class="btn btn--ghost btn--sm" id="profilePhotoBtn">
                  <i class="fa-solid fa-camera"></i> Alterar foto
                </button>
                <button type="button" class="btn btn--ghost btn--sm" id="profilePhotoRemoveBtn" style="display:none;">
                  <i class="fa-solid fa-trash"></i> Remover
                </button>
              </div>
            </div>
            <div class="form-group">
              <label for="profileName" class="form-label">Nome completo <span class="required">*</span></label>
              <input type="text" id="profileName" class="form-input" placeholder="Seu nome" />
              <span class="form-error" id="profileNameError"></span>
            </div>
          </div>

          <!-- Tab Contato -->
          <div class="tab-panel" id="profileTabContact" role="tabpanel" hidden>
            <div class="form-group">
              <label for="profileEmailContact" class="form-label"><br> E-mail de contato</label>
              <div class="input-wrapper">
                <i class="fa-regular fa-envelope input-icon"></i>
                <input type="email" id="profileEmailContact" class="form-input" placeholder="contato@email.com" />
              </div>
              <span class="form-hint">Exibido no seu perfil. Pode ser diferente do e-mail de login.</span>
            </div>
            <div class="form-group">
              <label for="profilePhone" class="form-label">Telefone</label>
              <div class="input-wrapper">
                <i class="fa-solid fa-phone input-icon"></i>
                <input type="tel" id="profilePhone" class="form-input" placeholder="(00) 00000-0000" />
              </div>
            </div>
          </div>

          <!-- Tab Acesso -->
          <div class="tab-panel" id="profileTabSecurity" role="tabpanel" hidden>
            <div class="profile-security-notice">
              <i class="fa-solid fa-circle-info"></i>
              Alterar o e-mail ou a senha afetará o próximo login.
            </div>
            <div class="form-group">
              <label for="profileLoginEmail" class="form-label">E-mail de login</label>
              <div class="input-wrapper">
                <i class="fa-regular fa-envelope input-icon"></i>
                <input type="email" id="profileLoginEmail" class="form-input" placeholder="login@email.com" />
              </div>
            </div>
            <hr class="form-divider" />
            <p class="form-section-label">Definir / alterar senha</p>
            <div class="form-group" id="profileCurrentPassGroup">
              <label for="profileCurrentPass" class="form-label">Senha atual <span class="form-hint-inline">(deixe em branco se ainda não possui senha)</span></label>
              <div class="input-wrapper">
                <i class="fa-solid fa-lock input-icon"></i>
                <input type="password" id="profileCurrentPass" class="form-input" placeholder="••••••••" autocomplete="current-password" />
              </div>
              <span class="form-error" id="profileCurrentPassError"></span>
            </div>
            <div class="form-row form-row--2">
              <div class="form-group">
                <label for="profileNewPass" class="form-label">Nova senha</label>
                <div class="input-wrapper">
                  <i class="fa-solid fa-key input-icon"></i>
                  <input type="password" id="profileNewPass" class="form-input" placeholder="••••••••" autocomplete="new-password" minlength="6" />
                </div>
                <span class="form-error" id="profileNewPassError"></span>
              </div>
              <div class="form-group">
                <label for="profileConfirmPass" class="form-label">Confirmar senha</label>
                <div class="input-wrapper">
                  <i class="fa-solid fa-key input-icon"></i>
                  <input type="password" id="profileConfirmPass" class="form-input" placeholder="••••••••" autocomplete="new-password" />
                </div>
                <span class="form-error" id="profileConfirmPassError"></span>
              </div>
            </div>
          </div>

        </div>

        <div class="modal-footer">
          <button type="button" class="btn btn--ghost" id="profileCancel">Cancelar</button>
          <button type="button" class="btn btn--primary" id="profileSave">
            <i class="fa-solid fa-floppy-disk"></i> Salvar alterações
          </button>
        </div>
      </div>`;

    document.body.appendChild(overlay);
    bindModalEvents();
  }

  /* ====== Exibir foto no modal ====== */
  function applyPhotoToModal(photoSrc) {
    const lgPhoto   = document.getElementById('profileAvatarPhoto');
    const hdPhoto   = document.getElementById('profileAvatarHeaderPhoto');
    const lgSpan    = document.getElementById('profileAvatarLgInitials');
    const hdSpan    = document.getElementById('profileAvatarInitials');
    const removeBtn = document.getElementById('profilePhotoRemoveBtn');

    if (photoSrc) {
      if (lgPhoto)  { lgPhoto.src = photoSrc; lgPhoto.style.display = 'block'; }
      if (hdPhoto)  { hdPhoto.src = photoSrc; hdPhoto.style.display = 'block'; }
      if (lgSpan)   lgSpan.style.opacity  = '0';
      if (hdSpan)   hdSpan.style.opacity  = '0';
      if (removeBtn) removeBtn.style.display = '';
    } else {
      if (lgPhoto)  { lgPhoto.src = ''; lgPhoto.style.display = 'none'; }
      if (hdPhoto)  { hdPhoto.src = ''; hdPhoto.style.display = 'none'; }
      if (lgSpan)   lgSpan.style.opacity  = '';
      if (hdSpan)   hdSpan.style.opacity  = '';
      if (removeBtn) removeBtn.style.display = 'none';
    }
  }

  /* ====== Detecta se o usuário entrou com senha ou via magic link ====== */
  async function _signedInWithPassword() {
    const { data: { session } } = await HT.supabase.auth.getSession();
    if (!session?.access_token) return false;
    try {
      const payload = JSON.parse(atob(session.access_token.split('.')[1]));
      return (payload.amr || []).some(a => a.method === 'password');
    } catch { return false; }
  }

  /* ====== Abrir Modal ====== */
  async function openModal() {
    const profile = await HT.storage.getProfile();
    pendingPhoto  = undefined; // reset: undefined = sem alteração

    document.getElementById('profileName').value          = profile?.name  || '';
    document.getElementById('profileEmailContact').value  = profile?.email || '';
    document.getElementById('profilePhone').value         = profile?.phone || '';

    // E-mail de login vem do usuário autenticado
    const user = await HT.auth.getUser();
    document.getElementById('profileLoginEmail').value    = user?.email || '';

    document.getElementById('profileCurrentPass').value  = '';
    document.getElementById('profileNewPass').value      = '';
    document.getElementById('profileConfirmPass').value  = '';

    ['profileNameError','profileCurrentPassError','profileNewPassError','profileConfirmPassError']
      .forEach(id => { const el = document.getElementById(id); if (el) el.textContent = ''; });

    const initials = getInitials(profile?.name || '');
    document.getElementById('profileAvatarInitials').textContent   = initials;
    document.getElementById('profileAvatarLgInitials').textContent = initials;
    document.getElementById('profileModalTitle').textContent       = profile?.name || 'Professor';

    // Label de papel no cabeçalho do modal
    const roleEl = document.getElementById('profileHeaderRole');
    if (roleEl) {
      let role = 'teacher';
      try { role = (await HT.auth?.getRole()) || 'teacher'; } catch {}
      roleEl.textContent = role === 'admin' ? 'Administrador' : 'Professor';
    }

    // Mostra/oculta campo de senha atual conforme o método de autenticação
    const hasPassword = await _signedInWithPassword();
    const currentPassGroup = document.getElementById('profileCurrentPassGroup');
    if (currentPassGroup) currentPassGroup.style.display = hasPassword ? '' : 'none';

    applyPhotoToModal(profile?.photo || null);
    activateTab('profileBtnPersonal', 'profileTabPersonal');
    HT.modals.open('profileOverlay');
  }

  /* ====== Bind eventos ====== */
  function bindModalEvents() {

    document.getElementById('profileClose')?.addEventListener('click',  () => HT.modals.close('profileOverlay'));
    document.getElementById('profileCancel')?.addEventListener('click', () => HT.modals.close('profileOverlay'));

    document.getElementById('profileBtnPersonal')?.addEventListener('click', () => activateTab('profileBtnPersonal', 'profileTabPersonal'));
    document.getElementById('profileBtnContact')?.addEventListener('click',  () => activateTab('profileBtnContact',  'profileTabContact'));
    document.getElementById('profileBtnSecurity')?.addEventListener('click', () => activateTab('profileBtnSecurity', 'profileTabSecurity'));

    document.getElementById('profileName')?.addEventListener('input', (e) => {
      const initials = getInitials(e.target.value);
      const lg = document.getElementById('profileAvatarLgInitials');
      if (lg) lg.textContent = initials;
    });

    // Upload de foto
    const photoInput = document.getElementById('profilePhotoInput');
    const photoBtn   = document.getElementById('profilePhotoBtn');
    const removeBtn  = document.getElementById('profilePhotoRemoveBtn');
    const avatarLg   = document.getElementById('profileAvatarLg');

    const triggerUpload = () => photoInput?.click();
    photoBtn?.addEventListener('click', triggerUpload);
    avatarLg?.addEventListener('click', triggerUpload);
    avatarLg?.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') triggerUpload(); });

    photoInput?.addEventListener('change', () => {
      const file = photoInput.files[0];
      if (!file) return;
      if (file.size > 2 * 1024 * 1024) {
        HT.utils.showToast('Imagem muito grande. Máximo 2 MB.', 'error');
        photoInput.value = '';
        return;
      }
      resizeImage(file, 240, 0.85, base64 => {
        pendingPhoto = base64;
        applyPhotoToModal(base64);
      });
      photoInput.value = '';
    });

    removeBtn?.addEventListener('click', () => {
      pendingPhoto = null; // null = remover foto
      applyPhotoToModal(null);
    });

    document.getElementById('profileSave')?.addEventListener('click', handleSave);
  }

  function activateTab(btnId, panelId) {
    document.querySelectorAll('#profileModal .tab').forEach(t => {
      t.classList.remove('tab--active');
      t.setAttribute('aria-selected', 'false');
    });
    document.querySelectorAll('#profileModal .tab-panel').forEach(p => { p.hidden = true; });
    const btn   = document.getElementById(btnId);
    const panel = document.getElementById(panelId);
    if (btn)   { btn.classList.add('tab--active'); btn.setAttribute('aria-selected', 'true'); }
    if (panel) { panel.hidden = false; }
  }

  /* ====== Salvar ====== */
  async function handleSave() {
    let valid = true;

    // Limpar erros
    ['profileNameError','profileCurrentPassError','profileNewPassError','profileConfirmPassError']
      .forEach(id => { const el = document.getElementById(id); if (el) el.textContent = ''; });

    const name         = document.getElementById('profileName').value.trim();
    const emailContact = document.getElementById('profileEmailContact').value.trim();
    const phone        = document.getElementById('profilePhone').value.trim();
    const newLoginEmail= document.getElementById('profileLoginEmail').value.trim();
    const currentPass  = document.getElementById('profileCurrentPass').value;
    const newPass      = document.getElementById('profileNewPass').value;
    const confirmPass  = document.getElementById('profileConfirmPass').value;

    if (!name) {
      document.getElementById('profileNameError').textContent = 'Informe o nome.';
      activateTab('profileBtnPersonal', 'profileTabPersonal');
      valid = false;
    }

    const user = await HT.auth.getUser();
    const currentEmail = user?.email || '';
    const wantsAuthChange = newPass || confirmPass || (newLoginEmail && newLoginEmail !== currentEmail);

    if (newPass || confirmPass) {
      if (newPass.length < 6) {
        document.getElementById('profileNewPassError').textContent = 'Mínimo 6 caracteres.';
        activateTab('profileBtnSecurity', 'profileTabSecurity');
        valid = false;
      } else if (newPass !== confirmPass) {
        document.getElementById('profileConfirmPassError').textContent = 'As senhas não coincidem.';
        activateTab('profileBtnSecurity', 'profileTabSecurity');
        valid = false;
      }
    }

    if (!valid) return;

    const saveBtn = document.getElementById('profileSave');
    if (saveBtn) saveBtn.classList.add('is-loading');

    try {
      // Re-autenticar com senha atual quando necessário
      const hasPassword = await _signedInWithPassword();
      if (wantsAuthChange && hasPassword) {
        if (!currentPass) {
          document.getElementById('profileCurrentPassError').textContent = 'Informe a senha atual para confirmar.';
          activateTab('profileBtnSecurity', 'profileTabSecurity');
          if (saveBtn) saveBtn.classList.remove('is-loading');
          return;
        }
        const { error: authError } = await HT.supabase.auth.signInWithPassword({
          email:    currentEmail,
          password: currentPass,
        });
        if (authError) {
          document.getElementById('profileCurrentPassError').textContent = 'Senha atual incorreta.';
          activateTab('profileBtnSecurity', 'profileTabSecurity');
          if (saveBtn) saveBtn.classList.remove('is-loading');
          return;
        }
      }

      // Salvar dados do perfil (nome, email de contato, telefone, foto)
      const profile = await HT.storage.getProfile();
      await HT.storage.saveProfile({
        name,
        email:   emailContact || profile?.email || '',
        phone,
        subject: profile?.subject || '',
        bio:     profile?.bio     || '',
        photo:   pendingPhoto === undefined ? (profile?.photo ?? null) : pendingPhoto,
      });

      // Atualizar e-mail de login via Supabase Auth
      if (newLoginEmail && newLoginEmail !== currentEmail) {
        const { error } = await HT.supabase.auth.updateUser({ email: newLoginEmail });
        if (error) {
          HT.utils.showToast('Erro ao atualizar e-mail: ' + error.message, 'error');
          if (saveBtn) saveBtn.classList.remove('is-loading');
          return;
        }
        HT.utils.showToast('E-mail atualizado! Confirme no seu novo endereço.', 'success');
      }

      // Atualizar senha via Supabase Auth
      if (newPass) {
        const { error } = await HT.supabase.auth.updateUser({ password: newPass });
        if (error) {
          HT.utils.showToast('Erro ao atualizar senha: ' + error.message, 'error');
          if (saveBtn) saveBtn.classList.remove('is-loading');
          return;
        }
      }

      await updateSidebar();
      HT.modals.close('profileOverlay');
      HT.utils.showToast('Perfil atualizado com sucesso!', 'success');

    } catch (err) {
      HT.utils.showToast('Erro ao salvar perfil. Tente novamente.', 'error');
      console.error(err);
    } finally {
      if (saveBtn) saveBtn.classList.remove('is-loading');
    }
  }

  /* ====== Auto-init ====== */
  document.addEventListener('DOMContentLoaded', () => {
    injectModal();
    updateSidebar();

    document.getElementById('openProfileBtn')?.addEventListener('click', async () => {
      await openModal();
    });
  });

  return { openModal, updateSidebar };

})();
