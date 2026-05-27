/* ==========================================================================
   THEME.JS — Gerenciamento de tema (claro / escuro) e painel de configurações
   ========================================================================== */

window.HT = window.HT || {};

HT.theme = (() => {

  const KEY   = 'ht_theme';
  const DARK  = 'dark';
  const LIGHT = 'light';

  /* ====== Aplicar tema ====== */
  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(KEY, theme);
    _syncToggle(theme);
  }

  function getTheme() {
    return localStorage.getItem(KEY) || LIGHT;
  }

  function _syncToggle(theme) {
    const el = document.getElementById('darkModeToggle');
    if (el) el.checked = (theme === DARK);
  }

  /* ====== Painel de configurações ====== */
  let _panelOpen = false;
  let _resizeHandler = null;

  function _buildPanel() {
    const existing = document.getElementById('settingsPanel');
    if (existing) existing.remove();

    const panel = document.createElement('div');
    panel.id        = 'settingsPanel';
    panel.className = 'settings-panel';
    panel.setAttribute('role',       'dialog');
    panel.setAttribute('aria-label', 'Configurações');
    panel.setAttribute('aria-hidden','true');

    panel.innerHTML = `
      <div class="settings-panel-header">
        <span class="settings-panel-title">
          <i class="fa-solid fa-gear"></i>
          Configurações
        </span>
        <button class="settings-panel-close" id="settingsPanelClose" aria-label="Fechar">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>

      <div class="settings-panel-body">

        <div class="settings-section">
          <p class="settings-section-label">Aparência</p>

          <div class="settings-item">
            <div class="settings-item-info">
              <span class="settings-item-label">
                <i class="fa-solid fa-circle-half-stroke"></i>
                Tema escuro
              </span>
              <span class="settings-item-desc">Modo noturno</span>
            </div>
            <label class="toggle-switch" aria-label="Ativar tema escuro">
              <input type="checkbox" id="darkModeToggle" />
              <span class="toggle-slider"></span>
            </label>
          </div>
        </div>

        <div class="settings-section" style="border-top: 1px solid rgba(255,255,255,.1); padding-top: 16px; margin-top: 16px;">
          <p class="settings-section-label">Sessão</p>

          <button id="settingsLogoutBtn" class="settings-logout-btn" style="width: 100%; padding: 10px 14px; background: rgba(220, 38, 38, .15); color: #dc2626; border: 1px solid rgba(220, 38, 38, .3); border-radius: 6px; font-size: .875rem; font-weight: 600; cursor: pointer; transition: all 150ms ease; display: flex; align-items: center; justify-content: center; gap: 8px; margin-top: 8px;">
            <i class="fa-solid fa-right-from-bracket"></i>
            Sair do sistema
          </button>
        </div>

      </div>
    `;

    document.body.appendChild(panel);

    /* Fechar */
    document.getElementById('settingsPanelClose')
      ?.addEventListener('click', closePanel);

    /* Toggle de tema */
    const toggle = document.getElementById('darkModeToggle');
    if (toggle) {
      toggle.checked = (getTheme() === DARK);
      toggle.addEventListener('change', () => {
        applyTheme(toggle.checked ? DARK : LIGHT);
      });
    }

    /* Logout */
    const logoutBtn = document.getElementById('settingsLogoutBtn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => {
        if (window.HT?.auth?.logout) {
          window.HT.auth.logout();
        }
      });
    }

    return panel;
  }

  function _position(panel) {
    const btn  = document.getElementById('settingsBtn');
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    /* Aparece acima do botão, alinhado à esquerda da sidebar */
    panel.style.bottom = `${window.innerHeight - rect.top + 8}px`;
    panel.style.left   = `${rect.left}px`;
    panel.style.width  = `${Math.min(rect.width + 220, 264)}px`;
  }

  function openPanel() {
    const panel = _buildPanel();
    _position(panel);
    _syncToggle(getTheme());

    requestAnimationFrame(() => {
      panel.classList.add('settings-panel--open');
      panel.setAttribute('aria-hidden', 'false');
    });

    _panelOpen = true;
    setTimeout(() => {
      document.addEventListener('click', _outsideClick);
      _resizeHandler = () => _position(document.getElementById('settingsPanel'));
      window.addEventListener('resize', _resizeHandler);
    }, 50);
  }

  function closePanel() {
    const panel = document.getElementById('settingsPanel');
    if (!panel) return;
    panel.classList.remove('settings-panel--open');
    panel.setAttribute('aria-hidden', 'true');
    _panelOpen = false;
    document.removeEventListener('click', _outsideClick);
    if (_resizeHandler) {
      window.removeEventListener('resize', _resizeHandler);
      _resizeHandler = null;
    }
  }

  function _outsideClick(e) {
    const panel = document.getElementById('settingsPanel');
    const btn   = document.getElementById('settingsBtn');
    if (panel && !panel.contains(e.target) && !btn?.contains(e.target)) {
      closePanel();
    }
  }

  /* ====== Inicialização ====== */
  function init() {
    /* Aplica o tema salvo imediatamente (o inline script já fez isso no <head>,
       aqui sincronizamos os elementos de UI após o DOM estar pronto) */
    document.addEventListener('DOMContentLoaded', () => {
      applyTheme(getTheme());

      document.getElementById('settingsBtn')
        ?.addEventListener('click', (e) => {
          e.stopPropagation();
          _panelOpen ? closePanel() : openPanel();
        });
    });
  }

  init();

  return { applyTheme, getTheme, openPanel, closePanel };

})();
