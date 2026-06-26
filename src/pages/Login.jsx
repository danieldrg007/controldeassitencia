import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Eye, EyeOff } from 'lucide-react';
import logo from '../assets/logo.jpg';

export default function Login() {
  const { login, register } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [isRegister, setIsRegister] = useState(false);
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (isRegister) {
        await register(email, password, {
          displayName: displayName.trim() || email,
          role: 'parent'
        });
      } else {
        await login(email, password);
      }
    } catch (err) {
      console.error(err);
      if (err.code === 'auth/email-already-in-use') {
        setError('Ese correo ya existe. Cambia a Iniciar Sesión o usa otro correo.');
      } else if (err.code === 'auth/weak-password') {
        setError('La contraseña debe tener al menos 6 caracteres.');
      } else if (err.code === 'permission-denied') {
        setError('La cuenta se creó en Auth, pero Firestore no permitió guardar el perfil. Revisa las reglas.');
      } else {
        setError(isRegister ? 'No se pudo crear la cuenta.' : 'Credenciales incorrectas. Intente de nuevo.');
      }
    }
    setLoading(false);
  };

  const toggleMode = () => {
    setError('');
    setIsRegister(value => !value);
  };

  return (
    <div className="login-page">
      <div className="login-card animate-in">
        <img src={logo} alt="Logo" className="login-logo" style={{width: 80, height: 80, borderRadius: '50%', objectFit: 'cover', border: '3px solid var(--guinda)', margin: '0 auto 16px', display: 'block'}} />
        <h1 className="login-title">Control de Acceso</h1>
        <p className="login-subtitle">Colegio Oliverio Cromwell</p>

        <div className="seg seg-full" style={{marginBottom:20}}>
          <button type="button" className={!isRegister ? 'active' : ''} onClick={() => { if (isRegister) toggleMode(); }} disabled={loading}>Iniciar sesión</button>
          <button type="button" className={isRegister ? 'active' : ''} onClick={() => { if (!isRegister) toggleMode(); }} disabled={loading}>Crear cuenta</button>
        </div>

        <form onSubmit={handleSubmit}>
          {error && (
            <div style={{background:'var(--danger-bg)',color:'var(--danger)',padding:'10px 14px',borderRadius:'var(--radius-sm)',marginBottom:16,fontSize:'0.85rem',fontWeight:500}}>
              {error}
            </div>
          )}

          {isRegister && (
            <div className="form-group" style={{textAlign:'left'}}>
              <label className="form-label">Nombre completo</label>
              <input className="form-input" value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Tu nombre" required />
            </div>
          )}

          <div className="form-group" style={{textAlign:'left'}}>
            <label className="form-label">Correo electrónico</label>
            <input type="email" className="form-input" value={email} onChange={e => setEmail(e.target.value)} placeholder="correo@ejemplo.com" required />
          </div>

          <div className="form-group" style={{textAlign:'left', position:'relative'}}>
            <label className="form-label">Contraseña</label>
            <input type={showPass ? 'text' : 'password'} className="form-input" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required style={{paddingRight:44}} />
            <button type="button" onClick={() => setShowPass(!showPass)} style={{position:'absolute',right:12,top:32,background:'none',border:'none',cursor:'pointer',color:'var(--gris-500)'}}>
              {showPass ? <EyeOff size={18}/> : <Eye size={18}/>}
            </button>
          </div>

          <button type="submit" className="btn btn-primary btn-lg w-full" disabled={loading} style={{marginTop:8}}>
            {loading ? (isRegister ? 'Creando cuenta...' : 'Ingresando...') : (isRegister ? 'Crear Cuenta' : 'Iniciar Sesión')}
          </button>
        </form>
      </div>
    </div>
  );
}
