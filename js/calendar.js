/* ==========================================================================
   CALENDAR.JS — FullCalendar inicialização e eventos
   ========================================================================== */

window.HT = window.HT || {};

HT.calendar = (() => {

  let calendarInstance = null;

  /* Cache de dados injetado externamente (evita chamadas duplicadas ao Supabase) */
  let _students = null;
  let _classes  = null;

  const EVENT_COLOR = '#4b5563';

  function colorFor(_id) {
    return EVENT_COLOR;
  }

  /* ---------- Injetar dados já carregados (evita round-trip extra) ---------- */
  function setData(students, classes) {
    _students = students;
    _classes  = classes;
  }

  /* ---------- Gerar eventos recorrentes (síncrono, dados já carregados) ---------- */
  function buildEvents(students, classes) {
    const events = [];
    const today  = new Date();

    // Janela: 3 meses atrás → 3 meses à frente
    const start = new Date(today.getFullYear(), today.getMonth() - 3, 1);
    const end   = new Date(today.getFullYear(), today.getMonth() + 4, 0);

    /* Aulas de turmas */
    classes.forEach(cls => {
      const color = colorFor(cls.id);
      (cls.schedules || []).forEach(sched => {
        if (!sched.day || !sched.time) return;
        const dayNum = HT.utils.getDayNumber(sched.day);
        if (dayNum < 0) return;

        let d = new Date(start);
        while (d.getDay() !== dayNum) d.setDate(d.getDate() + 1);

        while (d <= end) {
          const dateStr  = d.toISOString().split('T')[0];
          const [h, m]   = sched.time.split(':').map(Number);
          const startISO = `${dateStr}T${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:00`;
          const endMin   = h * 60 + m + (sched.duration || 60);
          const endISO   = `${dateStr}T${String(Math.floor(endMin/60)).padStart(2,'0')}:${String(endMin%60).padStart(2,'0')}:00`;

          events.push({
            id:    `cls_${cls.id}_${dateStr}`,
            title: cls.name,
            start: startISO,
            end:   endISO,
            color,
            extendedProps: { type: 'class', classId: cls.id, className: cls.name, level: cls.level || '' },
          });
          d.setDate(d.getDate() + 7);
        }
      });
    });

    /* Aulas individuais (alunos sem turma, com horários próprios) */
    students
      .filter(s => !s.classId)
      .forEach(student => {
        const schedules = (student.schedules && student.schedules.length)
          ? student.schedules
          : (student.day ? [{ day: student.day, time: student.time, duration: student.duration || 60 }] : []);

        const color = colorFor(student.id);

        schedules.forEach(sched => {
          if (!sched.day || !sched.time) return;
          const dayNum = HT.utils.getDayNumber(sched.day);
          if (dayNum < 0) return;

          let d = new Date(start);
          while (d.getDay() !== dayNum) d.setDate(d.getDate() + 1);

          while (d <= end) {
            const dateStr  = d.toISOString().split('T')[0];
            const [h, m]   = sched.time.split(':').map(Number);
            const startISO = `${dateStr}T${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:00`;
            const endMin   = h * 60 + m + (sched.duration || 60);
            const endISO   = `${dateStr}T${String(Math.floor(endMin/60)).padStart(2,'0')}:${String(endMin%60).padStart(2,'0')}:00`;

            events.push({
              id:    `std_${student.id}_${sched.day}_${dateStr}`,
              title: student.name,
              start: startISO,
              end:   endISO,
              color,
              extendedProps: { type: 'student', studentId: student.id, studentName: student.name, level: student.level || '' },
            });
            d.setDate(d.getDate() + 7);
          }
        });
      });

    return events;
  }

  /* ---------- Carregar dados se necessário e gerar eventos ---------- */
  async function loadEvents() {
    if (!_students || !_classes) {
      [_students, _classes] = await Promise.all([
        HT.storage.getStudents(),
        HT.storage.getClasses(),
      ]);
    }
    return buildEvents(_students, _classes);
  }

  /* ---------- Inicializar ---------- */
  async function init(containerId = 'calendar') {
    const el = document.getElementById(containerId);
    if (!el || typeof FullCalendar === 'undefined') return;

    const events = await loadEvents();

    calendarInstance = new FullCalendar.Calendar(el, {
      locale: 'pt-br',
      initialView: 'dayGridMonth',
      headerToolbar: {
        left:   'prev,next today',
        center: 'title',
        right:  '',
      },
      contentHeight: 'auto',
      expandRows: false,
      /* Janela de horários para as visualizações diária e semanal */
      slotMinTime: '06:00:00',
      slotMaxTime: '23:00:00',
      /* Evita <a> sem href nos eventos (Lighthouse "links não rastreáveis") */
      navLinks: false,
      eventInteractive: false,
      events,
      eventClick(info) {
        const { type, className: cName, studentName } = info.event.extendedProps;
        if (type === 'class') {
          HT.utils.showToast(`Turma: ${cName}`, 'default');
        } else {
          HT.utils.showToast(`Aluno: ${studentName}`, 'default');
        }
      },
      eventDidMount(info) {
        info.el.title = info.event.title;
      },
    });

    calendarInstance.render();

    // Botões de visualização personalizados (view-btn)
    document.querySelectorAll('.view-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('view-btn--active'));
        btn.classList.add('view-btn--active');
        calendarInstance.changeView(btn.dataset.view);
      });
    });
  }

  /* ---------- Atualizar eventos (invalida cache e recarrega) ---------- */
  async function refresh() {
    if (!calendarInstance) return;
    _students = null;
    _classes  = null;
    const events = await loadEvents();
    calendarInstance.removeAllEvents();
    events.forEach(ev => calendarInstance.addEvent(ev));
  }

  /* ---------- Próximas aulas (para o dashboard) ---------- */
  async function getUpcoming(limit = 8) {
    const events = await loadEvents();
    const now    = new Date().toISOString();
    return events
      .filter(ev => ev.start >= now)
      .sort((a, b) => a.start.localeCompare(b.start))
      .slice(0, limit);
  }

  return { init, refresh, getUpcoming, buildEvents, setData };
})();
