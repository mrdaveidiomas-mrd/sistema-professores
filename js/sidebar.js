/* ==========================================================================
   SIDEBAR.JS — Comportamento do menu lateral + render condicional por papel
   ========================================================================== */

window.HT = window.HT || {};

HT.sidebar = (() => {

  /* Itens do menu — `roles` define quem vê */
  const NAV_ITEMS = [
    { href: '/dashboard/',       icon: 'fa-house',           label: 'Dashboard',       roles: ['admin','teacher'] },
    { href: '/alunos/',          icon: 'fa-user-graduate',   label: 'Alunos',          roles: ['admin','teacher'] },
    { href: '/turmas/',          icon: 'fa-users',           label: 'Turmas',          roles: ['admin','teacher'] },
    { href: '/frequencia/',      icon: 'fa-calendar-check',  label: 'Frequência',      roles: ['admin','teacher'] },
    { href: '/progresso/',       icon: 'fa-chart-line',      label: 'Progresso',       roles: ['admin','teacher'] },
    { href: '/disponibilidade/', icon: 'fa-calendar-days',   label: 'Disponibilidade', roles: ['admin','teacher'] },
    { href: '/materiais/',       icon: 'fa-folder-open',     label: 'Materiais',       roles: ['admin','teacher'] },
    { href: '/professores/',     icon: 'fa-chalkboard-user', label: 'Professores',     roles: ['admin']           },
    { href: '/financas/',        icon: 'fa-dollar-sign',     label: 'Finanças',        roles: ['admin','teacher'] },
  ];

  /** Extrai o segmento principal da URL: "/dashboard/" → "dashboard" */
  function currentSection() {
    return window.location.pathname.split('/').filter(Boolean)[0] || '';
  }

  async function renderMenu() {
    const list = document.querySelector('.sidebar-nav .nav-list');
    if (!list) return;

    let role = 'teacher';
    try { role = (await HT.auth?.getRole()) || 'teacher'; } catch {}

    const current = currentSection();

    const html = NAV_ITEMS
      .filter(it => it.roles.includes(role))
      .map(it => {
        const itemSection = it.href.split('/').filter(Boolean)[0] || '';
        const active = itemSection === current ? ' nav-item--active' : '';
        return `
          <li class="nav-item${active}">
            <a href="${it.href}" class="nav-link">
              <i class="fa-solid ${it.icon} nav-icon"></i>
              <span class="nav-label">${it.label}</span>
            </a>
          </li>`;
      }).join('');

    list.innerHTML = html;
  }

  function init() {
    const sidebar  = document.getElementById('sidebar');
    const overlay  = document.getElementById('sidebarOverlay');
    const toggle   = document.getElementById('sidebarToggle');
    const closeBtn = document.getElementById('sidebarClose');

    if (!sidebar) return;

    renderMenu();

    function open() {
      sidebar.classList.add('is-open');
      if (overlay) { overlay.classList.add('is-visible'); overlay.style.display = 'block'; }
      document.body.classList.add('sidebar-open');
    }
    function close() {
      sidebar.classList.remove('is-open');
      if (overlay) {
        overlay.classList.remove('is-visible');
        setTimeout(() => {
          if (!sidebar.classList.contains('is-open')) overlay.style.display = '';
        }, 300);
      }
      document.body.classList.remove('sidebar-open');
    }

    toggle?.addEventListener('click',  open);
    closeBtn?.addEventListener('click', close);
    overlay?.addEventListener('click',  close);

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && sidebar.classList.contains('is-open')) close();
    });
    window.addEventListener('resize', () => {
      if (window.innerWidth >= 768) close();
    });
  }

  document.addEventListener('DOMContentLoaded', init);

  return { init, renderMenu };
})();
