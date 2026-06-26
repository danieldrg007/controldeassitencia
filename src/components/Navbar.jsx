import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { NavLink, useNavigate } from 'react-router-dom';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { LogOut, Users, LayoutDashboard, ScanLine, UserCircle, UserCog, Monitor, ClipboardCheck, Megaphone, MessageCircle, Menu, X, BookOpen } from 'lucide-react';
import logo from '../assets/logo.jpg';
import NotificationBell from './NotificationBell';

export default function Navbar() {
  const { user, userData, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
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

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const isSuper = role === 'superadmin';
  const isAdmin = role === 'admin' || isSuper;
  const isGuard = role === 'guard';
  const isTeacher = role === 'teacher';

  const linkClass = ({ isActive }) => `nav-link ${isActive ? 'active' : ''}`;
  const closeMenu = () => setOpen(false);

  return (
    <nav className="navbar">
      <a href="/" className="navbar-brand">
        <img src={logo} alt="Logo" style={{width: 32, height: 32, borderRadius: '50%', objectFit: 'cover'}} />
        <span>Control de Acceso</span>
      </a>

      <div className={`navbar-nav ${open ? 'open' : ''}`} onClick={closeMenu}>
        {(isAdmin || isGuard) && (
          <>
            <NavLink to="/dashboard" className={linkClass}><LayoutDashboard size={16} /> Dashboard</NavLink>
            <NavLink to="/scanner" className={linkClass}><ScanLine size={16} /> Escáner</NavLink>
            <NavLink to="/kiosk" className={linkClass}><Monitor size={16} /> Kiosko</NavLink>
          </>
        )}
        {isAdmin && (
          <>
            <NavLink to="/students" className={linkClass}><Users size={16} /> Alumnos</NavLink>
            <NavLink to="/subjects" className={linkClass}><BookOpen size={16} /> Materias</NavLink>
            <NavLink to="/announcements" className={linkClass}><Megaphone size={16} /> Avisos</NavLink>
            <NavLink to="/users" className={linkClass}><UserCog size={16} /> Usuarios</NavLink>
          </>
        )}
        {(isTeacher || isSuper) && (
          <NavLink to="/teacher" className={linkClass}><ClipboardCheck size={16} /> Mi Clase</NavLink>
        )}
        {(role === 'parent' || isSuper) && (
          <NavLink to="/parent" className={linkClass}><UserCircle size={16} /> Mis Hijos</NavLink>
        )}
        {(isAdmin || isTeacher || role === 'parent') && (
          <NavLink to="/messages" className={linkClass}>
            <MessageCircle size={16} /> Mensajes
            {unread > 0 && (
              <span style={{ background: 'var(--danger)', color: '#fff', fontSize: '0.7rem', fontWeight: 800, minWidth: 18, height: 18, borderRadius: 999, padding: '0 5px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                {unread > 9 ? '9+' : unread}
              </span>
            )}
          </NavLink>
        )}

        {/* Usuario + salir dentro del menú colapsable en móvil */}
        <div className="navbar-user navbar-user--menu">
          <span>{userData?.displayName || 'Usuario'}</span>
          <button onClick={handleLogout} className="btn btn-icon" style={{background:'rgba(255,255,255,0.15)', color:'#fff'}} title="Cerrar sesión">
            <LogOut size={18} />
          </button>
        </div>
      </div>

      {/* Acciones de la derecha: campanita (siempre), usuario (escritorio) y menú (móvil) */}
      <div className="navbar-actions" style={{display:'flex', alignItems:'center', gap:8}}>
        <NotificationBell unread={unread} hasChat={hasChat} />

        <div className="navbar-user navbar-user--bar">
          <span>{userData?.displayName || 'Usuario'}</span>
          <button onClick={handleLogout} className="btn btn-icon" style={{background:'rgba(255,255,255,0.15)', color:'#fff'}} title="Cerrar sesión">
            <LogOut size={18} />
          </button>
        </div>

        <button className="navbar-toggle" onClick={() => setOpen(o => !o)} aria-label="Menú">
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>
    </nav>
  );
}
