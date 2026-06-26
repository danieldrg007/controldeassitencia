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
