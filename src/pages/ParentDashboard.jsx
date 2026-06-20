import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, where, getDocs, onSnapshot, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { updateEmail, updatePassword, updateProfile, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { useAuth } from '../context/AuthContext';
import { QRCodeSVG } from 'qrcode.react';
import { LogIn, LogOut, Bell, BellRing, Download, UserCircle, Plus, X, Save, Users2, Megaphone, Trash2, IdCard } from 'lucide-react';
import {
  NOMBRE_PLANTELES, GRUPOS, nivelesDePlantel, gradosDeNivel, makeClassId,
} from '../config/colegio';
import { enablePushNotifications, listenForegroundMessages } from '../notifications';

function generateQR(prefix = 'COC') {
  return prefix + '-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).substring(2, 7).toUpperCase();
}

const RELACIONES = ['Madre', 'Padre', 'Abuelo/a', 'Tío/a', 'Hermano/a mayor', 'Chofer', 'Otro'];
const emptyStudent = { name: '', lastName: '', plantel: '', nivel: '', grado: '', grupo: '' };
const emptyMember = { name: '', relation: 'Madre', phone: '' };

export default function ParentDashboard() {
  const { user, userData } = useAuth();
  const [students, setStudents] = useState([]);
  const [todayRecords, setTodayRecords] = useState({});
  const [notifications, setNotifications] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [familyMembers, setFamilyMembers] = useState([]);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [activeTab, setActiveTab] = useState('status');

  const [showAddStudent, setShowAddStudent] = useState(false);
  const [showMember, setShowMember] = useState(false);
  const [showQR, setShowQR] = useState(null);
  const [showPass, setShowPass] = useState(null);

  const [studentForm, setStudentForm] = useState(emptyStudent);
  const [memberForm, setMemberForm] = useState(emptyMember);
  const [profileForm, setProfileForm] = useState({ displayName: userData?.displayName || '', email: user?.email || '', currentPassword: '', newPassword: '' });
  const [loading, setLoading] = useState(false);
  const [profileMsg, setProfileMsg] = useState({ type: '', text: '' });
  const [pushState, setPushState] = useState(typeof Notification !== 'undefined' ? Notification.permission : 'unsupported');

  const today = new Date().toISOString().split('T')[0];

  const handleEnablePush = async () => {
    const res = await enablePushNotifications(user.uid);
    if (res.ok) setPushState('granted');
    else alert(res.error || 'No se pudieron activar las notificaciones.');
  };

  // Escucha mensajes push con la app abierta y muestra notificación nativa.
  useEffect(() => {
    let unsub = () => {};
    listenForegroundMessages((payload) => {
      const { title, body } = payload.notification || {};
      if (Notification.permission === 'granted') new Notification(title || 'Aviso', { body, icon: '/favicon.svg' });
    }).then(fn => { unsub = fn; });
    return () => unsub();
  }, []);

  const loadMyStudents = async () => {
    const snap = await getDocs(query(collection(db, 'students'), where('parentIds', 'array-contains', user.uid)));
    const list = [];
    snap.forEach(d => list.push({ id: d.id, ...d.data() }));
    setStudents(list);
    if (list.length > 0 && !selectedStudent) setSelectedStudent(list[0]);
  };

  const loadFamily = async () => {
    const snap = await getDocs(collection(db, 'users', user.uid, 'familyMembers'));
    const list = [];
    snap.forEach(d => list.push({ id: d.id, ...d.data() }));
    setFamilyMembers(list);
  };

  useEffect(() => { if (user) { loadMyStudents(); loadFamily(); } }, [user]);

  // Asistencia del día del alumno seleccionado
  useEffect(() => {
    if (!selectedStudent) return;
    const q = query(collection(db, 'attendance', today, 'records'), where('studentId', '==', selectedStudent.id));
    const unsub = onSnapshot(q, (snap) => {
      const records = {};
      snap.forEach(d => { records[d.data().studentId] = d.data(); });
      setTodayRecords(records);
    }, (err) => console.error('Error asistencia', err));
    return unsub;
  }, [selectedStudent, today]);

  // Notificaciones push
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'notifications'), where('parentId', '==', user.uid));
    const unsub = onSnapshot(q, (snap) => {
      const list = [];
      snap.forEach(d => list.push({ id: d.id, ...d.data() }));
      list.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
      setNotifications(list.slice(0, 20));
    }, (err) => console.error('Error notificaciones', err));
    return unsub;
  }, [user]);

  // Avisos: filtra por relevancia a los hijos
  useEffect(() => {
    if (!students.length) { setAnnouncements([]); return; }
    const planteles = new Set(students.map(s => s.plantel));
    const classIds = new Set(students.map(s => s.classId));
    const unsub = onSnapshot(collection(db, 'announcements'), (snap) => {
      const list = [];
      snap.forEach(d => {
        const a = { id: d.id, ...d.data() };
        const sc = a.scope || {};
        const relevant =
          sc.type === 'all' ||
          (sc.type === 'plantel' && planteles.has(sc.value)) ||
          (sc.type === 'class' && classIds.has(sc.value));
        if (relevant) list.push(a);
      });
      list.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
      setAnnouncements(list);
    }, (err) => console.error('Error avisos', err));
    return unsub;
  }, [students]);

  const handleAddStudent = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { plantel, nivel, grado, grupo } = studentForm;
      await addDoc(collection(db, 'students'), {
        ...studentForm,
        classId: makeClassId({ plantel, nivel, grado, grupo }),
        parentIds: [user.uid],
        qrCode: generateQR(),
        createdAt: new Date().toISOString(),
      });
      setShowAddStudent(false);
      setStudentForm(emptyStudent);
      loadMyStudents();
    } catch (err) { alert('Error al agregar alumno: ' + err.message); }
    setLoading(false);
  };

  const handleSaveMember = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await addDoc(collection(db, 'users', user.uid, 'familyMembers'), {
        ...memberForm,
        passCode: generateQR('PASS'),
        active: true,
        createdAt: new Date().toISOString(),
      });
      setShowMember(false);
      setMemberForm(emptyMember);
      loadFamily();
    } catch (err) { alert('Error al guardar familiar: ' + err.message); }
    setLoading(false);
  };

  const toggleMember = async (m) => {
    await updateDoc(doc(db, 'users', user.uid, 'familyMembers', m.id), { active: !m.active });
    loadFamily();
  };
  const removeMember = async (m) => {
    await deleteDoc(doc(db, 'users', user.uid, 'familyMembers', m.id));
    loadFamily();
  };

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    setLoading(true);
    setProfileMsg({ type: '', text: '' });
    try {
      if (profileForm.email !== user.email || profileForm.newPassword) {
        if (!profileForm.currentPassword) throw new Error('Para cambiar correo o contraseña necesitas tu contraseña actual.');
        const credential = EmailAuthProvider.credential(user.email, profileForm.currentPassword);
        await reauthenticateWithCredential(user, credential);
      }
      if (profileForm.displayName !== user.displayName) await updateProfile(user, { displayName: profileForm.displayName });
      if (profileForm.email !== user.email) await updateEmail(user, profileForm.email);
      if (profileForm.newPassword) await updatePassword(user, profileForm.newPassword);
      await updateDoc(doc(db, 'users', user.uid), { displayName: profileForm.displayName, email: profileForm.email });
      setProfileMsg({ type: 'success', text: 'Perfil actualizado correctamente.' });
      setProfileForm(prev => ({ ...prev, currentPassword: '', newPassword: '' }));
    } catch (err) { setProfileMsg({ type: 'error', text: err.message }); }
    setLoading(false);
  };

  const formatTime = (iso) => iso ? new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) : '—';
  const formatDate = (iso) => iso ? new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';

  const niveles = studentForm.plantel ? nivelesDePlantel(studentForm.plantel) : [];
  const grados = studentForm.nivel ? gradosDeNivel(studentForm.nivel) : [];
  const record = selectedStudent ? todayRecords[selectedStudent.id] : null;

  const tabs = [
    { id: 'status', label: 'Asistencia', icon: Bell },
    { id: 'family', label: 'Grupo Familiar', icon: Users2 },
    { id: 'avisos', label: 'Avisos', icon: Megaphone },
    { id: 'profile', label: 'Mi Perfil', icon: UserCircle },
  ];

  return (
    <div className="page-container animate-in">
      <div className="page-header">
        <h1 className="page-title">Portal de Padres</h1>
        <p className="page-subtitle">Bienvenido, {userData?.displayName}</p>
      </div>

      <div className="tabs">
        {tabs.map(t => {
          const Icon = t.icon;
          return (
            <button key={t.id} className={`tab ${activeTab === t.id ? 'active' : ''}`} onClick={() => setActiveTab(t.id)}>
              <Icon size={14} style={{marginRight:4,verticalAlign:'middle'}}/> {t.label}
              {t.id === 'avisos' && announcements.length > 0 && <span className="badge badge-danger" style={{marginLeft:6}}>{announcements.length}</span>}
            </button>
          );
        })}
      </div>

      {activeTab === 'status' && (
        <>
          {pushState !== 'granted' && pushState !== 'unsupported' && (
            <div className="card mb-4" style={{display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, flexWrap:'wrap', background:'var(--info-bg)'}}>
              <span style={{display:'flex', alignItems:'center', gap:8, color:'var(--info)', fontWeight:600}}>
                <BellRing size={18}/> Activa las notificaciones para enterarte al instante de entradas y salidas.
              </span>
              <button onClick={handleEnablePush} className="btn btn-primary btn-sm">Activar notificaciones</button>
            </div>
          )}
          <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
            <div className="flex gap-2 overflow-x-auto" style={{maxWidth:'100%', paddingBottom:4}}>
              {students.map(s => (
                <button key={s.id} onClick={() => setSelectedStudent(s)}
                  className={`btn ${selectedStudent?.id === s.id ? 'btn-primary' : 'btn-secondary'}`} style={{whiteSpace:'nowrap'}}>
                  {s.name}
                </button>
              ))}
            </div>
            <button onClick={() => setShowAddStudent(true)} className="btn btn-gold"><Plus size={16}/> Registrar Alumno</button>
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
            <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px'}}>
              <div className="card" style={{textAlign:'center', padding:32}}>
                <div style={{width:80,height:80,borderRadius:'50%',background: record ? (record.exitTime ? 'var(--warning-bg)' : 'var(--success-bg)') : 'var(--gris-100)', display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 16px',fontSize:'2rem'}}>
                  {record ? (record.exitTime ? '🏠' : '🏫') : '❓'}
                </div>
                <h2 style={{fontSize:'1.5rem',fontWeight:800}}>{selectedStudent.name} {selectedStudent.lastName}</h2>
                <p style={{color:'var(--gris-500)',marginBottom:16}}>{selectedStudent.grado} {selectedStudent.nivel} {selectedStudent.grupo}</p>
                <button onClick={() => setShowQR(selectedStudent)} className="btn btn-sm btn-secondary mb-4"><Download size={14}/> Ver Código QR</button>
                {record ? (
                  <div>
                    <span className={`badge ${record.exitTime ? 'badge-warning' : 'badge-success'}`} style={{fontSize:'0.9rem',padding:'6px 16px'}}>
                      {record.exitTime ? 'Ya salió del colegio' : 'Actualmente en el colegio'}
                    </span>
                    <div className="grid-2 mt-4">
                      <div className="stat-card" style={{padding:12}}><div><div className="stat-label">Entrada</div><div className="stat-value" style={{fontSize:'1.1rem'}}>{formatTime(record.entryTime)}</div></div></div>
                      <div className="stat-card" style={{padding:12}}><div><div className="stat-label">Salida</div><div className="stat-value" style={{fontSize:'1.1rem'}}>{formatTime(record.exitTime)}</div></div></div>
                    </div>
                    {record.pickedUpByName && (
                      <p style={{marginTop:12, fontSize:'0.85rem'}}>Recogido por <strong>{record.pickedUpByName}</strong> ({record.pickedUpByRelation})</p>
                    )}
                  </div>
                ) : (
                  <div style={{marginTop:16}}><span className="badge badge-danger">Sin registro de entrada hoy</span></div>
                )}
              </div>

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

      {activeTab === 'family' && (
        <>
          <div className="flex justify-between items-center mb-4">
            <p style={{color:'var(--gris-500)', fontSize:'0.9rem'}}>Personas autorizadas para recoger a tus hijos. Cada una tiene un pase de acceso con QR.</p>
            <button onClick={() => { setMemberForm(emptyMember); setShowMember(true); }} className="btn btn-primary"><Plus size={16}/> Agregar persona</button>
          </div>
          {familyMembers.length === 0 ? (
            <div className="card"><div className="empty-state"><div className="empty-state-icon">👪</div><p className="empty-state-text">Aún no agregas personas autorizadas.</p></div></div>
          ) : (
            <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(260px, 1fr))', gap:16}}>
              {familyMembers.map(m => (
                <div key={m.id} className="card">
                  <div className="flex justify-between items-center" style={{marginBottom:8}}>
                    <strong>{m.name}</strong>
                    <span className={`badge ${m.active ? 'badge-success' : 'badge-danger'}`}>{m.active ? 'Activo' : 'Inactivo'}</span>
                  </div>
                  <p style={{fontSize:'0.85rem', color:'var(--gris-500)'}}>{m.relation}{m.phone && ` · ${m.phone}`}</p>
                  <div className="flex gap-2" style={{marginTop:12, flexWrap:'wrap'}}>
                    <button onClick={() => setShowPass(m)} className="btn btn-sm btn-secondary"><IdCard size={14}/> Pase QR</button>
                    <button onClick={() => toggleMember(m)} className="btn btn-sm btn-gold">{m.active ? 'Desactivar' : 'Activar'}</button>
                    <button onClick={() => removeMember(m)} className="btn btn-sm btn-danger"><Trash2 size={14}/></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {activeTab === 'avisos' && (
        <div style={{maxWidth:700, margin:'0 auto'}}>
          {announcements.length === 0 ? (
            <div className="card"><div className="empty-state"><div className="empty-state-icon">📣</div><p className="empty-state-text">No hay avisos por ahora.</p></div></div>
          ) : (
            <div className="flex flex-col gap-3">
              {announcements.map(a => (
                <div key={a.id} className="card">
                  <div className="flex justify-between items-center" style={{marginBottom:6}}>
                    <h3 style={{fontWeight:700}}>{a.title}</h3>
                    <span className="badge badge-info">{a.scopeLabel || (a.scope?.type === 'all' ? 'General' : a.scope?.value)}</span>
                  </div>
                  <p style={{fontSize:'0.9rem', color:'var(--gris-700)', whiteSpace:'pre-wrap'}}>{a.body}</p>
                  <p style={{fontSize:'0.75rem', color:'var(--gris-500)', marginTop:8}}>{a.authorName} · {formatDate(a.createdAt)}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'profile' && (
        <div className="card" style={{maxWidth:600, margin:'0 auto'}}>
          <div style={{textAlign:'center', marginBottom:24}}>
            <UserCircle size={64} color="var(--guinda)" style={{margin:'0 auto 8px'}}/>
            <h2 className="card-title">Configuración de Perfil</h2>
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
            <div className="form-group">
              <label className="form-label">Nueva Contraseña (opcional)</label>
              <input type="password" className="form-input" placeholder="Dejar en blanco para no cambiar" value={profileForm.newPassword} onChange={e => setProfileForm({...profileForm, newPassword: e.target.value})} />
            </div>
            {(profileForm.email !== user.email || profileForm.newPassword) && (
              <div className="form-group">
                <label className="form-label">Contraseña Actual</label>
                <input type="password" className="form-input" required value={profileForm.currentPassword} onChange={e => setProfileForm({...profileForm, currentPassword: e.target.value})} />
              </div>
            )}
            <button type="submit" className="btn btn-primary w-full" disabled={loading}><Save size={16}/> {loading ? 'Guardando...' : 'Guardar Cambios'}</button>
          </form>
        </div>
      )}

      {/* Modal Agregar Alumno */}
      {showAddStudent && (
        <div className="modal-overlay" onClick={() => setShowAddStudent(false)}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
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
              <div style={{display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:16}}>
                <div className="form-group">
                  <label className="form-label">Plantel</label>
                  <select className="form-select" value={studentForm.plantel} onChange={e => setStudentForm({...studentForm, plantel: e.target.value, nivel: '', grado: ''})} required>
                    <option value="">...</option>
                    {NOMBRE_PLANTELES.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Nivel</label>
                  <select className="form-select" value={studentForm.nivel} onChange={e => setStudentForm({...studentForm, nivel: e.target.value, grado: ''})} required disabled={!studentForm.plantel}>
                    <option value="">...</option>
                    {niveles.map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Grado</label>
                  <select className="form-select" value={studentForm.grado} onChange={e => setStudentForm({...studentForm, grado: e.target.value})} required disabled={!studentForm.nivel}>
                    <option value="">...</option>
                    {grados.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Grupo</label>
                  <select className="form-select" value={studentForm.grupo} onChange={e => setStudentForm({...studentForm, grupo: e.target.value})} required>
                    <option value="">...</option>
                    {GRUPOS.map(g => <option key={g} value={g}>{g}</option>)}
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

      {/* Modal Agregar Familiar */}
      {showMember && (
        <div className="modal-overlay" onClick={() => setShowMember(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Persona autorizada</h3>
              <button className="modal-close" onClick={() => setShowMember(false)}><X size={16}/></button>
            </div>
            <form onSubmit={handleSaveMember}>
              <div className="form-group">
                <label className="form-label">Nombre completo</label>
                <input className="form-input" value={memberForm.name} onChange={e => setMemberForm({...memberForm, name: e.target.value})} required />
              </div>
              <div className="form-group">
                <label className="form-label">Parentesco</label>
                <select className="form-select" value={memberForm.relation} onChange={e => setMemberForm({...memberForm, relation: e.target.value})}>
                  {RELACIONES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Teléfono (opcional)</label>
                <input className="form-input" value={memberForm.phone} onChange={e => setMemberForm({...memberForm, phone: e.target.value})} />
              </div>
              <div className="modal-footer">
                <button type="button" onClick={() => setShowMember(false)} className="btn btn-secondary">Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={loading}>{loading ? 'Guardando...' : 'Crear pase'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal QR Alumno */}
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
            <p style={{color:'var(--gris-500)'}}>{showQR.grado} {showQR.nivel} {showQR.grupo}</p>
            <button onClick={() => window.print()} className="btn btn-primary mt-4"><Download size={16}/> Imprimir/Guardar</button>
          </div>
        </div>
      )}

      {/* Modal Pase de acceso (familiar) */}
      {showPass && (
        <div className="modal-overlay" onClick={() => setShowPass(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{textAlign:'center'}}>
            <div className="modal-header">
              <h3 className="modal-title">Pase de acceso</h3>
              <button className="modal-close" onClick={() => setShowPass(null)}><X size={16}/></button>
            </div>
            <div style={{background:'var(--crema)',borderRadius:'var(--radius-md)',padding:24,display:'inline-block'}}>
              <QRCodeSVG value={showPass.passCode} size={220} level="H" />
            </div>
            <h3 style={{marginTop:16,fontWeight:700}}>{showPass.name}</h3>
            <p style={{color:'var(--gris-500)'}}>{showPass.relation}</p>
            <p style={{fontSize:'0.75rem',color:'var(--gris-300)',marginTop:8}}>{showPass.passCode}</p>
            <button onClick={() => window.print()} className="btn btn-primary mt-4"><Download size={16}/> Imprimir/Guardar</button>
          </div>
        </div>
      )}
    </div>
  );
}
