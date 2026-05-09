import { useAuth } from '../context/AuthContext';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { LogOut, Users, LayoutDashboard, ScanLine, UserCircle, UserCog } from 'lucide-react';
import logo from '../assets/logo.jpg';

export default function Navbar() {
  const { userData, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const isAdmin = userData?.role === 'admin' || userData?.role === 'guard';

  return (
    <nav className="navbar">
      <a href="/" className="navbar-brand">
        <img src={logo} alt="Logo" style={{width: 32, height: 32, borderRadius: '50%', objectFit: 'cover'}} />
        <span>Control de Acceso</span>
      </a>

      <div className="navbar-nav">
        {isAdmin && (
          <>
            <NavLink to="/dashboard" className={({isActive}) => `nav-link ${isActive ? 'active' : ''}`}>
              <LayoutDashboard size={16} /> Dashboard
            </NavLink>
            <NavLink to="/scanner" className={({isActive}) => `nav-link ${isActive ? 'active' : ''}`}>
              <ScanLine size={16} /> Escáner
            </NavLink>
            <NavLink to="/students" className={({isActive}) => `nav-link ${isActive ? 'active' : ''}`}>
              <Users size={16} /> Alumnos
            </NavLink>
            <NavLink to="/users" className={({isActive}) => `nav-link ${isActive ? 'active' : ''}`}>
              <UserCog size={16} /> Padres
            </NavLink>
          </>
        )}
        {userData?.role === 'parent' && (
          <NavLink to="/parent" className={({isActive}) => `nav-link ${isActive ? 'active' : ''}`}>
            <UserCircle size={16} /> Mi Hijo
          </NavLink>
        )}
      </div>

      <div className="navbar-user">
        <span>{userData?.displayName || 'Usuario'}</span>
        <button onClick={handleLogout} className="btn btn-icon" style={{background:'rgba(255,255,255,0.15)', color:'#fff'}} title="Cerrar sesión">
          <LogOut size={18} />
        </button>
      </div>
    </nav>
  );
}
