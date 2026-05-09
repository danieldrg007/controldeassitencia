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
const ParentDashboard = lazy(() => import('./pages/ParentDashboard'));

const FallbackLoader = () => (
  <div style={{display:'flex',alignItems:'center',justifyContent:'center',minHeight:'100vh'}}>
    <div style={{textAlign:'center'}}>
      <div style={{width:48,height:48,border:'4px solid var(--gris-200)',borderTopColor:'var(--guinda)',borderRadius:'50%',animation:'spin 0.8s linear infinite',margin:'0 auto 16px'}}></div>
      <p style={{color:'var(--gris-500)'}}>Cargando módulo...</p>
    </div>
  </div>
);
import './index.css';

function ProtectedRoute({ children, allowedRoles }) {
  const { user, userData, loading } = useAuth();
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
  if (allowedRoles && !allowedRoles.includes(userData?.role)) return <Navigate to="/login" />;
  return children;
}

function AppRoutes() {
  const { user, userData } = useAuth();

  const getHome = () => {
    if (!userData) return '/login';
    if (userData.role === 'parent') return '/parent';
    return '/dashboard';
  };

  return (
    <Suspense fallback={<FallbackLoader />}>
      <Routes>
        <Route path="/login" element={user ? <Navigate to={getHome()} /> : <Login />} />
        <Route path="/dashboard" element={
          <ProtectedRoute allowedRoles={['admin','guard']}>
            <Navbar /><Dashboard />
          </ProtectedRoute>
        } />
        <Route path="/scanner" element={
          <ProtectedRoute allowedRoles={['admin','guard']}>
            <Navbar /><Scanner />
          </ProtectedRoute>
        } />
        <Route path="/students" element={
          <ProtectedRoute allowedRoles={['admin','guard']}>
            <Navbar /><Students />
          </ProtectedRoute>
        } />
        <Route path="/users" element={
          <ProtectedRoute allowedRoles={['admin','guard']}>
            <Navbar /><Users />
          </ProtectedRoute>
        } />
        <Route path="/parent" element={
          <ProtectedRoute allowedRoles={['parent']}>
            <Navbar /><ParentDashboard />
          </ProtectedRoute>
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
