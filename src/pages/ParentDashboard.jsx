import { useState, useEffect } from 'react';
import { db, auth } from '../firebase';
import { collection, query, where, getDocs, onSnapshot, orderBy, addDoc, updateDoc, doc } from 'firebase/firestore';
import { updateEmail, updatePassword, updateProfile, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { useAuth } from '../context/AuthContext';
import { QRCodeSVG } from 'qrcode.react';
import { Clock, LogIn, LogOut, Bell, Download, UserCircle, Plus, Edit, X, Save } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

const plantelesConfig = {
  'Tlalpan': ['Maternal', 'Kinder 1', 'Kinder 2', 'Kinder 3', 'Preprimaria', '1° Primaria', '2° Primaria', '3° Primaria', '4° Primaria', '5° Primaria', '6° Primaria', '1° Secundaria', '2° Secundaria', '3° Secundaria'],
  'Coyoacán': ['Maternal', 'Kinder 1', 'Kinder 2', 'Kinder 3', 'Preprimaria', '1° Primaria', '2° Primaria', '3° Primaria', '4° Primaria', '5° Primaria', '6° Primaria'],
  'Aztecas': ['1° Secundaria', '2° Secundaria', '3° Secundaria', '1° Bachillerato', '3° Bachillerato', '5° Bachillerato'],
  'Xochimilco': ['1° Primaria', '2° Primaria', '3° Primaria', '4° Primaria', '5° Primaria', '6° Primaria', '1° Secundaria', '2° Secundaria', '3° Secundaria']
};
const planteles = Object.keys(plantelesConfig);

function generateQR() {
  return 'COC-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).substring(2, 7).toUpperCase();
}

export default function ParentDashboard() {
  const { user, userData } = useAuth();
  const [students, setStudents] = useState([]);
  const [todayRecords, setTodayRecords] = useState({});
  const [notifications, setNotifications] = useState([]);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [activeTab, setActiveTab] = useState('status');
  
  // Modals
  const [showAddStudent, setShowAddStudent] = useState(false);
  const [showQR, setShowQR] = useState(null);
  
  // Forms
  const [studentForm, setStudentForm] = useState({ name: '', lastName: '', plantel: '', grade: '', group: '' });
  const [profileForm, setProfileForm] = useState({ displayName: userData?.displayName || '', email: user?.email || '', currentPassword: '', newPassword: '' });
  const [loading, setLoading] = useState(false);
  const [profileMsg, setProfileMsg] = useState({ type: '', text: '' });

  const today = new Date().toISOString().split('T')[0];

  const loadMyStudents = async () => {
    const q = query(collection(db, 'students'), where('parentIds', 'array-contains', user.uid));
    const snap = await getDocs(q);
    const list = [];
    snap.forEach(d => list.push({ id: d.id, ...d.data() }));
    setStudents(list);
    if (list.length > 0 && !selectedStudent) setSelectedStudent(list[0]);
  };

  useEffect(() => {
    if (user) loadMyStudents();
  }, [user]);

  useEffect(() => {
    if (!selectedStudent) return;
    const unsub = onSnapshot(collection(db, 'attendance', today, 'records'), (snap) => {
      const records = {};
      snap.forEach(d => {
        const data = d.data();
        if (data.studentId === selectedStudent.id) records[data.studentId] = data;
      });
      setTodayRecords(records);
    });
    return unsub;
  }, [selectedStudent, today]);

  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(query(collection(db, 'notifications'), where('parentId', '==', user.uid), orderBy('createdAt', 'desc')), (snap) => {
      const list = [];
      snap.forEach(d => list.push({ id: d.id, ...d.data() }));
      setNotifications(list.slice(0, 20));
    });
    return unsub;
  }, [user]);

  const handleAddStudent = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await addDoc(collection(db, 'students'), {
        ...studentForm,
        parentIds: [user.uid],
        qrCode: generateQR(),
        createdAt: new Date().toISOString()
      });
      setShowAddStudent(false);
      setStudentForm({ name: '', lastName: '', plantel: '', grade: '', group: '' });
      loadMyStudents();
    } catch (err) {
      alert('Error al agregar alumno: ' + err.message);
    }
    setLoading(false);
  };

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    setLoading(true);
    setProfileMsg({ type: '', text: '' });

    try {
      // Re-authenticate if changing email or password
      if (profileForm.email !== user.email || profileForm.newPassword) {
        if (!profileForm.currentPassword) {
          throw new Error('Para cambiar correo o contraseña necesitas ingresar tu contraseña actual.');
        }
        const credential = EmailAuthProvider.credential(user.email, profileForm.currentPassword);
        await reauthenticateWithCredential(user, credential);
      }

      // Update Auth Profile
      if (profileForm.displayName !== user.displayName) {
        await updateProfile(user, { displayName: profileForm.displayName });
      }
      
      // Update Email
      if (profileForm.email !== user.email) {
        await updateEmail(user, profileForm.email);
      }

      // Update Password
      if (profileForm.newPassword) {
        await updatePassword(user, profileForm.newPassword);
      }

      // Update Firestore
      await updateDoc(doc(db, 'users', user.uid), {
        displayName: profileForm.displayName,
        email: profileForm.email
      });

      setProfileMsg({ type: 'success', text: 'Perfil actualizado correctamente.' });
      setProfileForm(prev => ({ ...prev, currentPassword: '', newPassword: '' }));
    } catch (err) {
      setProfileMsg({ type: 'error', text: err.message });
    }
    setLoading(false);
  };

  const formatTime = (iso) => iso ? new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) : '—';
  const formatDate = (iso) => iso ? new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';

  const availableGrades = studentForm.plantel ? plantelesConfig[studentForm.plantel] : [];

  const record = selectedStudent ? todayRecords[selectedStudent.id] : null;

  return (
    <div className="page-container animate-in">
      <div className="page-header">
        <h1 className="page-title">Portal de Padres</h1>
        <p className="page-subtitle">Bienvenido, {userData?.displayName}</p>
      </div>

      <div className="tabs">
        <button className={`tab ${activeTab === 'status' ? 'active' : ''}`} onClick={() => setActiveTab('status')}>
          <Bell size={14} style={{marginRight:4,verticalAlign:'middle'}}/> Asistencia
        </button>
        <button className={`tab ${activeTab === 'profile' ? 'active' : ''}`} onClick={() => setActiveTab('profile')}>
          <UserCircle size={14} style={{marginRight:4,verticalAlign:'middle'}}/> Mi Perfil
        </button>
      </div>

      {activeTab === 'status' && (
        <>
          <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
            <div className="flex gap-2 overflow-x-auto" style={{maxWidth:'100%', paddingBottom:4}}>
              {students.map(s => (
                <button key={s.id} onClick={() => setSelectedStudent(s)}
                  className={`btn ${selectedStudent?.id === s.id ? 'btn-primary' : 'btn-secondary'}`} style={{whiteSpace:'nowrap'}}>
                  {s.name}
                </button>
              ))}
            </div>
            <button onClick={() => setShowAddStudent(true)} className="btn btn-gold">
              <Plus size={16}/> Registrar Alumno
            </button>
          </div>

          {students.length === 0 ? (
            <div className="card">
              <div className="empty-state">
                <div className="empty-state-icon">👨‍👧</div>
                <p className="empty-state-text">No tienes alumnos registrados.<br/>Haz clic en "Registrar Alumno" para agregarlos.</p>
                <button onClick={() => setShowAddStudent(true)} className="btn btn-primary mt-4">Registrar Alumno</button>
              </div>
            </div>
          ) : selectedStudent && (
            <div className="grid md:grid-cols-2 gap-4" style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px'}}>
              {/* Status Card */}
              <div className="card" style={{textAlign:'center', padding:32}}>
                <div style={{width:80,height:80,borderRadius:'50%',background: record ? (record.exitTime ? 'var(--warning-bg)' : 'var(--success-bg)') : 'var(--gris-100)', display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 16px',fontSize:'2rem'}}>
                  {record ? (record.exitTime ? '🏠' : '🏫') : '❓'}
                </div>
                <h2 style={{fontSize:'1.5rem',fontWeight:800}}>{selectedStudent.name} {selectedStudent.lastName}</h2>
                <p style={{color:'var(--gris-500)',marginBottom:16}}>{selectedStudent.grade} {selectedStudent.group}</p>
                <button onClick={() => setShowQR(selectedStudent)} className="btn btn-sm btn-secondary mb-4">
                  <Download size={14}/> Ver Código QR
                </button>

                {record ? (
                  <div>
                    <span className={`badge ${record.exitTime ? 'badge-warning' : 'badge-success'}`} style={{fontSize:'0.9rem',padding:'6px 16px'}}>
                      {record.exitTime ? 'Ya salió del colegio' : 'Actualmente en el colegio'}
                    </span>
                    <div className="grid-2 mt-4">
                      <div className="stat-card" style={{padding:12}}>
                        <div><div className="stat-label">Entrada</div><div className="stat-value" style={{fontSize:'1.1rem'}}>{formatTime(record.entryTime)}</div></div>
                      </div>
                      <div className="stat-card" style={{padding:12}}>
                        <div><div className="stat-label">Salida</div><div className="stat-value" style={{fontSize:'1.1rem'}}>{formatTime(record.exitTime)}</div></div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div style={{marginTop:16}}><span className="badge badge-danger">Sin registro de entrada hoy</span></div>
                )}
              </div>

              {/* Notifications */}
              <div className="card">
                <h3 className="card-title" style={{marginBottom:16}}>Últimas Notificaciones</h3>
                {notifications.length === 0 ? (
                  <div className="empty-state" style={{padding:24}}><p className="empty-state-text">No hay notificaciones aún</p></div>
                ) : (
                  <div className="flex flex-col gap-2" style={{maxHeight:400, overflowY:'auto'}}>
                    {notifications.map(n => (
                      <div key={n.id} style={{padding:'12px',borderRadius:'var(--radius-sm)',background: n.type === 'entry' ? 'var(--success-bg)' : 'var(--info-bg)',display:'flex',alignItems:'center',gap:12}}>
                        {n.type === 'entry' ? <LogIn size={18} color="var(--success)"/> : <LogOut size={18} color="var(--info)"/>}
                        <div style={{flex:1}}>
                          <p style={{fontSize:'0.875rem',fontWeight:500}}>{n.message}</p>
                          <p style={{fontSize:'0.75rem',color:'var(--gris-500)'}}>{formatDate(n.createdAt)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {activeTab === 'profile' && (
        <div className="card" style={{maxWidth:600, margin:'0 auto'}}>
          <div style={{textAlign:'center', marginBottom:24}}>
            <UserCircle size={64} color="var(--guinda)" style={{margin:'0 auto 8px'}}/>
            <h2 className="card-title">Configuración de Perfil</h2>
            <p style={{fontSize:'0.85rem', color:'var(--gris-500)'}}>Actualiza tu información personal y credenciales</p>
          </div>

          {profileMsg.text && (
            <div style={{padding:12, borderRadius:'var(--radius-sm)', marginBottom:16, background: profileMsg.type === 'success' ? 'var(--success-bg)' : 'var(--danger-bg)', color: profileMsg.type === 'success' ? 'var(--success)' : 'var(--danger)', fontSize:'0.85rem', fontWeight:500}}>
              {profileMsg.text}
            </div>
          )}

          <form onSubmit={handleUpdateProfile}>
            <div className="form-group">
              <label className="form-label">Nombre Completo</label>
              <input className="form-input" value={profileForm.displayName} onChange={e => setProfileForm({...profileForm, displayName: e.target.value})} required />
            </div>
            <div className="form-group">
              <label className="form-label">Correo Electrónico</label>
              <input type="email" className="form-input" value={profileForm.email} onChange={e => setProfileForm({...profileForm, email: e.target.value})} required />
            </div>
            
            <hr style={{margin:'24px 0', borderColor:'var(--gris-200)', borderStyle:'solid'}} />
            <h3 style={{fontSize:'0.9rem', fontWeight:600, marginBottom:16, color:'var(--gris-700)'}}>Seguridad</h3>
            
            <div className="form-group">
              <label className="form-label">Nueva Contraseña (opcional)</label>
              <input type="password" className="form-input" placeholder="Dejar en blanco para no cambiar" value={profileForm.newPassword} onChange={e => setProfileForm({...profileForm, newPassword: e.target.value})} />
            </div>

            {(profileForm.email !== user.email || profileForm.newPassword) && (
              <div className="form-group">
                <label className="form-label">Contraseña Actual (Requerida para cambios de seguridad)</label>
                <input type="password" className="form-input" required value={profileForm.currentPassword} onChange={e => setProfileForm({...profileForm, currentPassword: e.target.value})} />
              </div>
            )}

            <button type="submit" className="btn btn-primary w-full" disabled={loading}>
              <Save size={16}/> {loading ? 'Guardando...' : 'Guardar Cambios'}
            </button>
          </form>
        </div>
      )}

      {/* Modal Agregar Alumno */}
      {showAddStudent && (
        <div className="modal-overlay" onClick={() => setShowAddStudent(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Registrar Nuevo Alumno</h3>
              <button className="modal-close" onClick={() => setShowAddStudent(false)}><X size={16}/></button>
            </div>
            <form onSubmit={handleAddStudent}>
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Nombre(s)</label>
                  <input className="form-input" value={studentForm.name} onChange={e => setStudentForm({...studentForm, name: e.target.value})} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Apellidos</label>
                  <input className="form-input" value={studentForm.lastName} onChange={e => setStudentForm({...studentForm, lastName: e.target.value})} required />
                </div>
              </div>
              <div className="grid-3" style={{gridTemplateColumns: 'repeat(3, 1fr)', gap: 16}}>
                <div className="form-group">
                  <label className="form-label">Plantel</label>
                  <select className="form-select" value={studentForm.plantel} onChange={e => setStudentForm({...studentForm, plantel: e.target.value, grade: ''})} required>
                    <option value="">Seleccionar...</option>
                    {planteles.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Grado</label>
                  <select className="form-select" value={studentForm.grade} onChange={e => setStudentForm({...studentForm, grade: e.target.value})} required disabled={!studentForm.plantel}>
                    <option value="">{studentForm.plantel ? 'Seleccionar...' : 'Elige un plantel primero'}</option>
                    {availableGrades.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Grupo</label>
                  <select className="form-select" value={studentForm.group} onChange={e => setStudentForm({...studentForm, group: e.target.value})} required>
                    <option value="">Seleccionar...</option>
                    {['A','B','C'].map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" onClick={() => setShowAddStudent(false)} className="btn btn-secondary">Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={loading}>{loading ? 'Registrando...' : 'Registrar Alumno'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal QR */}
      {showQR && (
        <div className="modal-overlay" onClick={() => setShowQR(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{textAlign:'center'}}>
            <div className="modal-header">
              <h3 className="modal-title">Código QR</h3>
              <button className="modal-close" onClick={() => setShowQR(null)}><X size={16}/></button>
            </div>
            <div style={{background:'var(--crema)',borderRadius:'var(--radius-md)',padding:24,display:'inline-block'}}>
              <QRCodeSVG value={showQR.qrCode} size={220} level="H" />
            </div>
            <h3 style={{marginTop:16,fontWeight:700}}>{showQR.name} {showQR.lastName}</h3>
            <p style={{color:'var(--gris-500)'}}>{showQR.grade} {showQR.group}</p>
            <button onClick={() => window.print()} className="btn btn-primary mt-4"><Download size={16}/> Imprimir/Guardar</button>
          </div>
        </div>
      )}
    </div>
  );
}
