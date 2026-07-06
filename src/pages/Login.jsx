import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Eye, EyeOff, ShieldCheck, Megaphone, CalendarDays } from 'lucide-react';
import logo from '../assets/logo.jpg';

// Traduce los errores de Firebase Auth a mensajes claros en español.
const authErrorMessage = (code) => ({
  'auth/invalid-credential': 'Correo o contraseña incorrectos.',
  'auth/wrong-password': 'Correo o contraseña incorrectos.',
  'auth/user-not-found': 'No existe una cuenta con ese correo.',
  'auth/invalid-email': 'El correo no tiene un formato válido.',
  'auth/email-already-in-use': 'Ya existe una cuenta con ese correo. Inicia sesión.',
  'auth/weak-password': 'La contraseña debe tener al menos 6 caracteres.',
  'auth/too-many-requests': 'Demasiados intentos. Espera un momento e intenta de nuevo.',
}[code] || 'Ocurrió un error. Intenta de nuevo.');

export default function Login() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const emailParam = params.get('email');
    const pwdParam = params.get('pwd');
    if (emailParam) setEmail(emailParam);
    if (pwdParam) setPassword(pwdParam);
  }, [location]);

  const switchMode = (m) => { setMode(m); setError(''); };

  const handleLogin = async () => {
    await login(email, password);
  };

  const handleRegister = async () => {
    if (!displayName.trim()) throw { code: 'custom', message: 'Escribe tu nombre completo.' };
    if (password.length < 6) throw { code: 'auth/weak-password' };
    if (password !== confirm) throw { code: 'custom', message: 'Las contraseñas no coinciden.' };
    // Las reglas de Firestore solo permiten que un usuario cree su propio perfil
    // si su rol es "parent"; por eso el auto-registro es exclusivo para familias.
    await register(email.trim(), password, { displayName: displayName.trim(), role: 'parent' });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (mode === 'login') await handleLogin();
      else await handleRegister();
    } catch (err) {
      console.error(err);
      setError(err.code === 'custom' ? err.message : authErrorMessage(err.code));
    }
    setLoading(false);
  };

  const isRegister = mode === 'register';

  return (
    <div className="login-page">
      <div className="login-shell animate-in">
        {/* Panel de marca institucional */}
        <aside className="login-brand">
          <img src={logo} alt="Logo" className="login-logo" />
          <h2>Colegio Oliverio Cromwell</h2>
          <p>Plataforma integral de acceso, comunicación y vida escolar.</p>
          <ul className="login-feats">
            <li><ShieldCheck /> Control de entradas y salidas</li>
            <li><Megaphone /> Avisos y mensajes directos</li>
            <li><CalendarDays /> Calendario, horarios y talleres</li>
          </ul>
        </aside>

        {/* Formulario */}
        <main className="login-panel">
          <h1 className="login-title">{isRegister ? 'Crear cuenta' : 'Bienvenido'}</h1>
          <p className="login-subtitle">{isRegister ? 'Regístrate como padre o tutor para seguir a tus hijos' : 'Ingresa con tu cuenta institucional'}</p>

          {/* Alternar entre iniciar sesión y crear cuenta */}
          <div className="seg seg-full" style={{ marginBottom: 20 }}>
            <button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => switchMode('login')}>Iniciar sesión</button>
            <button type="button" className={mode === 'register' ? 'active' : ''} onClick={() => switchMode('register')}>Crear cuenta</button>
          </div>

          <form onSubmit={handleSubmit}>
            {error && (
              <div style={{ background: 'var(--danger-bg)', color: 'var(--danger)', padding: '10px 14px', borderRadius: 'var(--radius-sm)', marginBottom: 16, fontSize: '0.85rem', fontWeight: 500 }}>
                {error}
              </div>
            )}

            {isRegister && (
              <div className="form-group" style={{ textAlign: 'left' }}>
                <label className="form-label">Nombre completo</label>
                <input className="form-input" value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Ej. María López" required />
              </div>
            )}

            <div className="form-group" style={{ textAlign: 'left' }}>
              <label className="form-label">Correo electrónico</label>
              <input type="email" className="form-input" value={email} onChange={e => setEmail(e.target.value)} placeholder="correo@ejemplo.com" required />
            </div>

            <div className="form-group" style={{ textAlign: 'left' }}>
              <label className="form-label">Contraseña</label>
              <div style={{ position: 'relative' }}>
                <input type={showPass ? 'text' : 'password'} className="form-input" value={password} onChange={e => setPassword(e.target.value)} placeholder={isRegister ? 'Mínimo 6 caracteres' : '••••••••'} required style={{ paddingRight: 44 }} />
                <button type="button" onClick={() => setShowPass(!showPass)} aria-label="Mostrar contraseña" style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gris-500)', display: 'flex' }}>
                  {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {isRegister && (
              <div className="form-group" style={{ textAlign: 'left' }}>
                <label className="form-label">Confirmar contraseña</label>
                <input type={showPass ? 'text' : 'password'} className="form-input" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Repite tu contraseña" required />
              </div>
            )}

            <button type="submit" className="btn btn-primary btn-lg w-full" disabled={loading} style={{ marginTop: 8 }}>
              {loading ? (isRegister ? 'Creando cuenta...' : 'Ingresando...') : (isRegister ? 'Crear cuenta' : 'Iniciar Sesión')}
            </button>
          </form>

          {isRegister ? (
            <p style={{ marginTop: 18, fontSize: '0.82rem', color: 'var(--gris-500)', textAlign: 'center' }}>
              El registro es solo para padres y tutores. El personal del colegio recibe su cuenta de la administración.
            </p>
          ) : (
            <p style={{ marginTop: 18, fontSize: '0.82rem', color: 'var(--gris-500)', textAlign: 'center' }}>
              ¿Eres padre o tutor y no tienes cuenta?{' '}
              <button type="button" onClick={() => switchMode('register')} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--brand)', fontWeight: 700, cursor: 'pointer', textDecoration: 'underline' }}>
                Regístrate aquí
              </button>
            </p>
          )}
        </main>
      </div>
    </div>
  );
}
