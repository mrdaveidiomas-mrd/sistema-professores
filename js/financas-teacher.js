/* ==========================================================================
   FINANCAS-TEACHER.JS — Renderiza a view de payout do professor.
   - Detecta papel: se 'admin', não faz nada (financas.js cuida).
   - Se 'teacher', esconde view admin, mostra view teacher e calcula payout
     do mês exibido no seletor de período.
   - Cada sessão de turma (date + class_id) conta como UMA aula paga,
     independente do número de alunos. Aulas individuais (sem turma) contam
     por registro.
   ========================================================================== */

(() => {

  function fmtBR(n) { return Number(n || 0).toFixed(2).replace('.', ','); }

  const escapeHTML = s => HT.utils.escapeHTML(s);

  const STATUS_LABEL = {
    present:   'Presente',
    absent:    'Falta',
    justified: 'Justificada',
    makeup:    'Reposição',
  };

  /* Mês em foco — sincroniza com o período exibido no topo */
  let currentMonth = new Date();
  currentMonth.setDate(1);

  function periodBounds(d) {
    const y = d.getFullYear(), m = d.getMonth();
    const from = `${y}-${String(m+1).padStart(2,'0')}-01`;
    const last = new Date(y, m+1, 0).getDate();
    const to   = `${y}-${String(m+1).padStart(2,'0')}-${String(last).padStart(2,'0')}`;
    return { from, to, label: d.toLocaleDateString('pt-BR', { month:'long', year:'numeric' }) };
  }

  function setPeriodLabel(label) {
    const el = document.getElementById('currentPeriod');
    if (el) el.textContent = label.charAt(0).toUpperCase() + label.slice(1);
  }

  async function render() {
    const { from, to, label } = periodBounds(currentMonth);
    setPeriodLabel(label);

    const data = await HT.payouts.getMyPayout({ from, to });

    /* Cards de resumo */
    document.getElementById('payoutTotal').textContent        = `R$ ${fmtBR(data.total)}`;
    document.getElementById('payoutCount').textContent        = data.count;
    document.getElementById('payoutTotalLessons').textContent = data.items.length;
    document.getElementById('payoutJustified').textContent    = data.justifiedCount;

    /* Por turma / aula */
    const byBody = document.getElementById('payoutByStudentBody');
    if (!data.byClass.length) {
      byBody.innerHTML = `<tr class="empty-row"><td colspan="3">
        <div class="empty-state empty-state--sm"><p>Sem aulas no período.</p></div></td></tr>`;
    } else {
      byBody.innerHTML = data.byClass
        .sort((a, b) => b.total - a.total)
        .map(c => {
          const label = c.isIndividual
            ? `<em>${escapeHTML(c.studentName)}</em> <span class="text-muted text-small">(individual)</span>`
            : escapeHTML(c.className);
          return `<tr>
            <td>${label}</td>
            <td>${c.count}</td>
            <td><strong>R$ ${fmtBR(c.total)}</strong></td>
          </tr>`;
        }).join('');
    }

    /* Aulas detalhadas */
    const itemsBody = document.getElementById('payoutItemsBody');
    if (!data.items.length) {
      itemsBody.innerHTML = `<tr class="empty-row"><td colspan="4">
        <div class="empty-state empty-state--sm"><p>Sem aulas no período.</p></div></td></tr>`;
    } else {
      itemsBody.innerHTML = data.items.map(i => {
        const who = i.isSession
          ? `${escapeHTML(i.label)} <span class="text-muted text-small">(${i.studentCount} aluno${i.studentCount !== 1 ? 's' : ''})</span>`
          : escapeHTML(i.label);
        return `
          <tr>
            <td>${i.date.split('-').reverse().join('/')}</td>
            <td>${who}</td>
            <td>${STATUS_LABEL[i.status] || i.status}</td>
            <td>${i.paid ? `R$ ${fmtBR(i.rate)}` : '<span style="opacity:.6">—</span>'}</td>
          </tr>`;
      }).join('');
    }
  }

  function bindPeriodNav() {
    document.getElementById('prevMonthBtn')?.addEventListener('click', () => {
      currentMonth.setMonth(currentMonth.getMonth() - 1);
      render();
    });
    document.getElementById('nextMonthBtn')?.addEventListener('click', () => {
      currentMonth.setMonth(currentMonth.getMonth() + 1);
      render();
    });
  }

  document.addEventListener('DOMContentLoaded', async () => {
    let role = 'teacher';
    try { role = (await HT.auth?.getRole()) || 'teacher'; } catch {}

    if (role !== 'teacher') return;  /* admin: financas.js já cuida */

    /* Mostra a view do professor (HTML usa display:none por default p/ evitar FOUC
       no admin). ui-roles.js cuida de esconder #adminFinanceView via data-admin-only. */
    document.getElementById('teacherFinanceView').style.display = '';
    document.getElementById('addPaymentBtn')?.style.setProperty('display', 'none');

    bindPeriodNav();
    try { await render(); } catch (err) {
      console.error('Erro ao calcular payout:', err);
    }
  });

})();
