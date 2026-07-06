import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import {
  LogOut, Users, LayoutDashboard, ScanLine, UserCircle, UserCog, Monitor,
  ClipboardCheck, Megaphone, MessageCircle, Menu, X, BookOpen, CalendarDays,
  PackageCheck, CalendarClock, Palette, MoreHorizontal, GraduationCap,
} from 'lucide-react';
import logo from '../assets/logo.jpg';
import NotificationBell from './NotificationBell';

const ROLE_LABELS = {
  superadmin: 'Superadmin',
  admin: 'Administración',
  guard: 'Vigilancia',
  teacher: 'Docente',
  parent: 'Familia',
  kiosk: 'Kiosko',
};

const initialsOf = (name) => {
  const words = (name || 'Usuario').replace(/[^\p{L}\p{N}\s]/gu, '').trim().split(/\s+/).filter(Boolean);
  return (words.slice(0, 2).map(w => w[0]).join('') || 'U').toUpperCase();
};

// App shell: sidebar en escritorio, topbar + drawer en tablet,
// bottom-nav estilo app + drawer en móvil.
export default function Navbar() {
  const { user, userData, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const role = typeof userData?.role === 'string' ? userData.role.trim().toLowerCase() : '';
  const hasChat = ['superadmin', 'admin', 'teacher', 'parent'].includes(role);

  // Conteo de conversaciones con mensajes sin leer.
  useEffect(() => {
    if (!user?.uid || !hasChat) { setUnread(0); return; }
    const q = query(collection(db, 'conversations'), where('participants', 'array-contains', user.uid));
    const unsub = onSnapshot(q, (snap) => {
      let n = 0;
      snap.forEach(d => {
        const c = d.data();
        if (c.lastMessage && c.lastMessage.senderId !== user.uid) {
          const read = c.lastRead?.[user.uid];
          if (!read || c.lastMessage.createdAt > read) n++;
        }
      });
      setUnread(n);
    }, () => {});
    return unsub;
  }, [user, hasChat]);

  // El CSS desplaza el contenido (padding del #root) mientras el shell exista.
  useEffect(() => {
    document.body.classList.add('with-shell');
    return () => document.body.classList.remove('with-shell');
  }, []);

  // El drawer se cierra al navegar y bloquea el scroll del fondo mientras está abierto.
  useEffect(() => { setDrawerOpen(false); }, [location.pathname]);
  useEffect(() => {
    document.body.style.overflow = drawerOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [drawerOpen]);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const isSuper = role === 'superadmin';
  const isAdmin = role === 'admin' || isSuper;
  const isGuard = role === 'guard';
  const isTeacher = role === 'teacher';
  const isParent = role === 'parent';

  // prio define qué links ganan lugar en la bottom-nav móvil (los 4 menores).
  const links = [
    { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard', group: 'Operación', prio: 1, show: isAdmin || isGuard },
    { to: '/scanner', icon: ScanLine, label: 'Escáner', group: 'Operación', prio: 2, show: isAdmin || isGuard },
    { to: '/entregas', icon: PackageCheck, label: 'Entregas', group: 'Operación', prio: 3, show: isAdmin || isGuard },
    { to: '/kiosk', icon: Monitor, label: 'Kiosko', group: 'Operación', prio: 9, show: isAdmin || isGuard },
    { to: '/students', icon: Users, label: 'Alumnos', group: 'Gestión', prio: 5, show: isAdmin },
    { to: '/subjects', icon: BookOpen, label: 'Materias', group: 'Gestión', prio: 10, show: isAdmin },
    { to: '/teacher-assign', icon: GraduationCap, label: 'Asignar materias y planteles', group: 'Gestión', prio: 13, show: isAdmin },
    { to: '/announcements', icon: Megaphone, label: 'Avisos', group: 'Gestión', prio: 11, show: isAdmin },
    { to: '/users', icon: UserCog, label: 'Usuarios', group: 'Gestión', prio: 12, show: isAdmin },
    { to: '/teacher', icon: ClipboardCheck, label: 'Mi Clase', group: 'Académico', prio: isTeacher ? 1 : 13, show: isTeacher || isSuper },
    { to: '/parent', icon: UserCircle, label: 'Mis Hijos', group: 'Académico', prio: isParent ? 1 : 14, show: isParent || isSuper },
    { to: '/calendar', icon: CalendarDays, label: 'Calendario', group: 'Académico', prio: 6, show: isAdmin || isTeacher || isParent },
    { to: '/schedules', icon: CalendarClock, label: 'Horarios', group: 'Académico', prio: 7, show: isAdmin || isTeacher || isParent },
    { to: '/workshops', icon: Palette, label: 'Talleres', group: 'Académico', prio: 8, show: isAdmin || isParent },
    { to: '/messages', icon: MessageCircle, label: 'Mensajes', group: 'Comunicación', prio: 4, show: isAdmin || isTeacher || isParent },
  ].filter(l => l.show);

  const groups = ['Operación', 'Gestión', 'Académico', 'Comunicación']
    .map(g => ({ name: g, items: links.filter(l => l.group === g) }))
    .filter(g => g.items.length > 0);

  const bottomLinks = [...links].sort((a, b) => a.prio - b.prio).slice(0, 4);

  const displayName = userData?.displayName || 'Usuario';
  const roleLabel = ROLE_LABELS[role] || 'Usuario';

  const badge = (to, compact = false) => {
    if (to !== '/messages' || unread <= 0) return null;
    const label = unread > 9 ? '9+' : unread;
    return compact
      ? <span className="shell-tab-badge">{label}</span>
      : <span className="shell-badge">{label}</span>;
  };

  const sideLink = ({ isActive }) => `shell-link ${isActive ? 'active' : ''}`;
  const drawerLink = ({ isActive }) => `drawer-link ${isActive ? 'active' : ''}`;
  const tabLink = ({ isActive }) => `shell-tab ${isActive ? 'active' : ''}`;

  return (
    <>
      {/* ---------- Sidebar (escritorio) ---------- */}
      <aside className="shell-sidebar">
        <div className="shell-brand">
          <img src={logo} alt="Logo" />
          <div className="shell-brand-text">
            <strong>Mi App Oliverio</strong>
            <span>Colegio Oliverio Cromwell</span>
          </div>
        </div>

        <nav className="shell-nav">
          {groups.map(g => (
            <div className="shell-group" key={g.name}>
              <span className="shell-group-label">{g.name}</span>
              {g.items.map(({ to, icon: Icon, label }) => (
                <NavLink to={to} className={sideLink} key={to}>
                  <Icon size={19} /> {label} {badge(to)}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="shell-side-foot">
          <div className="shell-user">
            <span className="shell-user-avatar">{initialsOf(displayName)}</span>
            <div className="shell-user-info">
              <strong>{displayName}</strong>
              <span>{roleLabel}</span>
            </div>
          </div>
          <div className="shell-side-actions">
            <NotificationBell unread={unread} hasChat={hasChat} up />
            <button onClick={handleLogout} className="btn btn-icon" style={{ background: 'rgba(255,255,255,0.14)', color: '#fff' }} title="Cerrar sesión">
              <LogOut size={19} />
            </button>
          </div>
        </div>
      </aside>

      {/* ---------- Topbar (móvil / tablet) ---------- */}
      <header className="shell-topbar">
        <a href="/" className="shell-topbar-brand">
          <img src={logo} alt="Logo" />
          <div>
            <strong>Mi App Oliverio</strong>
            <small>Colegio Oliverio Cromwell</small>
          </div>
        </a>
        <div className="shell-topbar-actions">
          <NotificationBell unread={unread} hasChat={hasChat} />
          <button className="shell-menu-btn" onClick={() => setDrawerOpen(true)} aria-label="Menú">
            <Menu />
          </button>
        </div>
      </header>

      {/* ---------- Drawer: menú completo ---------- */}
      {drawerOpen && (
        <div className="shell-drawer-overlay" onClick={() => setDrawerOpen(false)}>
          <div className="shell-drawer" onClick={e => e.stopPropagation()}>
            <div className="shell-drawer-head">
              <span className="shell-user-avatar">{initialsOf(displayName)}</span>
              <div className="shell-user-info">
                <strong>{displayName}</strong>
                <span>{roleLabel}</span>
              </div>
              <button className="shell-drawer-close" onClick={() => setDrawerOpen(false)} aria-label="Cerrar menú">
                <X size={20} />
              </button>
            </div>

            <nav className="shell-drawer-nav">
              {groups.map(g => (
                <div className="shell-group" key={g.name}>
                  <span className="shell-group-label">{g.name}</span>
                  {g.items.map(({ to, icon: Icon, label }) => (
                    <NavLink to={to} className={drawerLink} key={to} onClick={() => setDrawerOpen(false)}>
                      <Icon size={20} /> {label} {badge(to)}
                    </NavLink>
                  ))}
                </div>
              ))}
            </nav>

            <div className="shell-drawer-foot">
              <button onClick={handleLogout} className="btn btn-secondary w-full">
                <LogOut size={17} /> Cerrar sesión
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------- Bottom-nav (móvil) ---------- */}
      <nav className="shell-bottomnav">
        {bottomLinks.map(({ to, icon: Icon, label }) => (
          <NavLink to={to} className={tabLink} key={to}>
            <Icon /> <span>{label}</span> {badge(to, true)}
          </NavLink>
        ))}
        <button className={`shell-tab ${drawerOpen ? 'active' : ''}`} onClick={() => setDrawerOpen(true)}>
          <MoreHorizontal /> <span>Más</span>
        </button>
      </nav>
    </>
  );
}
