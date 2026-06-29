import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Suspense, lazy } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import Navbar from './components/Navbar';
import './index.css';

const Login = lazy(() => import('./pages/Login'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Scanner = lazy(() => import('./pages/Scanner'));
const Students = lazy(() => import('./pages/Students'));
const Users = lazy(() => import('./pages/Users'));
const ImportTeachers = lazy(() => import('./pages/ImportTeachers'));
const ParentDashboard = lazy(() => import('./pages/ParentDashboard'));
const TeacherDashboard = lazy(() => import('./pages/TeacherDashboard'));
const Kiosk = lazy(() => import('./pages/Kiosk'));
const Announcements = lazy(() => import('./pages/Announcements'));
const Messages = lazy(() => import('./pages/Messages'));
const Subjects = lazy(() => import('./pages/Subjects'));
const Calendar = lazy(() => import('./pages/Calendar'));

const FallbackLoader = () => (
  <div style={{display:'flex',alignItems:'center',justifyContent:'center',minHeight:'100vh'}}>
    <div style={{textAlign:'center'}}>
      <div style={{width:48,height:48,border:'4px solid var(--gris-200)',borderTopColor:'var(--guinda)',borderRadius:'50%',animation:'spin 0.8s linear infinite',margin:'0 auto 16px'}}></div>
      <p style={{color:'var(--gris-500)'}}>Cargando módulo...</p>
    </div>
  </div>
);

const normalizeRole = (role) => typeof role === 'string' ? role.trim().toLowerCase() : '';

const homeForRole = (role) => {
  if (role === 'parent') return '/parent';
  if (role === 'teacher') return '/teacher';
  if (role === 'kiosk') return '/kiosk';
  if (role === 'superadmin' || role === 'admin' || role === 'guard') return '/dashboard';
  return '/login';
};

const AccountIssue = () => {
  const { logout } = useAuth();
  return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',minHeight:'100vh',padding:24}}>
      <div className="card" style={{maxWidth:420,textAlign:'center'}}>
        <h1 className="card-title">Cuenta sin rol válido</h1>
        <p style={{color:'var(--gris-500)',margin:'12px 0 20px'}}>
          Revisa en Firestore que tu documento en users tenga el campo role con valor admin, teacher, guard o parent.
        </p>
        <button className="btn btn-primary" onClick={logout}>Cerrar sesión</button>
      </div>
    </div>
  );
};

function ProtectedRoute({ children, allowedRoles }) {
  const { user, userData, loading } = useAuth();
  const role = normalizeRole(userData?.role);
  if (loading) return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',minHeight:'100vh'}}>
      <div style={{textAlign:'center'}}>
        <div style={{width:48,height:48,border:'4px solid var(--gris-200)',borderTopColor:'var(--guinda)',borderRadius:'50%',animation:'spin 0.8s linear infinite',margin:'0 auto 16px'}}></div>
        <p style={{color:'var(--gris-500)'}}>Cargando...</p>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    </div>
  );
  if (!user) return <Navigate to="/login" />;
  if (!role) return <AccountIssue />;
  if (allowedRoles && !allowedRoles.includes(role)) {
    return <Navigate to={homeForRole(role)} replace />;
  }
  return children;
}

function AppRoutes() {
  const { user, userData } = useAuth();
  const role = normalizeRole(userData?.role);
  const getHome = () => (role ? homeForRole(role) : '/login');

  return (
    <Suspense fallback={<FallbackLoader />}>
      <Routes>
        <Route path="/login" element={user && role ? <Navigate to={getHome()} replace /> : <Login />} />

        <Route path="/dashboard" element={
          <ProtectedRoute allowedRoles={['superadmin','admin','guard']}><Navbar /><Dashboard /></ProtectedRoute>
        } />
        <Route path="/scanner" element={
          <ProtectedRoute allowedRoles={['superadmin','admin','guard']}><Navbar /><Scanner /></ProtectedRoute>
        } />
        <Route path="/students" element={
          <ProtectedRoute allowedRoles={['superadmin','admin','guard']}><Navbar /><Students /></ProtectedRoute>
        } />
        <Route path="/users" element={
          <ProtectedRoute allowedRoles={['superadmin','admin']}><Navbar /><Users /></ProtectedRoute>
        } />
        <Route path="/import-teachers" element={
          <ProtectedRoute allowedRoles={['superadmin','admin']}><Navbar /><ImportTeachers /></ProtectedRoute>
        } />
        <Route path="/announcements" element={
          <ProtectedRoute allowedRoles={['superadmin','admin']}><Navbar /><Announcements /></ProtectedRoute>
        } />
        <Route path="/subjects" element={
          <ProtectedRoute allowedRoles={['superadmin','admin']}><Navbar /><Subjects /></ProtectedRoute>
        } />

        {/* Modo kiosko: sin navbar, pantalla completa. Cuenta dedicada (rol kiosk) o staff. */}
        <Route path="/kiosk" element={
          <ProtectedRoute allowedRoles={['superadmin','admin','guard','kiosk']}><Kiosk /></ProtectedRoute>
        } />

        <Route path="/teacher" element={
          <ProtectedRoute allowedRoles={['superadmin','admin','teacher']}><Navbar /><TeacherDashboard /></ProtectedRoute>
        } />

        <Route path="/messages" element={
          <ProtectedRoute allowedRoles={['superadmin','admin','teacher','parent']}><Navbar /><Messages /></ProtectedRoute>
        } />

        <Route path="/calendar" element={
          <ProtectedRoute allowedRoles={['superadmin','admin','teacher','parent']}><Navbar /><Calendar /></ProtectedRoute>
        } />

        <Route path="/parent" element={
          <ProtectedRoute allowedRoles={['superadmin','parent']}><Navbar /><ParentDashboard /></ProtectedRoute>
        } />

        <Route path="*" element={<Navigate to={user ? getHome() : '/login'} />} />
      </Routes>
    </Suspense>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
