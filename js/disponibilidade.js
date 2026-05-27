/* ==========================================================================
   DISPONIBILIDADE.JS — Calendário de disponibilidade (admin e professor)
   =========================================================================
   PROFESSOR: calendário editável com slots manuais + aulas dos seus alunos.
   ADMIN:     abas por professor, cada uma mostrando o calendário do prof.
   ========================================================================== */

window.HT = window.HT || {};

HT.disponibilidade = (() => {

  /* ── constantes de cor ── */
  const COLOR = {
    student:   { bg: '#032d6f', border: '#021d4a' },
    available: { bg: '#16a34a', border: '#15803d' },
    blocked:   { bg: '#dc2626', border: '#b91c1c' },
  };

  const DAY_NAMES = ['domingo','segunda','terça','quarta','quinta','sexta','sábado'];

  /* ── estado ── */
  let calendar    = null;
  let role        = 'teacher';
  let teachers    = [];
  let activeTeacherId = null;   /* null = próprio professor */
  let isAdminViewingTeacher = false;

  /* ── DOM helpers ── */
  const $ = id => document.getElementById(id);

  /* ====================================================================
     CONSTRUÇÃO DE EVENTOS
     ==================================================================== */

  /**
   * Converte entradas de alunos/turmas em eventos recorrentes do FullCalendar.
   * Cada entrada pode ser { type:'class', classId, label, schedules }
   * ou { type:'student', studentId, label, schedules }.
   */
  function buildStudentEvents(entries) {
    const events = [];
    entries.forEach(entry => {
      const { type, label, schedules } = entry;
      const idPrefix = type === 'class'
        ? `class_${entry.classId}`
        : `student_${entry.studentId || label}`;

      (schedules || []).forEach(sc => {
        if (!sc.day || !sc.time) return;
        const dayNum = HT.utils.getDayNumber(sc.day);
        if (dayNum < 0) return;
        const dur     = sc.duration || 60;
        const [h, m]  = sc.time.split(':').map(Number);
        const endMin  = h * 60 + m + dur;
        const endTime = `${String(Math.floor(endMin / 60)).padStart(2,'0')}:${String(endMin % 60).padStart(2,'0')}`;

        events.push({
          id:              `${idPrefix}_${sc.day}_${sc.time}`,
          title:           label,
          daysOfWeek:      [dayNum],
          startTime:       sc.time.length === 5 ? sc.time : sc.time.slice(0, 5),
          endTime,
          backgroundColor: COLOR.student.bg,
          borderColor:     COLOR.student.border,
          textColor:       '#fff',
          editable:        false,
          extendedProps:   {
            type:        'student',
            isClass:     type === 'class',
            classId:     entry.classId || null,
            studentName: label,
            day:         sc.day,
            time:        sc.time,
            duration:    dur,
          },
        });
      });
    });
    return events;
  }

  /* Converte registros de teacher_availability em eventos do FullCalendar */
  function buildAvailEvents(slots, editable = true) {
    return slots.map(s => {
      const colors = COLOR[s.type] || COLOR.available;
      const base = {
        id:              s.id,
        title:           s.title || (s.type === 'available' ? 'Disponível' : 'Indisponível'),
        backgroundColor: colors.bg,
        borderColor:     colors.border,
        textColor:       '#fff',
        editable,
        extendedProps:   { type: 'availability', slot: s },
      };
      if (s.isRecurring) {
        return { ...base, daysOfWeek: [s.dayOfWeek], startTime: s.startTime, endTime: s.endTime };
      }
      return {
        ...base,
        start: `${s.specificDate}T${s.startTime}`,
        end:   `${s.specificDate}T${s.endTime}`,
      };
    });
  }

  /* ====================================================================
     CARREGAMENTO DE EVENTOS
     ==================================================================== */

  async function loadEvents(teacherId) {
    const [studentSchedules, availSlots] = await Promise.all([
      HT.storage.getTeacherStudentSchedules(teacherId || undefined),
      HT.storage.getAvailability(teacherId || undefined),
    ]);
    const editable = !isAdminViewingTeacher; /* admin vê read-only */
    return [
      ...buildStudentEvents(studentSchedules),
      ...buildAvailEvents(availSlots, editable),
    ];
  }

  async function refreshCalendar() {
    if (!calendar) return;
    calendar.removeAllEvents();
    try {
      const events = await loadEvents(activeTeacherId);
      events.forEach(e => calendar.addEvent(e));
    } catch (err) {
      console.error('Erro ao carregar eventos:', err);
    }
  }

  /* ====================================================================
     MODAL DE SLOT DE DISPONIBILIDADE
     ==================================================================== */

  /* ── helpers de dia ── */

  /** Mostra o picker de dias correto: 'multi' (criar) ou 'single' (editar) */
  function showDayMode(mode) {
    $('recurringDaysMulti').style.display  = mode === 'multi'  ? '' : 'none';
    $('recurringDaySingle').style.display  = mode === 'single' ? '' : 'none';
  }

  /** Ativa o pill do dia `day` (string "0"–"6") */
  function activateDayPill(day) {
    const btn = $('availDaysGrid')?.querySelector(`[data-day="${day}"]`);
    if (btn) { btn.classList.add('active'); btn.setAttribute('aria-pressed', 'true'); }
  }

  /** Retorna array de numbers com os dias ativos nos pills */
  function getSelectedDays() {
    return Array.from($('availDaysGrid').querySelectorAll('.avail-day-btn.active'))
                .map(b => Number(b.dataset.day));
  }

  function clearModal() {
    $('availId').value          = '';
    $('availTitle').value       = '';
    $('availType').value        = 'available';
    $('availRecurring').checked = true;
    $('availDate').value        = '';
    $('availStart').value       = '';
    $('availEnd').value         = '';
    $('availNotes').value       = '';
    $('availAlert').textContent    = '';
    $('availAlert').className      = 'login-alert';
    $('availStartError').textContent = '';
    $('availEndError').textContent   = '';
    $('availDayError') && ($('availDayError').textContent = '');
    $('availDeleteBtn').style.display = 'none';
    /* Limpar pills */
    $('availDaysGrid')?.querySelectorAll('.avail-day-btn').forEach(b => {
      b.classList.remove('active'); b.setAttribute('aria-pressed', 'false');
    });
    toggleRecurringFields(true);
  }

  function toggleRecurringFields(recurring) {
    $('recurringFields').style.display = recurring ? '' : 'none';
    $('specificFields').style.display  = recurring ? 'none' : '';
  }

  function openCreate({ startStr, dayOfWeek } = {}) {
    clearModal();
    $('availModalTitle').textContent = 'Novo Horário';
    showDayMode('multi');

    if (startStr) {
      const dt = new Date(startStr);
      $('availStart').value = startStr.slice(11, 16) || '';
      if (startStr.length > 10) activateDayPill(String(dt.getDay()));
    }
    if (dayOfWeek !== undefined) activateDayPill(String(dayOfWeek));
    HT.modals.open('availModalOverlay');
  }

  function openEdit(slot) {
    clearModal();
    $('availModalTitle').textContent  = 'Editar Horário';
    $('availId').value                = slot.id;
    $('availTitle').value             = slot.title || '';
    $('availType').value              = slot.type;
    $('availRecurring').checked       = slot.isRecurring;
    $('availDate').value              = slot.specificDate || '';
    $('availStart').value             = (slot.startTime || '').slice(0, 5);
    $('availEnd').value               = (slot.endTime   || '').slice(0, 5);
    $('availNotes').value             = slot.notes || '';
    $('availDeleteBtn').style.display = '';

    if (slot.isRecurring) {
      showDayMode('single');
      $('availDay').value = String(slot.dayOfWeek ?? new Date().getDay());
    }
    toggleRecurringFields(slot.isRecurring);
    HT.modals.open('availModalOverlay');
  }

  async function onSave(e) {
    e.preventDefault();
    $('availStartError').textContent = '';
    $('availEndError').textContent   = '';
    if ($('availDayError')) $('availDayError').textContent = '';

    const startVal  = $('availStart').value;
    const endVal    = $('availEnd').value;
    const isRecurring = $('availRecurring').checked;
    const isEditing   = !!$('availId').value;

    /* Validar horários */
    let valid = true;
    if (!startVal) { $('availStartError').textContent = 'Informe o horário de início.'; valid = false; }
    if (!endVal)   { $('availEndError').textContent   = 'Informe o horário de fim.';   valid = false; }
    if (startVal && endVal && startVal >= endVal) {
      $('availEndError').textContent = 'O fim deve ser depois do início.'; valid = false;
    }
    if (!valid) return;

    /* Validar dias selecionados (apenas no modo multi/criar) */
    let selectedDays = [];
    if (isRecurring) {
      if (isEditing) {
        selectedDays = [Number($('availDay').value)];
      } else {
        selectedDays = getSelectedDays();
        if (!selectedDays.length) {
          $('availDayError').textContent = 'Selecione ao menos um dia da semana.';
          return;
        }
      }
    }

    const baseData = {
      title:        $('availTitle').value.trim() || null,
      type:         $('availType').value,
      isRecurring,
      specificDate: isRecurring ? null : ($('availDate').value || null),
      startTime:    startVal,
      endTime:      endVal,
      notes:        $('availNotes').value.trim() || null,
    };

    $('availSaveBtn').classList.add('is-loading');
    try {
      if (isEditing) {
        /* Edição: salva registro único */
        await HT.storage.saveAvailability({
          ...baseData,
          id:        $('availId').value,
          dayOfWeek: isRecurring ? selectedDays[0] : null,
        });
        HT.modals.close('availModalOverlay');
        HT.utils.showToast('Horário atualizado!', 'success');

      } else if (isRecurring && selectedDays.length > 1) {
        /* Criação com múltiplos dias: salva sequencialmente para evitar
           concorrência no lock de autenticação do Supabase */
        for (const day of selectedDays) {
          await HT.storage.saveAvailability({ ...baseData, dayOfWeek: day });
        }
        HT.modals.close('availModalOverlay');
        HT.utils.showToast(
          `${selectedDays.length} horários adicionados!`, 'success'
        );

      } else {
        /* Criação simples (dia único ou data específica) */
        await HT.storage.saveAvailability({
          ...baseData,
          dayOfWeek: isRecurring ? selectedDays[0] : null,
        });
        HT.modals.close('availModalOverlay');
        HT.utils.showToast('Horário adicionado!', 'success');
      }

      await refreshCalendar();
    } catch (err) {
      $('availAlert').textContent = err.message || 'Erro ao salvar.';
      $('availAlert').className   = 'login-alert error';
    } finally {
      $('availSaveBtn').classList.remove('is-loading');
    }
  }

  async function onDelete() {
    const id = $('availId').value;
    if (!id) return;
    const ok = await HT.modals.confirm('Excluir este horário?', { okLabel: 'Excluir' });
    if (!ok) return;
    try {
      await HT.storage.deleteAvailability(id);
      HT.modals.close('availModalOverlay');
      HT.utils.showToast('Horário removido.', 'warning');
      await refreshCalendar();
    } catch (err) {
      $('availAlert').textContent = err.message || 'Erro ao excluir.';
      $('availAlert').className   = 'login-alert error';
    }
  }

  /* ====================================================================
     MODAL INFO DO ALUNO (somente leitura)
     ==================================================================== */

  function openStudentInfo(info) {
    const { studentName, day, time, duration, isClass } = info;
    const icon = isClass
      ? '<i class="fa-solid fa-users" style="margin-right:6px;opacity:.7"></i>'
      : '<i class="fa-solid fa-user" style="margin-right:6px;opacity:.7"></i>';
    $('seTitle').textContent    = studentName;
    $('seStudent').innerHTML    = `${icon}${escapeHTML(studentName)}`;
    const dayLabel = DAY_NAMES[HT.utils.getDayNumber(day)] || day;
    $('seTime').textContent     = `${dayLabel.charAt(0).toUpperCase() + dayLabel.slice(1)} · ${time} (${duration} min)`;
    HT.modals.open('studentEventOverlay');
  }

  /* ====================================================================
     ABAS DE PROFESSORES (admin)
     ==================================================================== */

  function renderTeacherTabs() {
    const wrap = $('teacherTabsWrap');
    const tabs  = $('teacherTabs');
    if (!teachers.length) { wrap.style.display = 'none'; return; }
    wrap.style.display = '';

    tabs.innerHTML = teachers.map(t => `
      <button class="app-tab${activeTeacherId === t.id ? ' app-tab--active' : ''}"
              data-teacher-id="${t.id}" role="tab"
              aria-selected="${activeTeacherId === t.id}">
        ${escapeHTML(t.name || t.email)}
      </button>
    `).join('');

    tabs.querySelectorAll('.app-tab').forEach(btn => {
      btn.addEventListener('click', async () => {
        activeTeacherId      = btn.dataset.teacherId;
        isAdminViewingTeacher = true;
        tabs.querySelectorAll('.app-tab').forEach(b => {
          b.classList.toggle('app-tab--active', b === btn);
          b.setAttribute('aria-selected', b === btn ? 'true' : 'false');
        });
        await refreshCalendar();
      });
    });
  }

  const escapeHTML = s => HT.utils.escapeHTML(s);

  /* ====================================================================
     INICIALIZAÇÃO DO FULLCALENDAR
     ==================================================================== */

  function initCalendar(editable) {
    calendar = new FullCalendar.Calendar($('availCalendar'), {
      locale:          'pt-br',
      initialView:     'timeGridWeek',
      headerToolbar: {
        left:   'prev,next today',
        center: 'title',
        right:  '',
      },
      buttonText: { today: 'Hoje', month: 'Mês', week: 'Semana', day: 'Dia' },
      slotMinTime:     '06:00:00',
      slotMaxTime:     '23:00:00',
      allDaySlot:      false,
      editable,
      selectable:      editable,
      selectMirror:    true,
      nowIndicator:    true,
      height:          'auto',
      expandRows:      true,

      /* Clicar em slot vazio → criar evento */
      select(info) {
        if (!editable) return;
        openCreate({ startStr: info.startStr });
        calendar.unselect();
      },

      /* Clicar em evento */
      eventClick(info) {
        const props = info.event.extendedProps;
        if (props.type === 'student') {
          openStudentInfo(props);
          return;
        }
        if (props.type === 'availability' && editable) {
          openEdit(props.slot);
        }
      },

      /* Arrastar evento → atualizar horário no banco */
      eventDrop(info) {
        saveFromEvent(info.event, info.revert);
      },

      /* Redimensionar evento → atualizar duração no banco */
      eventResize(info) {
        saveFromEvent(info.event, info.revert);
      },
    });

    calendar.render();
  }

  /* Persiste drag/resize de um slot de disponibilidade */
  async function saveFromEvent(fcEvent, revert) {
    const props = fcEvent.extendedProps;
    if (props.type !== 'availability') return;
    const slot = props.slot;
    try {
      const start    = fcEvent.start;
      const end      = fcEvent.end;
      const toTime   = d => `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
      const updated  = {
        ...slot,
        startTime: toTime(start),
        endTime:   toTime(end),
      };
      if (slot.isRecurring) {
        updated.dayOfWeek = start.getDay();
      } else {
        updated.specificDate = start.toISOString().split('T')[0];
      }
      await HT.storage.saveAvailability(updated);
      await refreshCalendar();
    } catch (err) {
      console.error('Erro ao mover evento:', err);
      revert();
    }
  }

  /* ====================================================================
     CONTROLES EXTERNOS DE VISUALIZAÇÃO
     ==================================================================== */

  function initViewControls() {
    const VIEW_MAP = {
      availViewMonth: 'dayGridMonth',
      availViewWeek:  'timeGridWeek',
      availViewDay:   'timeGridDay',
    };
    Object.entries(VIEW_MAP).forEach(([btnId, viewName]) => {
      const btn = $(btnId);
      if (!btn) return;
      btn.addEventListener('click', () => {
        if (!calendar) return;
        calendar.changeView(viewName);
        /* Atualiza estado visual dos botões */
        Object.keys(VIEW_MAP).forEach(id => {
          const b = $(id);
          if (b) b.classList.toggle('view-btn--active', id === btnId);
        });
      });
    });
  }

  /* ====================================================================
     INIT
     ==================================================================== */

  async function init() {
    if (!$('availCalendar')) return;

    role = (await HT.auth.getRole()) || 'teacher';

    if (role === 'admin') {
      /* Admin: carrega lista de professores, mostra o primeiro */
      teachers = await HT.storage.getTeachers();
      if (teachers.length) {
        activeTeacherId       = teachers[0].id;
        isAdminViewingTeacher = true;
      }
      renderTeacherTabs();
      initCalendar(false); /* admin não edita */

      /* Admin não vê legenda de "editar" */
      $('calLegend').insertAdjacentHTML('beforeend',
        '<span class="cal-legend-item" style="opacity:.6"><i class="fa-solid fa-eye" style="font-size:.85rem"></i>&nbsp;Somente visualização</span>');

    } else {
      /* Professor: calendário editável próprio */
      activeTeacherId       = null;
      isAdminViewingTeacher = false;
      initCalendar(true);

      /* Botão de adicionar horário */
      $('topbarActions').innerHTML = `
        <button class="btn btn--primary btn--sm" id="addAvailBtn">
          <i class="fa-solid fa-plus"></i>
          <span>Adicionar horário</span>
        </button>`;
      $('addAvailBtn').addEventListener('click', () => openCreate());
    }

    /* ── Controles externos de visualização ── */
    initViewControls();

    await refreshCalendar();

    /* ── Listeners do modal de disponibilidade ── */
    $('availForm')?.addEventListener('submit', onSave);
    $('availDeleteBtn')?.addEventListener('click', onDelete);
    $('availModalClose')?.addEventListener('click', () => HT.modals.close('availModalOverlay'));
    $('availModalCancel')?.addEventListener('click', () => HT.modals.close('availModalOverlay'));

    /* Toggle recorrente/específico */
    $('availRecurring')?.addEventListener('change', ev => {
      toggleRecurringFields(ev.target.checked);
      /* Ao reativar recorrência em modo criação, exibir multi-day */
      if (ev.target.checked && !$('availId').value) showDayMode('multi');
    });

    /* Pills de dia — toggle active */
    $('availDaysGrid')?.querySelectorAll('.avail-day-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const on = btn.classList.toggle('active');
        btn.setAttribute('aria-pressed', on ? 'true' : 'false');
        /* limpa erro ao selecionar */
        if (on && $('availDayError')) $('availDayError').textContent = '';
      });
    });

    /* ── Listeners do modal de aluno ── */
    $('seClose')?.addEventListener('click', () => HT.modals.close('studentEventOverlay'));
    $('seCloseBtn')?.addEventListener('click', () => HT.modals.close('studentEventOverlay'));
  }

  document.addEventListener('DOMContentLoaded', init);

  return { init };
})();
