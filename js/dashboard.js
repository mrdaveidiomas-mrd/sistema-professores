/* ==========================================================================
   DASHBOARD.JS — Lógica da página principal
   ========================================================================== */

document.addEventListener('DOMContentLoaded', async () => {

  const { utils, storage, calendar } = HT;

  /* ---------- Data atual no topbar ---------- */
  const dateEl = document.getElementById('currentDate');
  if (dateEl) {
    dateEl.textContent = new Date().toLocaleDateString('pt-BR', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });
  }

  /* ---------- Carregar dados por papel ---------- */
  const month = utils.getCurrentMonth();
  const role  = await HT.auth.getRole();

  let students, classes;
  let attendance = []; /* admin: usado em monthAtt para o card "Aulas" */
  let payments   = []; /* admin: pagamentos recebidos */

  if (role === 'admin') {
    [students, classes, attendance, payments] = await Promise.all([
      storage.getStudents(),
      storage.getClasses(),
      storage.getAttendance(),
      storage.getPayments(),
    ]);
  } else {
    /* Professor: usa HT.payouts.getMyPayout para stats — não precisa de attendance global */
    [students, classes] = await Promise.all([
      storage.getStudents(),
      storage.getClasses(),
    ]);
  }

  /* Injeta dados no calendar para evitar chamadas duplicadas ao Supabase */
  calendar.setData(students, classes);

  /* ---------- Cards de resumo ---------- */
  async function loadStats() {
    utils.setTextContent('statStudents', students.length);
    utils.setTextContent('statClasses',  classes.length);

    if (role === 'admin') {
      /* Admin: frequência = total de registros individuais */
      const monthAtt = attendance.filter(r => r.date.startsWith(month));
      utils.setTextContent('statLessons', monthAtt.length);

      /* Admin: receita = pagamentos com status "paid" no mês */
      const monthPaid = payments.filter(p => p.reference === month && p.status === 'paid');
      const revenue   = monthPaid.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
      utils.setTextContent('statRevenue', utils.formatCurrency(revenue));

    } else {
      /* ── Professor ── usa a mesma lógica do painel de Finanças (HT.payouts) ── */
      const y    = new Date().getFullYear();
      const m    = new Date().getMonth();
      const from = `${y}-${String(m + 1).padStart(2, '0')}-01`;
      const last = new Date(y, m + 1, 0).getDate();
      const to   = `${y}-${String(m + 1).padStart(2, '0')}-${String(last).padStart(2, '0')}`;

      const payout = await HT.payouts.getMyPayout({ from, to });

      utils.setTextContent('statLessons', payout.items.length);
      utils.setTextContent('statRevenue', utils.formatCurrency(payout.total));

      /* Atualizar label e link do card */
      const labelEl = document.getElementById('statRevenueLabel');
      const cardEl  = document.getElementById('statRevenueCard');
      if (labelEl) labelEl.textContent = 'Pagamento do Mês';
      if (cardEl)  cardEl.href = 'financas.html';
    }
  }

  /* ---------- Próximas aulas ---------- */
  async function loadUpcoming() {
    const container = document.getElementById('upcomingList');
    if (!container) return;

    const upcoming = await calendar.getUpcoming(6);

    if (!upcoming.length) {
      container.innerHTML = `
        <div class="empty-state">
          <i class="fa-regular fa-calendar-xmark empty-state-icon"></i>
          <p>Nenhuma aula agendada</p>
        </div>`;
      return;
    }

    container.innerHTML = upcoming.map(ev => {
      const dt      = new Date(ev.start);
      const time    = dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      const date    = dt.toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' });
      const isToday = ev.start.startsWith(utils.getCurrentDate());

      const levelShort = utils.formatLevelShort(ev.extendedProps.level);
      const typeLabel  = ev.extendedProps.type === 'class' ? 'Turma' : 'Individual';
      const subLabel   = levelShort || (ev.extendedProps.type === 'class' ? 'Turma' : '—');

      return `
        <div class="upcoming-item">
          <div class="upcoming-time">${isToday ? 'Hoje' : date}<br>${time}</div>
          <div class="upcoming-info">
            <div class="upcoming-name">${ev.title}</div>
            <div class="upcoming-class">${subLabel}</div>
          </div>
          <span class="upcoming-badge">${typeLabel}</span>
        </div>`;
    }).join('');
  }

  /* ---------- Pendentes de reposição ---------- */
  async function loadPendingMakeups() {
    const section = document.getElementById('pendingMakeupsSection');
    const list    = document.getElementById('pendingMakeupsList');
    if (!section || !list) return;

    try {
      const pending = await storage.getPendingMakeups();
      if (!pending.length) { section.hidden = true; return; }

      const studentMap = Object.fromEntries(students.map(s => [s.id, s]));
      const items = pending
        .map(p => ({ ...p, student: studentMap[p.studentId] }))
        .filter(p => p.student)
        .sort((a, b) => a.oldestUnpaid.localeCompare(b.oldestUnpaid))
        .slice(0, 8);

      if (!items.length) { section.hidden = true; return; }

      list.innerHTML = items.map(p => `
        <div class="upcoming-item">
          <div class="upcoming-time" style="color:var(--color-warning)">
            <i class="fa-solid fa-rotate-right"></i><br>
            <strong style="font-size:1.1rem">${p.owed}</strong>
          </div>
          <div class="upcoming-info">
            <div class="upcoming-name">${utils.escapeHTML(p.student.name)}</div>
            <div class="upcoming-class">Falta justificada desde ${utils.formatDate(p.oldestUnpaid)}</div>
          </div>
          <span class="upcoming-badge" style="background:rgba(180,83,9,.12);color:#b45309">
            ${p.owed} ${p.owed === 1 ? 'pendente' : 'pendentes'}
          </span>
        </div>`).join('');
      section.hidden = false;
    } catch (err) {
      console.error('Erro ao carregar pendentes de reposição:', err);
      section.hidden = true;
    }
  }

  /* ---------- Init ---------- */
  await loadStats();
  await Promise.all([
    calendar.init('calendar'),
    loadUpcoming(),
    loadPendingMakeups(),
  ]);
});
