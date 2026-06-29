// Configuración de avisos: niveles de prioridad y categorías (con color e ícono).
// Centralizado aquí para que el formulario, la lista de admin y las vistas de
// padre/profesor usen exactamente los mismos valores y estilos.
import {
  Info, AlertCircle, AlertTriangle, Megaphone, CalendarDays,
  CreditCard, GraduationCap, HeartPulse,
} from 'lucide-react';

export const PRIORIDADES = {
  normal:     { label: 'Normal',     color: '#6B7280', bg: '#F3F4F6', icon: Info,          order: 2 },
  importante: { label: 'Importante', color: '#A9863C', bg: '#FBF3DD', icon: AlertCircle,   order: 1 },
  urgente:    { label: 'Urgente',    color: '#B91C1C', bg: '#FEE2E2', icon: AlertTriangle,  order: 0 },
};

export const CATEGORIAS = {
  general:   { label: 'General',   color: '#6B7280', icon: Megaphone },
  evento:    { label: 'Evento',    color: '#7C3AED', icon: CalendarDays },
  pago:      { label: 'Pago',      color: '#059669', icon: CreditCard },
  academico: { label: 'Académico', color: '#2563EB', icon: GraduationCap },
  salud:     { label: 'Salud',     color: '#DC2626', icon: HeartPulse },
};

export const getPrioridad = (p) => PRIORIDADES[p] || PRIORIDADES.normal;
export const getCategoria = (c) => CATEGORIAS[c] || CATEGORIAS.general;

// Orden de lista: primero por prioridad (urgente arriba), luego por fecha desc.
export const sortAnnouncements = (list) =>
  [...list].sort((a, b) => {
    const pa = getPrioridad(a.priority).order;
    const pb = getPrioridad(b.priority).order;
    if (pa !== pb) return pa - pb;
    return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
  });
