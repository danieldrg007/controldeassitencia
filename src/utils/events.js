// Calendario de eventos: audiencias, visibilidad por rol y utilidades de mes.

// Públicos a los que se puede dirigir un evento.
export const AUDIENCES = {
  general: { label: 'General', emoji: '📣' },
  parent:  { label: 'Padres', emoji: '👪' },
  teacher: { label: 'Maestros', emoji: '👩‍🏫' },
  student: { label: 'Alumnos', emoji: '🎒' },
};
export const AUDIENCE_ORDER = ['general', 'parent', 'teacher', 'student'];

export const audienceLabels = (auds = []) =>
  AUDIENCE_ORDER.filter(a => auds.includes(a)).map(a => AUDIENCES[a].label).join(', ') || 'General';

// ¿Este viewer puede ver el evento?
// viewer = { role, planteles: string[], classIds: string[] }
// Los alumnos no tienen cuenta: un evento para "student" lo ven los padres.
export function canSeeEvent(ev, viewer) {
  const { role } = viewer;
  if (role === 'admin' || role === 'superadmin') return true; // administración ve todo

  const auds = ev.audiences || [];
  let audienceOk = auds.length === 0 || auds.includes('general');
  if (!audienceOk) {
    if (role === 'parent') audienceOk = auds.includes('parent') || auds.includes('student');
    else if (role === 'teacher') audienceOk = auds.includes('teacher');
  }
  if (!audienceOk) return false;

  const sc = ev.scope || { type: 'all' };
  if (sc.type === 'all') return true;
  if (sc.type === 'plantel') return (viewer.planteles || []).includes(sc.value);
  if (sc.type === 'class') return (viewer.classIds || []).includes(sc.value);
  return false;
}

// ---- Utilidades de calendario ----
export const MONTHS_ES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
export const WEEKDAYS_ES = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

export const pad2 = (n) => String(n).padStart(2, '0');
export const toDateStr = (y, m, d) => `${y}-${pad2(m + 1)}-${pad2(d)}`; // m: 0-11
export const todayStr = () => { const d = new Date(); return toDateStr(d.getFullYear(), d.getMonth(), d.getDate()); };

// Matriz de semanas (lunes primero). Cada celda: {day, dateStr} o null.
export function buildMonthMatrix(year, month) {
  const startWeekday = (new Date(year, month, 1).getDay() + 6) % 7; // lunes = 0
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d, dateStr: toDateStr(year, month, d) });
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

// 'YYYY-MM-DD' → 'mié 12 jun' / con año opcional
export const fmtEventDate = (dateStr, withYear = false) => {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es-MX', {
    weekday: 'short', day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}),
  });
};

export function getGoogleCalendarUrl(ev) {
  if (!ev || !ev.date) return '';

  const title = encodeURIComponent(ev.title || '');
  const description = encodeURIComponent(
    `${ev.description || ''}\n\nDestinatarios: ${audienceLabels(ev.audiences)}\nAlcance: ${ev.scopeLabel || 'Todo el colegio'}\nPublicado por: ${ev.authorName || 'Colegio Oliverio'}`.trim()
  );
  const location = encodeURIComponent(ev.scopeLabel || 'Colegio Oliverio');

  let dates;
  const dateClean = ev.date.replace(/-/g, ''); // YYYYMMDD

  if (ev.time) {
    const [hours, minutes] = ev.time.split(':').map(Number);
    const startStr = `${dateClean}T${pad2(hours)}${pad2(minutes)}00`;

    let endHours = hours + 1;
    let endDateClean = dateClean;
    if (endHours >= 24) {
      endHours = endHours - 24;
      const d = new Date(ev.date + 'T00:00:00');
      d.setDate(d.getDate() + 1);
      const y = d.getFullYear();
      const m = d.getMonth();
      const day = d.getDate();
      endDateClean = `${y}${pad2(m + 1)}${pad2(day)}`;
    }
    const endStr = `${endDateClean}T${pad2(endHours)}${pad2(minutes)}00`;
    dates = `${startStr}/${endStr}`;
  } else {
    const d = new Date(ev.date + 'T00:00:00');
    d.setDate(d.getDate() + 1);
    const y = d.getFullYear();
    const m = d.getMonth();
    const day = d.getDate();
    const nextDateClean = `${y}${pad2(m + 1)}${pad2(day)}`;
    dates = `${dateClean}/${nextDateClean}`;
  }

  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${dates}&details=${description}&location=${location}`;
}

