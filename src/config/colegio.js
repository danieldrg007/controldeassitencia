// Configuración central del colegio: roles, planteles, niveles, grados y grupos.
// Cualquier módulo que necesite estos datos debe importarlos de aquí (no duplicar).

export const ROLES = {
  SUPERADMIN: 'superadmin', // acceso total a todas las vistas
  ADMIN: 'admin',     // super panel de control
  TEACHER: 'teacher', // profesor: pasa lista y manda avisos a sus grupos
  PARENT: 'parent',   // padre/tutor: gestiona hijos y pases de acceso
  GUARD: 'guard',     // checador / modo kiosko en la entrada
  KIOSK: 'kiosk',     // cuenta dedicada: tablet fija en modo kiosko (solo /kiosk)
};

export const ROLE_LABELS = {
  superadmin: 'Super Administrador',
  admin: 'Administrador',
  teacher: 'Profesor',
  parent: 'Padre / Tutor',
  guard: 'Checador',
  kiosk: 'Kiosko (tablet)',
};

// Niveles educativos y los grados que contiene cada uno.
export const NIVELES = {
  Preescolar: ['Kinder 1', 'Kinder 2', 'Kinder 3'],
  Primaria: ['1°', '2°', '3°', '4°', '5°', '6°'],
  Secundaria: ['1°', '2°', '3°'],
  Preparatoria: ['1°', '2°', '3°'],
};

// Cada plantel y los niveles que ofrece.
export const PLANTELES = {
  Xochimilco: ['Primaria', 'Secundaria'],
  Tlalpan: ['Preescolar', 'Primaria', 'Secundaria'],
  Coyoacán: ['Preescolar', 'Primaria'],
  Aztecas: ['Secundaria', 'Preparatoria'],
};

export const GRUPOS = ['A', 'B'];

// Periodos de evaluación para las calificaciones.
export const PERIODOS = ['Periodo 1', 'Periodo 2', 'Periodo 3', 'Final'];

// Hora regular de salida por nivel (formato HH:MM, 24h). Una salida registrada
// ANTES de esta hora se considera "salida anticipada" y pide motivo.
export const HORA_SALIDA = {
  Preescolar: '13:30',
  Primaria: '14:00',
  Secundaria: '14:30',
  Preparatoria: '15:00',
};

export const esSalidaAnticipada = (nivel, date = new Date()) => {
  const hhmm = HORA_SALIDA[nivel] || '14:00';
  const [h, m] = hhmm.split(':').map(Number);
  return date.getHours() * 60 + date.getMinutes() < h * 60 + m;
};

// Motivos predefinidos para salidas anticipadas.
export const MOTIVOS_SALIDA_ANTICIPADA = [
  'Cita médica',
  'Malestar / enfermedad',
  'Asunto familiar',
  'Trámite escolar',
  'Otro',
];

export const NOMBRE_PLANTELES = Object.keys(PLANTELES);

export const nivelesDePlantel = (plantel) => PLANTELES[plantel] || [];
export const gradosDeNivel = (nivel) => NIVELES[nivel] || [];

// classId estable que identifica un grupo concreto. Ej: "Tlalpan|Primaria|3°|A"
export const makeClassId = ({ plantel, nivel, grado, grupo }) =>
  [plantel, nivel, grado, grupo].join('|');

export const parseClassId = (classId) => {
  const [plantel, nivel, grado, grupo] = (classId || '').split('|');
  return { plantel, nivel, grado, grupo };
};

// Etiqueta legible. Ej: 3° Primaria "A" · Tlalpan
export const classLabel = ({ plantel, nivel, grado, grupo }) =>
  `${grado} ${nivel} "${grupo}" · ${plantel}`;

// Alcance de administración: un admin puede estar acotado a un plantel (y
// opcionalmente a una sección/nivel dentro de él). superadmin y admin sin
// plantel asignado ven todo. Devuelve null cuando no hay restricción.
export const adminScope = (userData) => {
  const role = typeof userData?.role === 'string' ? userData.role.trim().toLowerCase() : '';
  if (role !== 'admin' || !userData?.adminPlantel) return null;
  return { plantel: userData.adminPlantel, nivel: userData.adminNivel || '' };
};

export const studentInScope = (s, scope) =>
  !scope || (s.plantel === scope.plantel && (!scope.nivel || s.nivel === scope.nivel));

// Orden de niveles para la promoción de grado (fin de ciclo escolar).
const NIVEL_SIGUIENTE = {
  Preescolar: 'Primaria',
  Primaria: 'Secundaria',
  Secundaria: 'Preparatoria',
  Preparatoria: null, // egresa
};

// Calcula el grado/nivel al que pasa un alumno al promover el ciclo escolar.
// Devuelve { egresado } o { nivel, grado, plantelSinNivel } (plantelSinNivel=true
// cuando su plantel actual no ofrece el nuevo nivel: hay que reasignarlo a mano).
export const promoverAlumno = ({ nivel, grado, plantel }) => {
  const grados = NIVELES[nivel] || [];
  const idx = grados.indexOf(grado);
  if (idx === -1) return { invalido: true };
  if (idx < grados.length - 1) {
    return { nivel, grado: grados[idx + 1], plantelSinNivel: false };
  }
  const next = NIVEL_SIGUIENTE[nivel];
  if (!next) return { egresado: true };
  return {
    nivel: next,
    grado: (NIVELES[next] || [])[0],
    plantelSinNivel: !nivelesDePlantel(plantel).includes(next),
  };
};

// Genera la lista completa de grupos (clases) que existen en el colegio.
export const todasLasClases = () => {
  const clases = [];
  for (const plantel of NOMBRE_PLANTELES) {
    for (const nivel of nivelesDePlantel(plantel)) {
      for (const grado of gradosDeNivel(nivel)) {
        for (const grupo of GRUPOS) {
          const meta = { plantel, nivel, grado, grupo };
          clases.push({ id: makeClassId(meta), label: classLabel(meta), ...meta });
        }
      }
    }
  }
  return clases;
};
