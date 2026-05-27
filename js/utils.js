/* ==========================================================================
   UTILS.JS — Funções utilitárias globais
   ========================================================================== */

window.HT = window.HT || {};

HT.utils = (() => {

  /* ---------- ID ---------- */
  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  /* ---------- Datas ---------- */
  function getCurrentDate() {
    return new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  }

  function getCurrentMonth() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  function formatDate(dateStr) {
    if (!dateStr) return '—';
    const [y, m, d] = dateStr.split('-');
    return `${d}/${m}/${y}`;
  }

  function formatMonthYear(monthStr) {
    if (!monthStr) return '—';
    const [y, m] = monthStr.split('-');
    const months = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                    'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
    return `${months[parseInt(m, 10) - 1]} ${y}`;
  }

  function parseMonthYear(monthStr) {
    const [y, m] = monthStr.split('-').map(Number);
    return { year: y, month: m };
  }

  function addMonths(monthStr, delta) {
    const [y, m] = monthStr.split('-').map(Number);
    const date = new Date(y, m - 1 + delta, 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }

  function isOverdue(dueDateStr, status) {
    if (status === 'paid') return false;
    if (!dueDateStr) return false;
    return dueDateStr < getCurrentDate();
  }

  /* ---------- Formatação ---------- */
  function formatCurrency(amount) {
    if (amount === null || amount === undefined || amount === '') return '—';
    return Number(amount).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function formatPhone(phone) {
    if (!phone) return '—';
    const digits = phone.replace(/\D/g, '');
    if (digits.length === 11)
      return `(${digits.slice(0,2)}) ${digits.slice(2,7)}-${digits.slice(7)}`;
    if (digits.length === 10)
      return `(${digits.slice(0,2)}) ${digits.slice(2,6)}-${digits.slice(6)}`;
    return phone;
  }

  const DAYS = {
    monday:    'Segunda-feira',
    tuesday:   'Terça-feira',
    wednesday: 'Quarta-feira',
    thursday:  'Quinta-feira',
    friday:    'Sexta-feira',
    saturday:  'Sábado',
    sunday:    'Domingo',
  };

  const DAYS_SHORT = {
    monday: 'Seg', tuesday: 'Ter', wednesday: 'Qua',
    thursday: 'Qui', friday: 'Sex', saturday: 'Sáb', sunday: 'Dom',
  };

  // Mapeamento de dia da semana (JS): 0=Dom,1=Seg,...,6=Sáb
  const DAY_NUMBERS = {
    sunday:0, monday:1, tuesday:2, wednesday:3,
    thursday:4, friday:5, saturday:6,
  };

  function formatDay(day)      { return DAYS[day] || day || '—'; }
  function formatDayShort(day) { return DAYS_SHORT[day] || day || '—'; }
  function getDayNumber(day)   { return DAY_NUMBERS[day] ?? -1; }

  const LEVELS = {
    'beginner':          'Beginner (A1)',
    'elementary':        'Elementary (A2)',
    'intermediate':      'Intermediate (B1)',
    'upper-intermediate':'Upper Intermediate (B2)',
    'advanced':          'Advanced (C1)',
    'proficient':        'Proficient (C2)',
  };

  const LEVELS_SHORT = {
    'beginner':          'A1',
    'elementary':        'A2',
    'intermediate':      'B1',
    'upper-intermediate':'B2',
    'advanced':          'C1',
    'proficient':        'C2',
  };

  function formatLevel(level) { return LEVELS[level] || level || '—'; }
  function formatLevelShort(level) { return LEVELS_SHORT[level] || ''; }

  const STATUSES = {
    present:   'Presente',
    absent:    'Ausente',
    justified: 'Falta justificada',
    makeup:    'Reposição',
    paid:      'Pago',
    pending:   'Pendente',
    overdue:   'Em atraso',
  };

  function formatStatus(status) { return STATUSES[status] || status || '—'; }

  const METHODS = {
    pix:      'PIX',
    cash:     'Dinheiro',
    transfer: 'Transferência',
    card:     'Cartão',
  };

  function formatMethod(method) { return METHODS[method] || method || '—'; }

  function getInitials(name) {
    if (!name) return '?';
    return name.trim().split(/\s+/)
      .slice(0, 2)
      .map(w => w[0].toUpperCase())
      .join('');
  }

  /* ---------- Badge HTML ---------- */
  function statusBadge(status) {
    const label = formatStatus(status);
    return `<span class="badge badge--${status}">${label}</span>`;
  }

  function levelBadge(level) {
    const label = formatLevel(level);
    return `<span class="level-badge level-badge--${level}">${label}</span>`;
  }

  /* ---------- Toast ---------- */
  let toastContainer = null;

  function showToast(message, type = 'default') {
    if (!toastContainer) {
      toastContainer = document.createElement('div');
      toastContainer.className = 'toast-container';
      document.body.appendChild(toastContainer);
    }

    const icons = {
      success: 'fa-circle-check',
      error:   'fa-circle-xmark',
      warning: 'fa-triangle-exclamation',
      default: 'fa-circle-info',
    };

    const toast = document.createElement('div');
    toast.className = `toast toast--${type}`;
    toast.innerHTML = `
      <i class="fa-solid ${icons[type] || icons.default} toast-icon"></i>
      <span class="toast-message">${message}</span>
      <button class="toast-close" aria-label="Fechar">
        <i class="fa-solid fa-xmark"></i>
      </button>`;

    toastContainer.appendChild(toast);

    toast.querySelector('.toast-close').addEventListener('click', () => removeToast(toast));

    setTimeout(() => removeToast(toast), 4000);
  }

  function removeToast(toast) {
    toast.style.animation = 'fadeIn .2s reverse both';
    setTimeout(() => toast.remove(), 200);
  }

  /* ---------- Debounce ---------- */
  function debounce(fn, delay = 300) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delay);
    };
  }

  /* ---------- Segurança ---------- */
  function escapeHTML(s) {
    return String(s ?? '').replace(/[&<>"']/g,
      c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  }

  /* ---------- DOM helpers ---------- */
  function qs(selector, context = document)  { return context.querySelector(selector); }
  function qsa(selector, context = document) { return [...context.querySelectorAll(selector)]; }

  function setTextContent(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function setInputValue(id, value) {
    const el = document.getElementById(id);
    if (el) el.value = value ?? '';
  }

  function getInputValue(id) {
    const el = document.getElementById(id);
    return el ? el.value.trim() : '';
  }

  function show(el) { if (el) el.classList.remove('d-none'); }
  function hide(el) { if (el) el.classList.add('d-none'); }
  function toggle(el, condition) { condition ? show(el) : hide(el); }

  /* ---------- Exportar ---------- */
  return {
    generateId, getCurrentDate, getCurrentMonth,
    formatDate, formatMonthYear, parseMonthYear, addMonths, isOverdue,
    formatCurrency, formatPhone, formatDay, formatDayShort, getDayNumber,
    formatLevel, formatLevelShort, formatStatus, formatMethod, getInitials,
    statusBadge, levelBadge, showToast,
    escapeHTML,
    debounce, qs, qsa, setTextContent, setInputValue, getInputValue,
    show, hide, toggle,
  };
})();
