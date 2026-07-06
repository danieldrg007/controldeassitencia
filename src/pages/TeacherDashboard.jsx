import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../firebase';
import { collection, query, where, getDocs, getDoc, doc, setDoc, addDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { updateEmail, updatePassword, updateProfile, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { useAuth } from '../context/AuthContext';
import { ClipboardCheck, Megaphone, Check, X, Clock, Users, Send, UserCircle, Camera, Save, RefreshCw, MessageCircle, StickyNote, Mail, Plus, Trash2, CalendarDays, GraduationCap, ImagePlus, Paperclip, FileText, FileSpreadsheet } from 'lucide-react';
import { parseClassId, classLabel, PERIODOS } from '../config/colegio';
import { PRIORIDADES, CATEGORIAS } from '../config/avisos';
import { uploadAnnouncementFile, uploadAnnouncementCover, humanSize } from '../utils/announcements';
import Avatar from '../components/Avatar';
import { fileToResizedDataURL } from '../utils/image';
import { forceUpdate } from '../utils/version';
import { attendancePDF, attendanceExcel } from '../utils/reports';

const ESTADOS = {
  present: { label: 'Presente', badge: 'badge-success', icon: Check },
  late:    { label: 'Tarde',    badge: 'badge-warning', icon: Clock },
  absent:  { label: 'Ausente',  badge: 'badge-danger',  icon: X },
};

const NOTE_CATS = {
  conducta:  { label: 'Conducta',   badge: 'badge-warning' },
  academica: { label: 'Académica',  badge: 'badge-info' },
  tarea:     { label: 'Tarea',      badge: 'badge-danger' },
  positiva:  { label: 'Positiva',   badge: 'badge-success' },
};

const uniq = (arr) => [...new Set(arr)];
const sanitize = (s) => (s || '').replace(/[^a-zA-Z0-9]/g, '_');

export default function TeacherDashboard() {
  const { user, userData } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState('asistencia');

  const classIds = useMemo(
    () => (Array.isArray(userData?.classIds) ? userData.classIds : []),
    [userData]
  );
  const classes = useMemo(
    () => classIds.map(id => ({ id, label: classLabel(parseClassId(id)) })),
    [classIds]
  );

  const [selectedClass, setSelectedClass] = useState('');
  useEffect(() => {
    if (!selectedClass && classes.length) setSelectedClass(classes[0].id);
  }, [classes, selectedClass]);

  const today = new Date().toISOString().split('T')[0];
  const [attDate, setAttDate] = useState(today); // fecha del pase de lista (permite ver días anteriores)

  // ---- Asistencia ----
  const [students, setStudents] = useState([]);
  const [statuses, setStatuses] = useState({}); // studentId -> 'present'|'late'|'absent'
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');

  useEffect(() => {
    if (!selectedClass) return;
    let active = true;
    (async () => {
      setLoading(true);
      try {
        const sSnap = await getDocs(query(collection(db, 'students'), where('classId', '==', selectedClass)));
        const list = [];
        sSnap.forEach(d => list.push({ id: d.id, ...d.data() }));
        list.sort((a, b) => `${a.lastName} ${a.name}`.localeCompare(`${b.lastName} ${b.name}`));

        const rSnap = await getDocs(query(
          collection(db, 'classAttendance', attDate, 'records'),
          where('classId', '==', selectedClass)
        ));
        const existing = {};
        rSnap.forEach(d => { existing[d.data().studentId] = d.data().status; });

        if (active) { setStudents(list); setStatuses(existing); }
      } catch (e) { console.error(e); }
      setLoading(false);
    })();
    return () => { active = false; };
  }, [selectedClass, attDate]);

  const setStatus = (studentId, status) =>
    setStatuses(prev => ({ ...prev, [studentId]: prev[studentId] === status ? undefined : status }));

  const counts = useMemo(() => {
    const c = { present: 0, late: 0, absent: 0, pending: 0 };
    students.forEach(s => {
      const st = statuses[s.id];
      if (st) c[st] += 1; else c.pending += 1;
    });
    return c;
  }, [students, statuses]);

  const saveAttendance = async () => {
    setSaving(true);
    try {
      await Promise.all(students.map(s => {
        const status = statuses[s.id] || 'absent';
        return setDoc(doc(db, 'classAttendance', attDate, 'records', s.id), {
          studentId: s.id,
          studentName: `${s.name} ${s.lastName}`,
          classId: selectedClass,
          status,
          takenBy: user.uid,
          takenByName: userData?.displayName || '',
          date: attDate,
          updatedAt: new Date().toISOString(),
        });
      }));
      setSavedMsg(`Lista guardada · ${counts.present + counts.late} presentes de ${students.length}`);
      setTimeout(() => setSavedMsg(''), 4000);
    } catch (e) { alert('Error al guardar: ' + e.message); }
    setSaving(false);
  };

  // ---- Avisos ----
  const [annForm, setAnnForm] = useState({ scope: '', title: '', body: '', priority: 'normal', category: 'general' });
  const [annCover, setAnnCover] = useState(null);
  const [annFiles, setAnnFiles] = useState([]);
  const [annSaving, setAnnSaving] = useState(false);
  const [annProgress, setAnnProgress] = useState('');
  const [annMsg, setAnnMsg] = useState('');

  useEffect(() => {
    if (!annForm.scope && classes.length) setAnnForm(f => ({ ...f, scope: classes[0].id }));
  }, [classes, annForm.scope]);

  const addAnnFiles = (e) => {
    const picked = Array.from(e.target.files || []);
    setAnnFiles(prev => [...prev, ...picked]);
    e.target.value = '';
  };

  const sendAnnouncement = async (e) => {
    e.preventDefault();
    setAnnSaving(true);
    try {
      const ref = doc(collection(db, 'announcements'));
      const id = ref.id;

      let cover = null;
      if (annCover) { setAnnProgress('Subiendo portada...'); cover = await uploadAnnouncementCover(id, annCover); }

      const attachments = [];
      for (let i = 0; i < annFiles.length; i++) {
        setAnnProgress(`Subiendo archivo ${i + 1} de ${annFiles.length}...`);
        attachments.push(await uploadAnnouncementFile(id, annFiles[i]));
      }

      setAnnProgress('Enviando...');
      await setDoc(ref, {
        title: annForm.title,
        body: annForm.body,
        priority: annForm.priority,
        category: annForm.category,
        scope: { type: 'class', value: annForm.scope },
        scopeLabel: classLabel(parseClassId(annForm.scope)),
        coverUrl: cover?.url || null,
        coverPath: cover?.path || null,
        attachments,
        authorId: user.uid,
        authorName: userData?.displayName || 'Profesor',
        authorRole: 'teacher',
        createdAt: new Date().toISOString(),
      });
      setAnnMsg('Aviso enviado al grupo ✅');
      setAnnForm(f => ({ ...f, title: '', body: '', priority: 'normal', category: 'general' }));
      setAnnCover(null);
      setAnnFiles([]);
      setTimeout(() => setAnnMsg(''), 4000);
    } catch (e) { alert('Error al enviar aviso: ' + e.message); }
    setAnnProgress('');
    setAnnSaving(false);
  };

  // ---- Perfil ----
  const [profileForm, setProfileForm] = useState({ displayName: '', email: '', currentPassword: '', newPassword: '' });
  const [myPhoto, setMyPhoto] = useState('');
  const [photoBusy, setPhotoBusy] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState({ type: '', text: '' });
  const [updating, setUpdating] = useState(false);

  // Sincroniza el formulario cuando llega/cambia el perfil del usuario.
  useEffect(() => {
    setProfileForm(f => ({ ...f, displayName: userData?.displayName || '', email: user?.email || '' }));
    setMyPhoto(userData?.photo || '');
  }, [userData, user]);

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

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    setProfileSaving(true);
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
    setProfileSaving(false);
  };

  // ---- Alumnos: tutores de contacto ----
  const [tutorsByStudent, setTutorsByStudent] = useState({});
  const [rosterLoading, setRosterLoading] = useState(false);

  useEffect(() => {
    if (tab !== 'alumnos' || !students.length) return;
    let active = true;
    (async () => {
      setRosterLoading(true);
      try {
        const ids = uniq(students.flatMap(s => s.parentIds || []));
        const docs = await Promise.all(ids.map(id => getDoc(doc(db, 'users', id))));
        const map = {};
        docs.forEach(d => { if (d.exists()) map[d.id] = { uid: d.id, name: d.data().displayName || 'Tutor', email: d.data().email || '', phone: d.data().phone || '' }; });
        const byStudent = {};
        students.forEach(s => { byStudent[s.id] = (s.parentIds || []).map(pid => map[pid]).filter(Boolean); });
        if (active) setTutorsByStudent(byStudent);
      } catch (e) { console.error(e); }
      setRosterLoading(false);
    })();
    return () => { active = false; };
  }, [tab, students, selectedClass]);

  // ---- Notas / observaciones por alumno ----
  const [notesStudent, setNotesStudent] = useState(null);
  const [notesList, setNotesList] = useState([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [noteForm, setNoteForm] = useState({ text: '', category: 'conducta', visibleToParent: false });
  const [noteSaving, setNoteSaving] = useState(false);

  // Se consulta por classId (que el profesor posee) y se filtra el alumno en cliente,
  // para que las reglas permitan la lectura sin requerir índices compuestos.
  const loadNotes = useCallback(async (studentId, classId) => {
    setNotesLoading(true);
    try {
      const snap = await getDocs(query(collection(db, 'observations'), where('classId', '==', classId)));
      const arr = [];
      snap.forEach(d => { const v = d.data(); if (v.studentId === studentId) arr.push({ id: d.id, ...v }); });
      arr.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      setNotesList(arr);
    } catch (e) { console.error(e); setNotesList([]); }
    setNotesLoading(false);
  }, []);

  const openNotes = (s) => { setNotesStudent(s); setNoteForm({ text: '', category: 'conducta', visibleToParent: false }); loadNotes(s.id, selectedClass); };

  const addNote = async (e) => {
    e.preventDefault();
    if (!noteForm.text.trim()) return;
    setNoteSaving(true);
    try {
      await addDoc(collection(db, 'observations'), {
        studentId: notesStudent.id,
        studentName: `${notesStudent.name} ${notesStudent.lastName}`,
        classId: selectedClass,
        text: noteForm.text.trim(),
        category: noteForm.category,
        visibleToParent: !!noteForm.visibleToParent,
        authorId: user.uid,
        authorName: userData?.displayName || 'Profesor',
        createdAt: new Date().toISOString(),
      });
      setNoteForm({ text: '', category: 'conducta', visibleToParent: false });
      loadNotes(notesStudent.id, selectedClass);
    } catch (e) { alert('Error al guardar la nota: ' + e.message); }
    setNoteSaving(false);
  };

  const deleteNote = async (id) => {
    if (!confirm('¿Eliminar esta nota?')) return;
    try { await deleteDoc(doc(db, 'observations', id)); loadNotes(notesStudent.id, selectedClass); }
    catch (e) { alert('Error: ' + e.message); }
  };

  // ---- Chat directo desde el panel ----
  const openGroupChat = (classId) => navigate('/messages', { state: { openGroupClassId: classId } });
  const writeToTutor = (t) => navigate('/messages', { state: { openDirectUid: t.uid, openDirectName: t.name, openDirectRole: 'parent' } });

  // ---- Calificaciones ----
  const [subjects, setSubjects] = useState([]);
  const [gradeSubject, setGradeSubject] = useState('');
  const [gradePeriod, setGradePeriod] = useState(PERIODOS[0]);
  const [gradeValues, setGradeValues] = useState({}); // studentId -> { score, comment }
  const [gradesLoading, setGradesLoading] = useState(false);
  const [gradesSaving, setGradesSaving] = useState(false);
  const [gradesMsg, setGradesMsg] = useState('');

  // Catálogo de materias. Si el profesor tiene materias asignadas (subjectIds),
  // se limita a esas; si no, se muestran todas (comportamiento anterior).
  useEffect(() => {
    (async () => {
      try {
        const snap = await getDocs(collection(db, 'subjects'));
        const arr = [];
        snap.forEach(d => arr.push({ id: d.id, ...d.data() }));
        arr.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        const assigned = Array.isArray(userData?.subjectIds) ? userData.subjectIds : [];
        setSubjects(assigned.length ? arr.filter(s => assigned.includes(s.id)) : arr);
      } catch (e) { console.error('Error materias', e); }
    })();
  }, [userData]);

  // Prefill de calificaciones existentes para (grupo, materia, periodo).
  useEffect(() => {
    if (tab !== 'calificaciones' || !selectedClass || !gradeSubject || !gradePeriod) return;
    let active = true;
    (async () => {
      setGradesLoading(true);
      try {
        // Consulta por classId (permitida) y filtra materia/periodo en cliente.
        const snap = await getDocs(query(collection(db, 'grades'), where('classId', '==', selectedClass)));
        const map = {};
        snap.forEach(d => {
          const g = d.data();
          if (g.subjectId === gradeSubject && g.period === gradePeriod) {
            map[g.studentId] = { score: g.score ?? '', comment: g.comment || '' };
          }
        });
        if (active) setGradeValues(map);
      } catch (e) { console.error('Error calificaciones', e); if (active) setGradeValues({}); }
      if (active) setGradesLoading(false);
    })();
    return () => { active = false; };
  }, [tab, selectedClass, gradeSubject, gradePeriod]);

  const setGradeField = (studentId, field, value) =>
    setGradeValues(prev => ({ ...prev, [studentId]: { ...prev[studentId], [field]: value } }));

  const saveGrades = async () => {
    if (!gradeSubject) { alert('Selecciona una materia.'); return; }
    const subjectName = subjects.find(s => s.id === gradeSubject)?.name || '';
    setGradesSaving(true);
    try {
      const ops = [];
      for (const s of students) {
        const v = gradeValues[s.id];
        if (!v || v.score === '' || v.score === undefined || v.score === null) continue;
        const score = Number(v.score);
        if (Number.isNaN(score)) continue;
        const id = sanitize(`${selectedClass}__${gradeSubject}__${gradePeriod}__${s.id}`);
        ops.push(setDoc(doc(db, 'grades', id), {
          studentId: s.id,
          studentName: `${s.name} ${s.lastName}`,
          classId: selectedClass,
          subjectId: gradeSubject,
          subjectName,
          period: gradePeriod,
          score,
          comment: (v.comment || '').trim(),
          teacherId: user.uid,
          teacherName: userData?.displayName || 'Profesor',
          updatedAt: new Date().toISOString(),
        }, { merge: true }));
      }
      await Promise.all(ops);
      setGradesMsg(`Calificaciones guardadas (${ops.length})`);
      setTimeout(() => setGradesMsg(''), 4000);
    } catch (e) { alert('Error al guardar calificaciones: ' + e.message); }
    setGradesSaving(false);
  };

  const noClasses = classes.length === 0;

  return (
    <div className="page-container animate-in">
      <div className="pp-header">
        <Avatar src={myPhoto} name={userData?.displayName} size={52} />
        <div>
          <div className="pp-hello">Hola 👋</div>
          <div className="pp-name">{userData?.displayName || 'Profesor'}</div>
          <div style={{fontSize:'0.8rem', color:'var(--text-muted)'}}>{classes.length} grupo(s) asignado(s)</div>
        </div>
      </div>

      <div className="seg seg-scroll mb-4">
        <button type="button" className={tab==='asistencia'?'active':''} onClick={() => setTab('asistencia')} style={{display:'inline-flex',alignItems:'center',justifyContent:'center',gap:6}}>
          <ClipboardCheck size={16}/> Pase de lista
        </button>
        <button type="button" className={tab==='alumnos'?'active':''} onClick={() => setTab('alumnos')} style={{display:'inline-flex',alignItems:'center',justifyContent:'center',gap:6}}>
          <Users size={16}/> Alumnos
        </button>
        <button type="button" className={tab==='calificaciones'?'active':''} onClick={() => setTab('calificaciones')} style={{display:'inline-flex',alignItems:'center',justifyContent:'center',gap:6}}>
          <GraduationCap size={16}/> Calificaciones
        </button>
        <button type="button" className={tab==='avisos'?'active':''} onClick={() => setTab('avisos')} style={{display:'inline-flex',alignItems:'center',justifyContent:'center',gap:6}}>
          <Megaphone size={16}/> Enviar aviso
        </button>
        <button type="button" className={tab==='perfil'?'active':''} onClick={() => setTab('perfil')} style={{display:'inline-flex',alignItems:'center',justifyContent:'center',gap:6}}>
          <UserCircle size={16}/> Mi perfil
        </button>
      </div>

      {/* Sin grupos asignados: solo afecta Pase de lista y Avisos, no el Perfil */}
      {noClasses && tab !== 'perfil' && (
        <div className="card" style={{textAlign:'center', padding:48}}>
          <Users size={48} color="var(--gris-300)" style={{margin:'0 auto 16px'}} />
          <h2 style={{fontWeight:700, marginBottom:8}}>Aún no tienes grupos asignados</h2>
          <p style={{color:'var(--gris-500)'}}>Pide a un administrador que te asigne tus grupos para pasar lista y enviar avisos.</p>
        </div>
      )}

      {/* Selector de grupo + fecha + chat (solo en asistencia/alumnos/avisos con grupos) */}
      {!noClasses && tab !== 'perfil' && (
        <div className="card mb-4">
          <div style={{display:'grid', gridTemplateColumns: (tab === 'asistencia' || tab === 'calificaciones') ? 'repeat(auto-fit, minmax(180px, 1fr))' : '1fr', gap:12, alignItems:'end'}}>
            <div>
              <label className="form-label">Grupo</label>
              <select className="form-select" value={selectedClass} onChange={e => setSelectedClass(e.target.value)}>
                {classes.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </div>
            {tab === 'asistencia' && (
              <div>
                <label className="form-label"><CalendarDays size={13} style={{verticalAlign:'middle', marginRight:4}}/> Fecha</label>
                <input type="date" className="form-input" value={attDate} max={today} onChange={e => setAttDate(e.target.value)} />
              </div>
            )}
            {tab === 'calificaciones' && (
              <>
                <div>
                  <label className="form-label">Materia</label>
                  <select className="form-select" value={gradeSubject} onChange={e => setGradeSubject(e.target.value)}>
                    <option value="">Selecciona…</option>
                    {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="form-label">Periodo</label>
                  <select className="form-select" value={gradePeriod} onChange={e => setGradePeriod(e.target.value)}>
                    {PERIODOS.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
              </>
            )}
          </div>
          <button onClick={() => openGroupChat(selectedClass)} className="btn btn-secondary btn-sm" style={{marginTop:12}}>
            <MessageCircle size={14}/> Abrir chat del grupo
          </button>
          {tab === 'asistencia' && attDate !== today && (
            <p style={{fontSize:'0.78rem', color:'var(--warning)', fontWeight:600, marginTop:8}}>Viendo una fecha anterior ({attDate}). Puedes corregir y guardar.</p>
          )}
        </div>
      )}

      {!noClasses && tab === 'asistencia' && (
        <>
          <div className="stats-grid">
            <div className="stat-card"><div><div style={{fontSize:'1.5rem',fontWeight:800,color:'var(--success)'}}>{counts.present}</div><div style={{fontSize:'0.8rem',color:'var(--gris-500)'}}>Presentes</div></div></div>
            <div className="stat-card"><div><div style={{fontSize:'1.5rem',fontWeight:800,color:'var(--warning)'}}>{counts.late}</div><div style={{fontSize:'0.8rem',color:'var(--gris-500)'}}>Tarde</div></div></div>
            <div className="stat-card"><div><div style={{fontSize:'1.5rem',fontWeight:800,color:'var(--danger)'}}>{counts.absent}</div><div style={{fontSize:'0.8rem',color:'var(--gris-500)'}}>Ausentes</div></div></div>
            <div className="stat-card"><div><div style={{fontSize:'1.5rem',fontWeight:800,color:'var(--gris-500)'}}>{counts.pending}</div><div style={{fontSize:'0.8rem',color:'var(--gris-500)'}}>Sin marcar</div></div></div>
          </div>

          <div className="card">
            {loading ? (
              <p style={{textAlign:'center',color:'var(--gris-500)',padding:24}}>Cargando alumnos...</p>
            ) : students.length === 0 ? (
              <div className="empty-state"><div className="empty-state-icon">📋</div><p className="empty-state-text">No hay alumnos en este grupo</p></div>
            ) : (
              <>
                {students.map(s => {
                  const st = statuses[s.id];
                  return (
                    <div key={s.id} className="attendance-row">
                      <div style={{display:'flex', alignItems:'center', gap:10}}>
                        <Avatar name={s.name} size={34} />
                        <span style={{fontWeight:600}}>{s.lastName} {s.name}</span>
                      </div>
                      <div className="attendance-actions">
                        {Object.entries(ESTADOS).map(([key, cfg]) => {
                          const Icon = cfg.icon;
                          const isActive = st === key;
                          return (
                            <button key={key} onClick={() => setStatus(s.id, key)}
                              className={`btn btn-sm ${isActive ? 'btn-primary' : 'btn-secondary'}`}
                              title={cfg.label}>
                              <Icon size={14}/> {cfg.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:16,flexWrap:'wrap',gap:8}}>
                  {savedMsg && <span className="badge badge-success">{savedMsg}</span>}
                  <div style={{display:'flex',gap:8,marginLeft:'auto',flexWrap:'wrap'}}>
                    <button onClick={() => attendancePDF({ students, statuses, classLabel: classes.find(c => c.id === selectedClass)?.label || selectedClass, date: attDate, teacherName: userData?.displayName })}
                      className="btn btn-secondary" title="Descargar reporte en PDF">
                      <FileText size={16}/> PDF
                    </button>
                    <button onClick={() => attendanceExcel({ students, statuses, classLabel: classes.find(c => c.id === selectedClass)?.label || selectedClass, date: attDate, teacherName: userData?.displayName })}
                      className="btn btn-secondary" title="Descargar reporte en Excel">
                      <FileSpreadsheet size={16}/> Excel
                    </button>
                    <button onClick={saveAttendance} className="btn btn-primary" disabled={saving}>
                      {saving ? 'Guardando...' : 'Guardar lista'}
                    </button>
                  </div>
                </div>
                <p style={{fontSize:'0.75rem',color:'var(--gris-500)',marginTop:8}}>Los alumnos sin marcar se guardan como ausentes.</p>
              </>
            )}
          </div>
        </>
      )}

      {!noClasses && tab === 'alumnos' && (
        <div className="card">
          {rosterLoading && students.length === 0 ? (
            <p style={{textAlign:'center', color:'var(--gris-500)', padding:24}}>Cargando alumnos...</p>
          ) : students.length === 0 ? (
            <div className="empty-state"><div className="empty-state-icon">📋</div><p className="empty-state-text">No hay alumnos en este grupo</p></div>
          ) : (
            <div className="flex flex-col gap-2">
              {students.map(s => {
                const tutors = tutorsByStudent[s.id] || [];
                return (
                  <div key={s.id} style={{padding:12, borderRadius:'var(--radius-md)', border:'1px solid var(--gris-200)'}}>
                    <div style={{display:'flex', alignItems:'center', gap:10, flexWrap:'wrap'}}>
                      <Avatar name={s.name} size={40} />
                      <div style={{flex:1, minWidth:140}}>
                        <div style={{fontWeight:700}}>{s.lastName} {s.name}</div>
                        <div style={{fontSize:'0.78rem', color:'var(--gris-500)'}}>{s.grado} {s.nivel} {s.grupo}</div>
                      </div>
                      <button onClick={() => openNotes(s)} className="btn btn-sm btn-gold"><StickyNote size={14}/> Notas</button>
                    </div>
                    {tutors.length > 0 && (
                      <div style={{marginTop:10, display:'flex', flexDirection:'column', gap:6}}>
                        {tutors.map(t => (
                          <div key={t.uid} style={{display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', fontSize:'0.82rem'}}>
                            <span style={{color:'var(--gris-600)'}}><strong>{t.name}</strong> · tutor</span>
                            {t.email && <span style={{color:'var(--gris-500)', display:'inline-flex', alignItems:'center', gap:3}}><Mail size={12}/> {t.email}</span>}
                            <button onClick={() => writeToTutor(t)} className="btn btn-sm btn-secondary" style={{marginLeft:'auto'}}><MessageCircle size={13}/> Escribir</button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {!noClasses && tab === 'calificaciones' && (
        <div className="card">
          {subjects.length === 0 ? (
            <div className="empty-state"><div className="empty-state-icon">📚</div><p className="empty-state-text">Aún no hay materias. Pide a un administrador que las cree en "Materias".</p></div>
          ) : !gradeSubject ? (
            <div className="empty-state"><div className="empty-state-icon">🎓</div><p className="empty-state-text">Selecciona una materia arriba para capturar calificaciones.</p></div>
          ) : gradesLoading ? (
            <p style={{textAlign:'center', color:'var(--gris-500)', padding:24}}>Cargando…</p>
          ) : students.length === 0 ? (
            <div className="empty-state"><div className="empty-state-icon">📋</div><p className="empty-state-text">No hay alumnos en este grupo</p></div>
          ) : (
            <>
              <p style={{fontSize:'0.82rem', color:'var(--gris-500)', marginBottom:12}}>Captura la calificación (0–10) y un comentario opcional. Las verán los padres.</p>
              <div className="flex flex-col gap-2">
                {students.map(s => {
                  const v = gradeValues[s.id] || {};
                  return (
                    <div key={s.id} style={{padding:12, borderRadius:'var(--radius-md)', border:'1px solid var(--gris-200)', display:'flex', alignItems:'center', gap:10, flexWrap:'wrap'}}>
                      <Avatar name={s.name} size={34} />
                      <div style={{flex:1, minWidth:120}}>
                        <div style={{fontWeight:700, fontSize:'0.9rem'}}>{s.lastName} {s.name}</div>
                      </div>
                      <input type="number" className="form-input" style={{width:90}} min="0" max="10" step="0.1" placeholder="0–10"
                        value={v.score ?? ''} onChange={e => setGradeField(s.id, 'score', e.target.value)} />
                      <input className="form-input" style={{flex:1, minWidth:160}} placeholder="Comentario (opcional)"
                        value={v.comment ?? ''} onChange={e => setGradeField(s.id, 'comment', e.target.value)} />
                    </div>
                  );
                })}
              </div>
              <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:16, gap:12, flexWrap:'wrap'}}>
                {gradesMsg && <span className="badge badge-success">{gradesMsg}</span>}
                <button onClick={saveGrades} className="btn btn-primary" disabled={gradesSaving} style={{marginLeft:'auto'}}>
                  <Save size={16}/> {gradesSaving ? 'Guardando…' : 'Guardar calificaciones'}
                </button>
              </div>
              <p style={{fontSize:'0.75rem', color:'var(--gris-500)', marginTop:8}}>Solo se guardan los alumnos con calificación capturada.</p>
            </>
          )}
        </div>
      )}

      {!noClasses && tab === 'avisos' && (
        <div className="card" style={{maxWidth:600}}>
          <form onSubmit={sendAnnouncement}>
            <div className="form-group">
              <label className="form-label">Para el grupo</label>
              <select className="form-select" value={annForm.scope} onChange={e => setAnnForm({...annForm, scope: e.target.value})} required>
                {classes.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </div>
            <div className="grid-2">
              <div className="form-group">
                <label className="form-label">Prioridad</label>
                <select className="form-select" value={annForm.priority} onChange={e => setAnnForm({...annForm, priority: e.target.value})}>
                  {Object.entries(PRIORIDADES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Categoría</label>
                <select className="form-select" value={annForm.category} onChange={e => setAnnForm({...annForm, category: e.target.value})}>
                  {Object.entries(CATEGORIAS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Título</label>
              <input className="form-input" value={annForm.title} onChange={e => setAnnForm({...annForm, title: e.target.value})} required placeholder="Ej. Tarea de matemáticas" />
            </div>
            <div className="form-group">
              <label className="form-label">Mensaje</label>
              <textarea className="form-input" rows={4} value={annForm.body} onChange={e => setAnnForm({...annForm, body: e.target.value})} required placeholder="Escribe el aviso para los padres del grupo..." />
            </div>
            <div className="form-group">
              <label className="form-label">Imagen de portada (opcional)</label>
              {annCover ? (
                <div style={{position:'relative'}}>
                  <img src={URL.createObjectURL(annCover)} alt="portada" style={{width:'100%', maxHeight:160, objectFit:'cover', borderRadius:8}} />
                  <button type="button" onClick={() => setAnnCover(null)} className="btn btn-sm btn-danger" style={{position:'absolute', top:8, right:8}}><X size={14}/></button>
                </div>
              ) : (
                <label className="btn btn-secondary w-full" style={{cursor:'pointer'}}>
                  <ImagePlus size={16}/> Elegir imagen
                  <input type="file" accept="image/*" hidden onChange={e => setAnnCover(e.target.files?.[0] || null)} />
                </label>
              )}
            </div>
            <div className="form-group">
              <label className="form-label">Archivos adjuntos (PDF, imágenes...)</label>
              <label className="btn btn-secondary w-full" style={{cursor:'pointer'}}>
                <Paperclip size={16}/> Agregar archivos
                <input type="file" multiple hidden onChange={addAnnFiles} />
              </label>
              {annFiles.length > 0 && (
                <div className="flex flex-col gap-2" style={{marginTop:8}}>
                  {annFiles.map((f, i) => (
                    <div key={i} className="flex justify-between items-center" style={{gap:8, fontSize:'0.82rem', padding:'6px 10px', border:'1px solid var(--gris-200)', borderRadius:8}}>
                      <span style={{overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{f.name}</span>
                      <span style={{display:'flex', alignItems:'center', gap:8}}>
                        <span style={{color:'var(--gris-500)', fontSize:'0.72rem'}}>{humanSize(f.size)}</span>
                        <button type="button" onClick={() => setAnnFiles(prev => prev.filter((_, idx) => idx !== i))} className="btn btn-sm btn-danger"><X size={12}/></button>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {annMsg && <p className="badge badge-success" style={{marginBottom:12}}>{annMsg}</p>}
            <button type="submit" className="btn btn-primary" disabled={annSaving}>
              <Send size={16}/> {annSaving ? (annProgress || 'Enviando...') : 'Enviar aviso'}
            </button>
          </form>
        </div>
      )}

      {tab === 'perfil' && (
        <div className="pp-grid" style={{alignItems:'start'}}>
          <div className="card" style={{maxWidth:600}}>
            <div style={{textAlign:'center', marginBottom:24}}>
              <div style={{display:'flex', justifyContent:'center'}}>
                <Avatar src={myPhoto} name={profileForm.displayName || userData?.displayName} size={96} />
              </div>
              <div style={{marginTop:10, display:'flex', gap:8, justifyContent:'center', flexWrap:'wrap'}}>
                <label className="btn btn-sm btn-secondary" style={{cursor: photoBusy ? 'wait' : 'pointer'}}>
                  <Camera size={14}/> {photoBusy ? 'Procesando…' : (myPhoto ? 'Cambiar foto' : 'Subir foto')}
                  <input type="file" accept="image/*" hidden disabled={photoBusy} onChange={handleMyPhoto} />
                </label>
              </div>
              <p style={{fontSize:'0.72rem', color:'var(--gris-500)', marginTop:6}}>Tu foto se mostrará en el directorio de personal.</p>
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
              <button type="submit" className="btn btn-primary w-full" disabled={profileSaving}><Save size={16}/> {profileSaving ? 'Guardando…' : 'Guardar Cambios'}</button>
            </form>

            <div style={{marginTop:24, paddingTop:16, borderTop:'1px solid var(--gris-200)', textAlign:'center'}}>
              <p style={{fontSize:'0.78rem', color:'var(--gris-500)', marginBottom:10}}>¿No ves los cambios más recientes? Recarga la app a la última versión.</p>
              <button type="button" onClick={async () => { setUpdating(true); await forceUpdate(); }} disabled={updating} className="btn btn-secondary btn-sm">
                <RefreshCw size={14}/> {updating ? 'Actualizando…' : 'Obtener nueva actualización'}
              </button>
            </div>
          </div>

          {/* Mis grupos asignados */}
          <div className="card">
            <h3 className="card-title" style={{marginBottom:16, display:'flex', alignItems:'center', gap:8}}><Users size={18} color="var(--guinda)"/> Mis grupos</h3>
            {noClasses ? (
              <p style={{color:'var(--gris-500)', fontSize:'0.88rem'}}>Aún no tienes grupos asignados. Pide a un administrador que te los asigne.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {classes.map(c => (
                  <div key={c.id} style={{display:'flex', alignItems:'center', gap:10, padding:'10px 12px', borderRadius:'var(--radius-md)', background:'var(--surface-hover)'}}>
                    <ClipboardCheck size={16} color="var(--guinda)"/>
                    <span style={{fontWeight:600, fontSize:'0.9rem'}}>{c.label}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal Notas / observaciones del alumno */}
      {notesStudent && (
        <div className="modal-overlay" onClick={() => setNotesStudent(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title" style={{display:'flex', alignItems:'center', gap:8}}><StickyNote size={18} color="var(--guinda)"/> Notas · {notesStudent.name}</h3>
              <button className="modal-close" onClick={() => setNotesStudent(null)}><X size={16}/></button>
            </div>

            <form onSubmit={addNote} style={{marginBottom:16}}>
              <div className="form-group">
                <label className="form-label">Nueva observación</label>
                <textarea className="form-input" rows={3} value={noteForm.text} onChange={e => setNoteForm({...noteForm, text: e.target.value})} placeholder="Ej. Participó muy bien en clase / olvidó la tarea…" required />
              </div>
              <div style={{display:'flex', gap:10, flexWrap:'wrap', alignItems:'center'}}>
                <select className="form-select" style={{maxWidth:180}} value={noteForm.category} onChange={e => setNoteForm({...noteForm, category: e.target.value})}>
                  {Object.entries(NOTE_CATS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
                <label style={{display:'flex', alignItems:'center', gap:6, fontSize:'0.82rem', color:'var(--gris-600)', cursor:'pointer'}}>
                  <input type="checkbox" checked={noteForm.visibleToParent} onChange={e => setNoteForm({...noteForm, visibleToParent: e.target.checked})} />
                  Compartir con el tutor
                </label>
                <button type="submit" className="btn btn-primary btn-sm" disabled={noteSaving} style={{marginLeft:'auto'}}><Plus size={14}/> {noteSaving ? 'Guardando…' : 'Agregar'}</button>
              </div>
            </form>

            <div style={{borderTop:'1px solid var(--gris-200)', paddingTop:12, maxHeight:320, overflowY:'auto'}}>
              {notesLoading ? (
                <p style={{textAlign:'center', color:'var(--gris-500)', padding:16}}>Cargando notas…</p>
              ) : notesList.length === 0 ? (
                <p style={{textAlign:'center', color:'var(--gris-500)', padding:16, fontSize:'0.88rem'}}>Aún no hay notas para este alumno.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {notesList.map(n => {
                    const cat = NOTE_CATS[n.category] || NOTE_CATS.conducta;
                    return (
                      <div key={n.id} style={{padding:10, borderRadius:'var(--radius-sm)', background:'var(--surface-hover)'}}>
                        <div className="flex justify-between items-center" style={{marginBottom:4, gap:8}}>
                          <span className={`badge ${cat.badge}`}>{cat.label}</span>
                          <div style={{display:'flex', alignItems:'center', gap:8}}>
                            {n.visibleToParent && <span className="badge badge-info" title="Visible para el tutor">👁 Tutor</span>}
                            {n.authorId === user.uid && <button onClick={() => deleteNote(n.id)} className="btn btn-sm btn-danger" style={{padding:'4px 8px'}}><Trash2 size={12}/></button>}
                          </div>
                        </div>
                        <p style={{fontSize:'0.88rem', whiteSpace:'pre-wrap'}}>{n.text}</p>
                        <p style={{fontSize:'0.7rem', color:'var(--gris-500)', marginTop:4}}>{n.authorName} · {n.createdAt ? new Date(n.createdAt).toLocaleDateString('es-MX', {day:'numeric', month:'short', hour:'2-digit', minute:'2-digit'}) : ''}</p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
