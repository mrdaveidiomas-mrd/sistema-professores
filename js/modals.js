/* ==========================================================================
   MODALS.JS — Abertura/fechamento de modais + utilitário confirm()
   ========================================================================== */

window.HT = window.HT || {};

HT.modals = (() => {

  const openModals = new Set();

  const FOCUSABLE = [
    'a[href]', 'button:not([disabled])', 'input:not([disabled])',
    'select:not([disabled])', 'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(',');

  /* ---------- Focus trap ---------- */
  function _trapFocus(overlay, e) {
    const els = [...overlay.querySelectorAll(FOCUSABLE)].filter(el => !el.closest('[aria-hidden="true"]'));
    if (!els.length) return;
    const first = els[0];
    const last  = els[els.length - 1];
    if (e.shiftKey) {
      if (document.activeElement === first) { e.preventDefault(); last.focus(); }
    } else {
      if (document.activeElement === last)  { e.preventDefault(); first.focus(); }
    }
  }

  function _onKeyDown(e) {
    if (e.key !== 'Tab' || openModals.size === 0) return;
    const lastId  = [...openModals].pop();
    const overlay = document.getElementById(lastId);
    if (overlay) _trapFocus(overlay, e);
  }

  document.addEventListener('keydown', _onKeyDown);

  /* ---------- Abrir / fechar ---------- */
  function open(overlayId) {
    const overlay = document.getElementById(overlayId);
    if (!overlay) return;
    overlay.setAttribute('aria-hidden', 'false');
    overlay.classList.add('is-open');
    openModals.add(overlayId);
    document.body.style.overflow = 'hidden';

    setTimeout(() => {
      const focusable = overlay.querySelector(FOCUSABLE);
      focusable?.focus();
    }, 250);
  }

  function close(overlayId) {
    const overlay = document.getElementById(overlayId);
    if (!overlay) return;
    overlay.setAttribute('aria-hidden', 'true');
    overlay.classList.remove('is-open');
    openModals.delete(overlayId);
    if (openModals.size === 0) document.body.style.overflow = '';
  }

  function closeAll() {
    [...openModals].forEach(id => close(id));
  }

  function isOpen(overlayId) {
    return openModals.has(overlayId);
  }

  /* ---------- Fechar ao clicar fora ---------- */
  document.addEventListener('click', (e) => {
    if (!e.target.classList.contains('modal-overlay')) return;
    const overlay = e.target;
    if (overlay.id) close(overlay.id);
  });

  /* ---------- Fechar com Escape ---------- */
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || openModals.size === 0) return;
    const last = [...openModals].pop();
    close(last);
  });

  /* ---------- Bind automático de botões .modal-close ---------- */
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.modal-close').forEach(btn => {
      btn.addEventListener('click', () => {
        const overlay = btn.closest('.modal-overlay');
        if (overlay?.id) close(overlay.id);
      });
    });
  });

  /* ---------- confirm() assíncrono (substitui window.confirm) ---------- */
  let _confirmOverlay = null;

  function _buildConfirmOverlay() {
    if (document.getElementById('htConfirmOverlay')) return;

    const el = document.createElement('div');
    el.id        = 'htConfirmOverlay';
    el.className = 'modal-overlay';
    el.setAttribute('role',       'alertdialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-labelledby', 'htConfirmTitle');
    el.setAttribute('aria-describedby','htConfirmMessage');
    el.setAttribute('aria-hidden', 'true');

    el.innerHTML = `
      <div class="modal" style="max-width:420px">
        <div class="modal-header">
          <h2 class="modal-title" id="htConfirmTitle">Confirmar</h2>
        </div>
        <div class="modal-body">
          <p id="htConfirmMessage" style="margin:0;line-height:1.6"></p>
        </div>
        <div class="modal-footer" style="display:flex;gap:8px;justify-content:flex-end">
          <button id="htConfirmCancel" class="btn btn--ghost">Cancelar</button>
          <button id="htConfirmOk"     class="btn btn--danger">Confirmar</button>
        </div>
      </div>`;

    document.body.appendChild(el);
    _confirmOverlay = el;
  }

  function confirm(message, { title = 'Confirmar', okLabel = 'Confirmar', okClass = 'btn--danger' } = {}) {
    return new Promise(resolve => {
      _buildConfirmOverlay();

      const overlay = document.getElementById('htConfirmOverlay');
      document.getElementById('htConfirmTitle').textContent   = title;
      document.getElementById('htConfirmMessage').textContent = message;

      const okBtn     = document.getElementById('htConfirmOk');
      const cancelBtn = document.getElementById('htConfirmCancel');

      okBtn.className = `btn ${okClass}`;
      okBtn.textContent = okLabel;

      function cleanup(result) {
        okBtn.removeEventListener('click', onOk);
        cancelBtn.removeEventListener('click', onCancel);
        overlay.removeEventListener('click', onBackdrop);
        document.removeEventListener('keydown', onEsc);
        close('htConfirmOverlay');
        resolve(result);
      }

      function onOk()      { cleanup(true);  }
      function onCancel()  { cleanup(false); }
      function onBackdrop(e) { if (e.target === overlay) cleanup(false); }
      function onEsc(e)    { if (e.key === 'Escape') cleanup(false); }

      okBtn.addEventListener('click',     onOk);
      cancelBtn.addEventListener('click', onCancel);
      overlay.addEventListener('click',   onBackdrop);
      document.addEventListener('keydown',onEsc);

      open('htConfirmOverlay');
      setTimeout(() => okBtn.focus(), 250);
    });
  }

  return { open, close, closeAll, isOpen, confirm };
})();
