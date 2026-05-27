/* ==========================================================================
   UI-ROLES.JS — aplica visibilidade por papel
   - Adiciona <body data-role="admin|teacher">
   - Esconde elementos com [data-admin-only] quando o papel for teacher
   - Esconde elementos com [data-teacher-only] quando o papel for admin
   - Lista de IDs admin-only fixa para páginas existentes (sem editar HTML)
   ========================================================================== */

window.HT = window.HT || {};

HT.uiRoles = (() => {

  /* Ações que SÓ admin pode fazer (botões/elementos por id) */
  const ADMIN_ONLY_IDS = [
    'addStudentBtn', 'addFirstStudentBtn',
    'editStudentBtn', 'deleteStudentBtn',
    'addClassBtn',  'addFirstClassBtn',
    'editClassBtn', 'deleteClassBtn',
    'addPaymentBtn','addFirstPaymentBtn',
  ];

  async function apply() {
    let role = 'teacher';
    try { role = (await HT.auth?.getRole()) || 'teacher'; } catch {}
    document.body.dataset.role = role;

    if (role === 'teacher') {
      ADMIN_ONLY_IDS.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
      });
      document.querySelectorAll('[data-admin-only]').forEach(el => el.style.display = 'none');
    } else {
      document.querySelectorAll('[data-teacher-only]').forEach(el => el.style.display = 'none');
    }
  }

  document.addEventListener('DOMContentLoaded', () => { apply(); });

  return { apply };
})();
