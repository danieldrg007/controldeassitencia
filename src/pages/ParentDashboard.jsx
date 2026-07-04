import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, where, getDocs, onSnapshot, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { updateEmail, updatePassword, updateProfile, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { useAuth } from '../context/AuthContext';
import { QRCodeSVG } from 'qrcode.react';
import { LogIn, LogOut, Bell, BellRing, Download, UserCircle, Plus, X, Save, Users2, Megaphone, Trash2, IdCard, Car, KeyRound, Copy, Clock, Camera, Pencil, RefreshCw, StickyNote, GraduationCap, ShieldAlert } from 'lucide-react';
import AnnouncementCard from '../components/AnnouncementCard';
import { sortAnnouncements } from '../config/avisos';
import {
  NOMBRE_PLANTELES, GRUPOS, nivelesDePlantel, gradosDeNivel, makeClassId,
} from '../config/colegio';
import { enablePushNotifications, listenForegroundMessages } from '../notifications';
import { forceUpdate } from '../utils/version';
import { fileToResizedDataURL } from '../utils/image';
import Avatar from '../components/Avatar';
import logo from '../assets/logo.jpg';

function generateQR(prefix = 'COC') {
  return prefix + '-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).substring(2, 7).toUpperCase();
}

const RELACIONES = ['Madre', 'Padre', 'Abuelo/a', 'Tío/a', 'Hermano/a mayor', 'Chofer', 'Otro'];
const NOTE_CATS = {
  conducta:  { label: 'Conducta',  badge: 'badge-warning' },
  academica: { label: 'Académica', badge: 'badge-info' },
  tarea:     { label: 'Tarea',     badge: 'badge-danger' },
  positiva:  { label: 'Positiva',  badge: 'badge-success' },
};
const emptyStudent = { name: '', lastName: '', plantel: '', nivel: '', grado: '', grupo: '' };
const emptyMember = { name: '', relation: 'Madre', phone: '', photo: '' };

export default function ParentDashboard() {
  const { user, userData } = useAuth();
  const [students, setStudents] = useState([]);
  const [todayRecords, setTodayRecords] = useState({});
  const [notifications, setNotifications] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [familyMembers, setFamilyMembers] = useState([]);
  const [authorizations, setAuthorizations] = useState([]);
  const [showAuth, setShowAuth] = useState(false);
  const [authForm, setAuthForm] = useState({ childIds: [], pickupName: '', pickupCode: '', validDate: '' });
  const [myPickupCode, setMyPickupCode] = useState(userData?.pickupCode || '');
  const [copied, setCopied] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [activeTab, setActiveTab] = useState('status');
  const [teacherNotes, setTeacherNotes] = useState([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [grades, setGrades] = useState([]);
  const [gradesLoading, setGradesLoading] = useState(false);

  const [showAddStudent, setShowAddStudent] = useState(false);
  const [showMember, setShowMember] = useState(false);
  const [editingMemberId, setEditingMemberId] = useState(null);
  const [showQR, setShowQR] = useState(null);
  const [showPass, setShowPass] = useState(null);
  const [lightbox, setLightbox] = useState(null); // dataURL de la foto a ampliar (estilo WhatsApp)
  const [readAt, setReadAt] = useState(userData?.announcementsReadAt || ''); // última vez que vio avisos
  const [unreadIds, setUnreadIds] = useState(() => new Set()); // ids resaltados "NUEVO" mientras ve la pestaña
  const [urgentDestacados, setUrgentDestacados] = useState([]); // urgentes recientes para la pantalla de inicio
  const [photoBusy, setPhotoBusy] = useState(false);
  const [acceptResp, setAcceptResp] = useState(false); // aceptación de responsabilidad al autorizar persona
  const [myPhoto, setMyPhoto] = useState(userData?.photo || '');
  const [updating, setUpdating] = useState(false);

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

  const loadAuthorizations = async () => {
    const snap = await getDocs(query(collection(db, 'pickupAuthorizations'), where('authorizedByParentId', '==', user.uid)));
    const list = [];
    snap.forEach(d => list.push({ id: d.id, ...d.data() }));
    list.sort((a, b) => (b.validDate || '').localeCompare(a.validDate || ''));
    setAuthorizations(list);
  };

  useEffect(() => { if (user) { loadMyStudents(); loadFamily(); loadAuthorizations(); } }, [user]);

  // Genera el código de recogida del padre la primera vez que entra a la pestaña.
  const ensurePickupCode = async () => {
    if (myPickupCode) return myPickupCode;
    const code = 'RC-' + Math.random().toString(36).slice(2, 8).toUpperCase();
    await updateDoc(doc(db, 'users', user.uid), { pickupCode: code });
    setMyPickupCode(code);
    return code;
  };
  useEffect(() => { if (user && activeTab === 'recogidas' && !myPickupCode) ensurePickupCode(); }, [user, activeTab]);

  const openAuth = () => {
    setAuthForm({ childIds: students.length === 1 ? [students[0].id] : [], pickupName: '', pickupCode: '', validDate: today });
    setShowAuth(true);
  };

  const toggleAuthChild = (id) =>
    setAuthForm(f => ({ ...f, childIds: f.childIds.includes(id) ? f.childIds.filter(x => x !== id) : [...f.childIds, id] }));

  const handleCreateAuth = async (e) => {
    e.preventDefault();
    if (!authForm.childIds.length) { alert('Selecciona al menos un hijo.'); return; }
    if (!authForm.pickupCode.trim()) { alert('Ingresa el código de quien va a recoger.'); return; }
    setLoading(true);
    try {
      const code = authForm.pickupCode.trim().toUpperCase();
      await Promise.all(authForm.childIds.map(cid => {
        const st = students.find(s => s.id === cid);
        return addDoc(collection(db, 'pickupAuthorizations'), {
          studentId: cid,
          studentName: st ? `${st.name} ${st.lastName}` : '',
          authorizedByParentId: user.uid,
          authorizedByName: userData?.displayName || '',
          pickupCode: code,
          pickupName: authForm.pickupName.trim() || 'Persona autorizada',
          validDate: authForm.validDate,
          status: 'active',
          createdAt: new Date().toISOString(),
        });
      }));
      setShowAuth(false);
      loadAuthorizations();
    } catch (err) { alert('Error al autorizar: ' + err.message); }
    setLoading(false);
  };

  const cancelAuth = async (a) => {
    if (!window.confirm('¿Cancelar esta autorización de recogida?')) return;
    await deleteDoc(doc(db, 'pickupAuthorizations', a.id));
    loadAuthorizations();
  };

  const copyPickupCode = () => {
    navigator.clipboard.writeText(myPickupCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

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

  // Notas/observaciones del profesor visibles para el tutor (del alumno seleccionado)
  useEffect(() => {
    if (!selectedStudent) { setTeacherNotes([]); return; }
    let active = true;
    (async () => {
      setNotesLoading(true);
      try {
        const snap = await getDocs(query(
          collection(db, 'observations'),
          where('studentId', '==', selectedStudent.id),
          where('visibleToParent', '==', true),
        ));
        const arr = [];
        snap.forEach(d => arr.push({ id: d.id, ...d.data() }));
        arr.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
        if (active) setTeacherNotes(arr);
      } catch (e) { console.error('Error notas del profesor', e); if (active) setTeacherNotes([]); }
      if (active) setNotesLoading(false);
    })();
    return () => { active = false; };
  }, [selectedStudent]);

  // Calificaciones del alumno seleccionado
  useEffect(() => {
    if (!selectedStudent) { setGrades([]); return; }
    let active = true;
    (async () => {
      setGradesLoading(true);
      try {
        const snap = await getDocs(query(collection(db, 'grades'), where('studentId', '==', selectedStudent.id)));
        const arr = [];
        snap.forEach(d => arr.push({ id: d.id, ...d.data() }));
        if (active) setGrades(arr);
      } catch (e) { console.error('Error calificaciones', e); if (active) setGrades([]); }
      if (active) setGradesLoading(false);
    })();
    return () => { active = false; };
  }, [selectedStudent]);

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
      const sorted = sortAnnouncements(list);
      setAnnouncements(sorted);
      // Urgentes recientes (14 días) para destacar en la pantalla de inicio.
      const cutoff = Date.now() - 14 * 24 * 3600 * 1000;
      setUrgentDestacados(sorted.filter(a => a.priority === 'urgente' && new Date(a.createdAt || 0).getTime() >= cutoff));
    }, (err) => console.error('Error avisos', err));
    return unsub;
  }, [students]);

  // Mantiene sincronizada la marca de "última lectura" con el perfil.
  useEffect(() => { setReadAt(userData?.announcementsReadAt || ''); }, [userData]);

  // Al abrir la pestaña de Avisos: capturamos cuáles eran nuevos (para resaltarlos
  // mientras los ve) y marcamos todo como leído en el perfil del padre.
  useEffect(() => {
    if (activeTab !== 'avisos' || !user) return;
    const nuevos = announcements.filter(a => !readAt || (a.createdAt || '') > readAt);
    if (!nuevos.length) return;
    setUnreadIds(new Set(nuevos.map(a => a.id)));
    const now = new Date().toISOString();
    setReadAt(now);
    updateDoc(doc(db, 'users', user.uid), { announcementsReadAt: now }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, announcements, user]);

  const unreadCount = announcements.filter(a => !readAt || (a.createdAt || '') > readAt).length;

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

  const openAddMember = () => { setMemberForm(emptyMember); setEditingMemberId(null); setAcceptResp(false); setShowMember(true); };
  const openEditMember = (m) => {
    setMemberForm({ name: m.name || '', relation: m.relation || 'Madre', phone: m.phone || '', photo: m.photo || '' });
    setEditingMemberId(m.id);
    setShowMember(true);
  };
  const closeMember = () => { setShowMember(false); setEditingMemberId(null); setMemberForm(emptyMember); };

  // Procesa la foto elegida (familiar): la redimensiona en el navegador y la deja en el formulario.
  const handleMemberPhoto = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setPhotoBusy(true);
    try {
      const url = await fileToResizedDataURL(file);
      setMemberForm(f => ({ ...f, photo: url }));
    } catch (err) { alert(err.message || 'No se pudo procesar la imagen.'); }
    setPhotoBusy(false);
  };

  // Foto del propio padre/tutor (titular): se guarda en su documento de usuario.
  const handleMyPhoto = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setPhotoBusy(true);
    try {
      const url = await fileToResizedDataURL(file);
      await updateDoc(doc(db, 'users', user.uid), { photo: url });
      setMyPhoto(url);
    } catch (err) { alert(err.message || 'No se pudo guardar la foto.'); }
    setPhotoBusy(false);
  };

  const handleSaveMember = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (editingMemberId) {
        await updateDoc(doc(db, 'users', user.uid, 'familyMembers', editingMemberId), {
          name: memberForm.name,
          relation: memberForm.relation,
          phone: memberForm.phone || '',
          photo: memberForm.photo || '',
        });
      } else {
        if (!acceptResp) { alert('Debes aceptar la responsabilidad para autorizar a esta persona.'); setLoading(false); return; }
        await addDoc(collection(db, 'users', user.uid, 'familyMembers'), {
          ...memberForm,
          passCode: generateQR('PASS'),
          active: true,
          responsibilityAcceptedAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
        });
      }
      closeMember();
      loadFamily();
    } catch (err) { alert('Error al guardar familiar: ' + err.message); }
    setLoading(false);
  };

  const toggleMember = async (m) => {
    if (m.active) {
      const students_names = students.map(s => s.name).join(', ') || 'tus hijos';
      if (!window.confirm(`⚠️ ¿Desactivar a ${m.name}?\n\nEsta persona ya NO podrá recoger a ${students_names}. Su credencial QR dejará de ser válida en el filtro de salida hasta que la actives de nuevo.`)) return;
    }
    await updateDoc(doc(db, 'users', user.uid, 'familyMembers', m.id), { active: !m.active });
    loadFamily();
  };
  const removeMember = async (m) => {
    if (!window.confirm(`¿Eliminar a ${m.name} de tu grupo familiar?\n\nSu credencial QR quedará invalidada de forma permanente. Esta acción no se puede deshacer.`)) return;
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

  // Estado visual de la tarjeta "hero" del alumno según su asistencia de hoy.
  const heroState = !record ? 'none' : (record.exitTime ? 'out' : 'in');
  const HERO = {
    in:   { grad: 'linear-gradient(135deg,#16A34A,#15803D)', emoji: '🏫', text: 'En el colegio' },
    out:  { grad: 'linear-gradient(135deg,#2563EB,#1D4ED8)', emoji: '🏠', text: 'Ya salió del colegio' },
    none: { grad: 'linear-gradient(135deg,#B9A6AB,#8C6A70)', emoji: '🕗', text: 'Sin registro de entrada hoy' },
  }[heroState];

  const tabs = [
    { id: 'status', label: 'Asistencia', short: 'Asistencia', icon: Bell },
    { id: 'family', label: 'Grupo Familiar', short: 'Familia', icon: Users2 },
    { id: 'recogidas', label: 'Recogidas', short: 'Recogidas', icon: Car },
    { id: 'avisos', label: 'Avisos', short: 'Avisos', icon: Megaphone },
    { id: 'profile', label: 'Mi Perfil', short: 'Perfil', icon: UserCircle },
  ];

  return (
    <div className="page-container pp-page animate-in">
      <div className="pp-header">
        <Avatar src={myPhoto} name={userData?.displayName} size={52} onClick={myPhoto ? () => setLightbox(myPhoto) : undefined} />
        <div>
          <div className="pp-hello">Hola 👋</div>
          <div className="pp-name">{userData?.displayName || 'Bienvenido'}</div>
        </div>
      </div>

      {/* Tabs superiores (escritorio) */}
      <div className="tabs pp-tabs-top">
        {tabs.map(t => {
          const Icon = t.icon;
          return (
            <button key={t.id} className={`tab ${activeTab === t.id ? 'active' : ''}`} onClick={() => setActiveTab(t.id)}>
              <Icon size={14} style={{marginRight:4,verticalAlign:'middle'}}/> {t.label}
              {t.id === 'avisos' && unreadCount > 0 && <span className="badge badge-danger" style={{marginLeft:6}}>{unreadCount}</span>}
            </button>
          );
        })}
      </div>

      {activeTab === 'status' && (
        <>
          {urgentDestacados.length > 0 && (
            <div className="mb-4 flex flex-col gap-3">
              {urgentDestacados.map(a => (
                <AnnouncementCard key={a.id} a={a} onImageClick={setLightbox} unread={unreadIds.has(a.id)} />
              ))}
            </div>
          )}
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
            <>
            <div className="pp-grid">
              {/* Tarjeta hero del alumno */}
              <div className="card" style={{padding:0, overflow:'hidden'}}>
                <div style={{background: HERO.grad, color:'#fff', padding:'28px 20px', textAlign:'center'}}>
                  <div style={{fontSize:'3rem', lineHeight:1}}>{HERO.emoji}</div>
                  <div style={{fontWeight:800, fontSize:'1.05rem', marginTop:8, letterSpacing:0.2}}>{HERO.text}</div>
                </div>
                <div style={{padding:'20px', textAlign:'center'}}>
                  <h2 style={{fontSize:'1.4rem', fontWeight:800}}>{selectedStudent.name} {selectedStudent.lastName}</h2>
                  <p style={{color:'var(--gris-500)', marginTop:2}}>{selectedStudent.grado} {selectedStudent.nivel} {selectedStudent.grupo}</p>

                  {record ? (
                    <>
                      <div className="grid-2 mt-4" style={{textAlign:'left'}}>
                        <div style={{display:'flex', alignItems:'center', gap:10, padding:12, borderRadius:'var(--radius-md)', background:'var(--success-bg)'}}>
                          <LogIn size={20} color="var(--success)"/>
                          <div><div className="stat-label">Entrada</div><div style={{fontWeight:800, fontSize:'1.05rem', color:'var(--text-main)'}}>{formatTime(record.entryTime)}</div></div>
                        </div>
                        <div style={{display:'flex', alignItems:'center', gap:10, padding:12, borderRadius:'var(--radius-md)', background:'var(--info-bg)'}}>
                          <LogOut size={20} color="var(--info)"/>
                          <div><div className="stat-label">Salida</div><div style={{fontWeight:800, fontSize:'1.05rem', color:'var(--text-main)'}}>{formatTime(record.exitTime)}</div></div>
                        </div>
                      </div>
                      {record.pickedUpByName && (
                        <p style={{marginTop:14, fontSize:'0.85rem', color:'var(--gris-600)'}}>Recogido por <strong>{record.pickedUpByName}</strong>{record.pickedUpByRelation ? ` (${record.pickedUpByRelation})` : ''}</p>
                      )}
                    </>
                  ) : (
                    <p style={{marginTop:14, fontSize:'0.88rem', color:'var(--gris-500)'}}>Aún no se ha registrado su entrada de hoy.</p>
                  )}

                  <button onClick={() => setShowQR(selectedStudent)} className="btn btn-secondary w-full" style={{marginTop:18}}><IdCard size={16}/> Ver código QR de acceso</button>
                </div>
              </div>

              {/* Notificaciones */}
              <div className="card">
                <h3 className="card-title" style={{marginBottom:16, display:'flex', alignItems:'center', gap:8}}><Bell size={18} color="var(--guinda)"/> Últimos movimientos</h3>
                {notifications.length === 0 ? (
                  <div className="empty-state" style={{padding:24}}><div className="empty-state-icon">🔔</div><p className="empty-state-text">No hay notificaciones aún</p></div>
                ) : (
                  <div className="flex flex-col gap-2" style={{maxHeight:420, overflowY:'auto'}}>
                    {notifications.map(n => (
                      <div key={n.id} style={{padding:'12px 14px', borderRadius:'var(--radius-md)', background:'var(--surface-hover)', display:'flex', alignItems:'center', gap:12}}>
                        <span style={{width:36, height:36, borderRadius:'50%', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', background: n.type === 'entry' ? 'var(--success-bg)' : 'var(--info-bg)'}}>
                          {n.type === 'entry' ? <LogIn size={18} color="var(--success)"/> : <LogOut size={18} color="var(--info)"/>}
                        </span>
                        <div style={{flex:1, minWidth:0}}>
                          <p style={{fontSize:'0.875rem', fontWeight:500}}>{n.message}</p>
                          <p style={{fontSize:'0.72rem', color:'var(--gris-500)', marginTop:2}}>{formatDate(n.createdAt)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Notas del profesor (compartidas con el tutor) */}
            <div className="card" style={{marginTop:16}}>
              <h3 className="card-title" style={{marginBottom:16, display:'flex', alignItems:'center', gap:8}}><StickyNote size={18} color="var(--guinda)"/> Notas del profesor</h3>
              {notesLoading ? (
                <p style={{textAlign:'center', color:'var(--gris-500)', padding:16, fontSize:'0.88rem'}}>Cargando notas…</p>
              ) : teacherNotes.length === 0 ? (
                <div className="empty-state" style={{padding:24}}><div className="empty-state-icon">📝</div><p className="empty-state-text">Sin notas del profesor por ahora.</p></div>
              ) : (
                <div className="flex flex-col gap-2">
                  {teacherNotes.map(n => {
                    const cat = NOTE_CATS[n.category] || NOTE_CATS.conducta;
                    return (
                      <div key={n.id} style={{padding:'12px 14px', borderRadius:'var(--radius-md)', background:'var(--surface-hover)', borderLeft:'4px solid var(--guinda)'}}>
                        <div className="flex justify-between items-center" style={{marginBottom:4, gap:8}}>
                          <span className={`badge ${cat.badge}`}>{cat.label}</span>
                          <span style={{fontSize:'0.72rem', color:'var(--gris-500)'}}>{formatDate(n.createdAt)}</span>
                        </div>
                        <p style={{fontSize:'0.9rem', whiteSpace:'pre-wrap'}}>{n.text}</p>
                        <p style={{fontSize:'0.72rem', color:'var(--gris-500)', marginTop:4}}>— {n.authorName}</p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Calificaciones por materia */}
            <div className="card" style={{marginTop:16}}>
              <h3 className="card-title" style={{marginBottom:16, display:'flex', alignItems:'center', gap:8}}><GraduationCap size={18} color="var(--guinda)"/> Calificaciones</h3>
              {gradesLoading ? (
                <p style={{textAlign:'center', color:'var(--gris-500)', padding:16, fontSize:'0.88rem'}}>Cargando calificaciones…</p>
              ) : grades.length === 0 ? (
                <div className="empty-state" style={{padding:24}}><div className="empty-state-icon">🎓</div><p className="empty-state-text">Aún no hay calificaciones registradas.</p></div>
              ) : (
                (() => {
                  const bySubject = {};
                  grades.forEach(g => { const k = g.subjectName || 'Materia'; (bySubject[k] = bySubject[k] || []).push(g); });
                  return (
                    <div className="flex flex-col gap-3">
                      {Object.keys(bySubject).sort().map(sub => (
                        <div key={sub} style={{border:'1px solid var(--gris-200)', borderRadius:'var(--radius-md)', overflow:'hidden'}}>
                          <div style={{padding:'8px 12px', background:'var(--surface-hover)', fontWeight:700, fontSize:'0.9rem'}}>{sub}</div>
                          <div style={{padding:'8px 12px', display:'flex', flexDirection:'column', gap:8}}>
                            {bySubject[sub].sort((a,b)=>(a.period||'').localeCompare(b.period||'')).map(g => (
                              <div key={g.id} style={{display:'flex', alignItems:'center', gap:10, flexWrap:'wrap'}}>
                                <span style={{fontSize:'0.82rem', color:'var(--gris-600)', minWidth:90}}>{g.period}</span>
                                <span className={`badge ${Number(g.score) >= 6 ? 'badge-success' : 'badge-danger'}`} style={{fontSize:'0.85rem', fontWeight:800}}>{g.score}</span>
                                {g.comment && <span style={{fontSize:'0.8rem', color:'var(--gris-500)'}}>{g.comment}</span>}
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()
              )}
            </div>
            </>
          )}
        </>
      )}

      {activeTab === 'family' && (
        <>
          <div className="flex justify-between items-center mb-4 flex-wrap gap-3">
            <p style={{color:'var(--gris-500)', fontSize:'0.9rem', flex:'1 1 240px', minWidth:0}}>Personas autorizadas para recoger a tus hijos. Cada una tiene su credencial digital con foto y QR.</p>
            <button onClick={openAddMember} className="btn btn-primary"><Plus size={16}/> Agregar persona</button>
          </div>
          <div className="notice notice-info mb-4">
            <ShieldAlert size={18} style={{flexShrink:0, marginTop:2}}/>
            <p style={{fontSize:'0.8rem', lineHeight:1.5}}>
              <strong>Recuerda:</strong> tú eres responsable de las personas que autorizas en tu grupo familiar. La credencial QR de cada persona es personal e intransferible; si alguien ya no debe recoger a tus hijos, desactívala o elimínala.
            </p>
          </div>
          {familyMembers.length === 0 ? (
            <div className="card"><div className="empty-state"><div className="empty-state-icon">👪</div><p className="empty-state-text">Aún no agregas personas autorizadas.</p></div></div>
          ) : (
            <div className="pp-grid">
              {familyMembers.map(m => (
                <div key={m.id} className="card" style={{textAlign:'center'}}>
                  <div style={{display:'flex', justifyContent:'center', marginBottom:10}}>
                    <Avatar src={m.photo} name={m.name} size={72} onClick={m.photo ? () => setLightbox(m.photo) : undefined} />
                  </div>
                  <div className="flex justify-between items-center" style={{marginBottom:6}}>
                    <strong>{m.name}</strong>
                    <span className={`badge ${m.active ? 'badge-success' : 'badge-danger'}`}>{m.active ? 'Activo' : 'Inactivo'}</span>
                  </div>
                  <p style={{fontSize:'0.85rem', color:'var(--gris-500)'}}>{m.relation}{m.phone && ` · ${m.phone}`}</p>
                  <div className="flex gap-2" style={{marginTop:12, flexWrap:'wrap', justifyContent:'center'}}>
                    <button onClick={() => setShowPass(m)} className="btn btn-sm btn-secondary"><IdCard size={14}/> Credencial</button>
                    <button onClick={() => openEditMember(m)} className="btn btn-sm btn-secondary"><Pencil size={14}/> Editar</button>
                    <button onClick={() => toggleMember(m)} className="btn btn-sm btn-gold">{m.active ? 'Desactivar' : 'Activar'}</button>
                    <button onClick={() => removeMember(m)} className="btn btn-sm btn-danger"><Trash2 size={14}/></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {activeTab === 'recogidas' && (
        <div className="pp-grid">
          {/* Mi código de recogida */}
          <div className="card" style={{textAlign:'center'}}>
            <KeyRound size={32} color="var(--guinda)" style={{margin:'0 auto 8px'}}/>
            <h3 className="card-title" style={{marginBottom:4}}>Mi código de recogida</h3>
            <p style={{color:'var(--gris-500)', fontSize:'0.85rem', marginBottom:16}}>
              Úsalo cuando <strong>tú</strong> vayas a recoger a otros niños: compártelo con sus papás para que te autoricen.
            </p>
            {myPickupCode ? (
              <>
                <div style={{background:'var(--crema)', borderRadius:'var(--radius-md)', padding:20, display:'inline-block'}}>
                  <QRCodeSVG value={myPickupCode} size={160} level="H" />
                </div>
                <div className="flex items-center justify-center gap-2" style={{marginTop:16}}>
                  <code style={{fontSize:'1.2rem', fontWeight:800, letterSpacing:1, color:'var(--guinda)'}}>{myPickupCode}</code>
                  <button onClick={copyPickupCode} className="btn btn-sm btn-secondary"><Copy size={14}/> {copied ? 'Copiado' : 'Copiar'}</button>
                </div>
              </>
            ) : (
              <p style={{color:'var(--gris-500)'}}>Generando tu código...</p>
            )}
          </div>

          {/* Autorizaciones que he creado */}
          <div className="card">
            <div className="flex justify-between items-center" style={{marginBottom:12}}>
              <h3 className="card-title" style={{margin:0}}>Autorizar a alguien</h3>
              <button onClick={openAuth} className="btn btn-primary btn-sm" disabled={students.length === 0}><Plus size={14}/> Nueva</button>
            </div>
            <p style={{color:'var(--gris-500)', fontSize:'0.85rem', marginBottom:16}}>
              Cuando <strong>otra persona</strong> vaya a recoger a tu hijo (por ejemplo, el papá de un amiguito), pega aquí <em>su</em> código de recogida y elige la fecha.
            </p>
            {authorizations.length === 0 ? (
              <div className="empty-state" style={{padding:24}}><p className="empty-state-text">No has creado autorizaciones.</p></div>
            ) : (
              <div className="flex flex-col gap-2">
                {authorizations.map(a => {
                  const isToday = a.validDate === today;
                  const past = a.validDate < today;
                  return (
                    <div key={a.id} style={{padding:12, borderRadius:'var(--radius-sm)', border:'1px solid var(--gris-200)', opacity: past ? 0.55 : 1}}>
                      <div className="flex justify-between items-center">
                        <strong style={{fontSize:'0.9rem'}}>{a.studentName}</strong>
                        <button onClick={() => cancelAuth(a)} className="btn btn-sm btn-danger" title="Cancelar"><Trash2 size={12}/></button>
                      </div>
                      <p style={{fontSize:'0.8rem', color:'var(--gris-500)', marginTop:4, display:'flex', alignItems:'center', gap:6, flexWrap:'wrap'}}>
                        <Car size={13}/> {a.pickupName} · <code style={{color:'var(--guinda)', fontWeight:700}}>{a.pickupCode}</code>
                      </p>
                      <p style={{fontSize:'0.78rem', marginTop:4}}>
                        <span className={`badge ${isToday ? 'badge-success' : past ? 'badge-danger' : 'badge-info'}`}>
                          <Clock size={11}/> {past ? 'Vencida' : isToday ? 'Válida hoy' : 'Programada'} · {a.validDate}
                        </span>
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'avisos' && (
        <div style={{maxWidth:700, margin:'0 auto'}}>
          {announcements.length === 0 ? (
            <div className="card"><div className="empty-state"><div className="empty-state-icon">📣</div><p className="empty-state-text">No hay avisos por ahora.</p></div></div>
          ) : (
            <div className="flex flex-col gap-3">
              {announcements.map(a => (
                <AnnouncementCard key={a.id} a={a} onImageClick={setLightbox} unread={unreadIds.has(a.id)} />
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'profile' && (
        <div className="card" style={{maxWidth:600, margin:'0 auto'}}>
          <div style={{textAlign:'center', marginBottom:24}}>
            <div style={{display:'flex', justifyContent:'center'}}>
              <Avatar src={myPhoto} name={profileForm.displayName || userData?.displayName} size={96} onClick={myPhoto ? () => setLightbox(myPhoto) : undefined} />
            </div>
            <div style={{marginTop:10, display:'flex', gap:8, justifyContent:'center', flexWrap:'wrap'}}>
              <label className="btn btn-sm btn-secondary" style={{cursor: photoBusy ? 'wait' : 'pointer'}}>
                <Camera size={14}/> {photoBusy ? 'Procesando...' : (myPhoto ? 'Cambiar foto' : 'Subir foto')}
                <input type="file" accept="image/*" hidden disabled={photoBusy} onChange={handleMyPhoto} />
              </label>
            </div>
            <p style={{fontSize:'0.72rem', color:'var(--gris-500)', marginTop:6}}>Tu foto ayuda al checador a identificarte cuando recoges a tu hijo.</p>
            <h2 className="card-title" style={{marginTop:16}}>Configuración de Perfil</h2>
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

          <div style={{marginTop:24, paddingTop:16, borderTop:'1px solid var(--gris-200)', textAlign:'center'}}>
            <p style={{fontSize:'0.78rem', color:'var(--gris-500)', marginBottom:10}}>
              ¿No ves los cambios más recientes? Recarga la app a la última versión.
            </p>
            <button type="button" onClick={async () => { setUpdating(true); await forceUpdate(); }} disabled={updating} className="btn btn-secondary btn-sm">
              <RefreshCw size={14}/> {updating ? 'Actualizando…' : 'Obtener nueva actualización'}
            </button>
          </div>
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
              <div className="form-grid-auto">
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

      {/* Modal Agregar/Editar Familiar */}
      {showMember && (
        <div className="modal-overlay" onClick={closeMember}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">{editingMemberId ? 'Editar persona' : 'Persona autorizada'}</h3>
              <button className="modal-close" onClick={closeMember}><X size={16}/></button>
            </div>
            <form onSubmit={handleSaveMember}>
              <div style={{textAlign:'center', marginBottom:16}}>
                <div style={{display:'flex', justifyContent:'center'}}>
                  <Avatar src={memberForm.photo} name={memberForm.name} size={96} onClick={memberForm.photo ? () => setLightbox(memberForm.photo) : undefined} />
                </div>
                <div style={{marginTop:10, display:'flex', gap:8, justifyContent:'center', flexWrap:'wrap'}}>
                  <label className="btn btn-sm btn-secondary" style={{cursor: photoBusy ? 'wait' : 'pointer'}}>
                    <Camera size={14}/> {photoBusy ? 'Procesando...' : (memberForm.photo ? 'Cambiar foto' : 'Subir foto')}
                    <input type="file" accept="image/*" hidden disabled={photoBusy} onChange={handleMemberPhoto} />
                  </label>
                  {memberForm.photo && (
                    <button type="button" className="btn btn-sm btn-danger" onClick={() => setMemberForm(f => ({ ...f, photo: '' }))}>Quitar</button>
                  )}
                </div>
                <p style={{fontSize:'0.72rem', color:'var(--gris-500)', marginTop:6}}>La foto aparecerá en su credencial y la verá el checador al recoger.</p>
              </div>
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
              {!editingMemberId && (
                <div className="notice notice-warning" style={{marginBottom:16}}>
                  <ShieldAlert size={20} style={{flexShrink:0, marginTop:2}}/>
                  <div>
                    <p style={{fontSize:'0.83rem', fontWeight:700, marginBottom:4}}>Responsabilidad del tutor</p>
                    <p style={{fontSize:'0.8rem', lineHeight:1.5}}>
                      Como padre/madre o tutor, <strong>usted es responsable</strong> de las personas que autoriza para recoger a su(s) hijo(s).
                      Verifique la identidad de esta persona y asegúrese de que esté enterada de que portará una credencial de recogida a su nombre.
                    </p>
                    <label style={{display:'flex', alignItems:'flex-start', gap:8, marginTop:10, cursor:'pointer', fontSize:'0.82rem', fontWeight:600}}>
                      <input type="checkbox" checked={acceptResp} onChange={e => setAcceptResp(e.target.checked)} style={{marginTop:2, width:16, height:16, accentColor:'var(--guinda)'}} />
                      Acepto la responsabilidad de autorizar a esta persona para recoger a mi(s) hijo(s).
                    </label>
                  </div>
                </div>
              )}
              <div className="modal-footer">
                <button type="button" onClick={closeMember} className="btn btn-secondary">Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={loading || photoBusy || (!editingMemberId && !acceptResp)}>{loading ? 'Guardando...' : (editingMemberId ? 'Guardar cambios' : 'Crear pase')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Autorizar Recogida */}
      {showAuth && (
        <div className="modal-overlay" onClick={() => setShowAuth(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Autorizar recogida temporal</h3>
              <button className="modal-close" onClick={() => setShowAuth(false)}><X size={16}/></button>
            </div>
            <form onSubmit={handleCreateAuth}>
              <div className="form-group">
                <label className="form-label">¿A quién(es) van a recoger?</label>
                <div className="flex flex-col gap-2">
                  {students.map(s => (
                    <button type="button" key={s.id} onClick={() => toggleAuthChild(s.id)}
                      className={`btn ${authForm.childIds.includes(s.id) ? 'btn-primary' : 'btn-secondary'}`}
                      style={{justifyContent:'flex-start'}}>
                      {authForm.childIds.includes(s.id) ? '✓ ' : ''}{s.name} {s.lastName}
                    </button>
                  ))}
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Nombre de quien recoge</label>
                <input className="form-input" placeholder="Ej. Laura (mamá de Diego)" value={authForm.pickupName} onChange={e => setAuthForm({...authForm, pickupName: e.target.value})} required />
              </div>
              <div className="form-group">
                <label className="form-label">Código de recogida de esa persona</label>
                <input className="form-input" placeholder="Ej. RC-AB12CD" style={{textTransform:'uppercase', letterSpacing:1, fontWeight:700}} value={authForm.pickupCode} onChange={e => setAuthForm({...authForm, pickupCode: e.target.value})} required />
                <p style={{fontSize:'0.75rem', color:'var(--gris-500)', marginTop:4}}>Pídele su código (lo encuentra en su app, pestaña Recogidas).</p>
              </div>
              <div className="form-group">
                <label className="form-label">Fecha válida</label>
                <input type="date" className="form-input" min={today} value={authForm.validDate} onChange={e => setAuthForm({...authForm, validDate: e.target.value})} required />
              </div>
              <div className="modal-footer">
                <button type="button" onClick={() => setShowAuth(false)} className="btn btn-secondary">Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={loading}>{loading ? 'Autorizando...' : 'Autorizar'}</button>
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

      {/* Modal Credencial digital (familiar) */}
      {showPass && (
        <div className="modal-overlay" onClick={() => setShowPass(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{textAlign:'center', maxWidth:380}}>
            <div className="modal-header">
              <h3 className="modal-title">Credencial digital</h3>
              <button className="modal-close" onClick={() => setShowPass(null)}><X size={16}/></button>
            </div>
            <div style={{borderRadius:'var(--radius-lg)', overflow:'hidden', border:'1px solid var(--gris-200)', boxShadow:'var(--shadow-md)'}}>
              <div style={{background:'linear-gradient(135deg,var(--guinda),var(--guinda-dark))', color:'#fff', padding:'14px 16px', display:'flex', alignItems:'center', gap:10, justifyContent:'center'}}>
                <img src={logo} alt="Logo" style={{width:34,height:34,borderRadius:'50%',objectFit:'cover'}} />
                <div style={{textAlign:'left'}}>
                  <div style={{fontWeight:800, fontSize:'0.92rem', lineHeight:1.1}}>Colegio Oliverio Cromwell</div>
                  <div style={{fontSize:'0.7rem', opacity:0.85}}>Persona autorizada para recoger</div>
                </div>
              </div>
              <div style={{padding:'20px 16px', background:'#fff'}}>
                <div style={{display:'flex', justifyContent:'center'}}>
                  <Avatar src={showPass.photo} name={showPass.name} size={110} onClick={showPass.photo ? () => setLightbox(showPass.photo) : undefined} />
                </div>
                <h3 style={{marginTop:12, fontWeight:800, fontSize:'1.2rem'}}>{showPass.name}</h3>
                <div style={{marginTop:4}}><span className="badge badge-gold">{showPass.relation}</span></div>
                <div style={{background:'var(--crema)', borderRadius:'var(--radius-md)', padding:16, display:'inline-block', marginTop:16}}>
                  <QRCodeSVG value={showPass.passCode} size={150} level="H" />
                </div>
                <p style={{fontSize:'0.72rem', color:'var(--gris-300)', marginTop:8, letterSpacing:1}}>{showPass.passCode}</p>
              </div>
            </div>
            <button onClick={() => window.print()} className="btn btn-primary mt-4"><Download size={16}/> Imprimir/Guardar</button>
          </div>
        </div>
      )}

      {/* Navegación inferior (móvil) — estilo app nativa */}
      <nav className="pp-bottomnav">
        {tabs.map(t => {
          const Icon = t.icon;
          const isActive = activeTab === t.id;
          return (
            <button key={t.id} className={`pp-tab ${isActive ? 'active' : ''}`} onClick={() => setActiveTab(t.id)}>
              <Icon size={20} strokeWidth={isActive ? 2.4 : 2} />
              <span>{t.short}</span>
              {t.id === 'avisos' && unreadCount > 0 && (
                <span className="pp-tab-dot">{unreadCount > 9 ? '9+' : unreadCount}</span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Visor de foto a pantalla completa (estilo WhatsApp): toca para cerrar */}
      {lightbox && (
        <div onClick={() => setLightbox(null)}
          style={{position:'fixed', inset:0, background:'rgba(0,0,0,0.92)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:3000, cursor:'zoom-out', padding:24}}>
          <img src={lightbox} alt="" style={{maxWidth:'95vw', maxHeight:'90vh', borderRadius:12, boxShadow:'0 10px 40px rgba(0,0,0,0.5)'}} />
          <button onClick={() => setLightbox(null)}
            style={{position:'absolute', top:20, right:20, background:'rgba(255,255,255,0.15)', border:'none', color:'#fff', borderRadius:'50%', width:44, height:44, fontSize:20, cursor:'pointer'}}>✕</button>
        </div>
      )}
    </div>
  );
}
