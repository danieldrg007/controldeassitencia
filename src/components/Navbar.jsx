import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { NavLink, useNavigate } from 'react-router-dom';
import { LogOut, Users, LayoutDashboard, ScanLine, UserCircle, UserCog, Monitor, ClipboardCheck, Megaphone, MessageCircle, Menu, X } from 'lucide-react';
import logo from '../assets/logo.jpg';

export default function Navbar() {
  const { userData, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const role = typeof userData?.role === 'string' ? userData.role.trim().toLowerCase() : '';

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

      <button className="navbar-toggle" onClick={() => setOpen(o => !o)} aria-label="Menú">
        {open ? <X size={22} /> : <Menu size={22} />}
      </button>

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
          <NavLink to="/messages" className={linkClass}><MessageCircle size={16} /> Mensajes</NavLink>
        )}

        {/* Usuario + salir dentro del menú colapsable en móvil */}
        <div className="navbar-user navbar-user--menu">
          <span>{userData?.displayName || 'Usuario'}</span>
          <button onClick={handleLogout} className="btn btn-icon" style={{background:'rgba(255,255,255,0.15)', color:'#fff'}} title="Cerrar sesión">
            <LogOut size={18} />
          </button>
        </div>
      </div>

      {/* Usuario visible en escritorio (fuera del menú) */}
      <div className="navbar-user navbar-user--bar">
        <span>{userData?.displayName || 'Usuario'}</span>
        <button onClick={handleLogout} className="btn btn-icon" style={{background:'rgba(255,255,255,0.15)', color:'#fff'}} title="Cerrar sesión">
          <LogOut size={18} />
        </button>
      </div>
    </nav>
  );
}
