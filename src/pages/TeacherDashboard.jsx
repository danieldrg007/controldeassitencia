import { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase';
import { collection, query, where, getDocs, doc, setDoc, addDoc } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { ClipboardCheck, Megaphone, Check, X, Clock, Users, Send } from 'lucide-react';
import { parseClassId, classLabel } from '../config/colegio';

const ESTADOS = {
  present: { label: 'Presente', badge: 'badge-success', icon: Check },
  late:    { label: 'Tarde',    badge: 'badge-warning', icon: Clock },
  absent:  { label: 'Ausente',  badge: 'badge-danger',  icon: X },
};

export default function TeacherDashboard() {
  const { user, userData } = useAuth();
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
          collection(db, 'classAttendance', today, 'records'),
          where('classId', '==', selectedClass)
        ));
        const existing = {};
        rSnap.forEach(d => { existing[d.data().studentId] = d.data().status; });

        if (active) { setStudents(list); setStatuses(existing); }
      } catch (e) { console.error(e); }
      setLoading(false);
    })();
    return () => { active = false; };
  }, [selectedClass, today]);

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
        return setDoc(doc(db, 'classAttendance', today, 'records', s.id), {
          studentId: s.id,
          studentName: `${s.name} ${s.lastName}`,
          classId: selectedClass,
          status,
          takenBy: user.uid,
          takenByName: userData?.displayName || '',
          date: today,
          updatedAt: new Date().toISOString(),
        });
      }));
      setSavedMsg(`Lista guardada · ${counts.present + counts.late} presentes de ${students.length}`);
      setTimeout(() => setSavedMsg(''), 4000);
    } catch (e) { alert('Error al guardar: ' + e.message); }
    setSaving(false);
  };

  // ---- Avisos ----
  const [annForm, setAnnForm] = useState({ scope: '', title: '', body: '' });
  const [annSaving, setAnnSaving] = useState(false);
  const [annMsg, setAnnMsg] = useState('');

  useEffect(() => {
    if (!annForm.scope && classes.length) setAnnForm(f => ({ ...f, scope: classes[0].id }));
  }, [classes, annForm.scope]);

  const sendAnnouncement = async (e) => {
    e.preventDefault();
    setAnnSaving(true);
    try {
      await addDoc(collection(db, 'announcements'), {
        title: annForm.title,
        body: annForm.body,
        scope: { type: 'class', value: annForm.scope },
        scopeLabel: classLabel(parseClassId(annForm.scope)),
        authorId: user.uid,
        authorName: userData?.displayName || 'Profesor',
        authorRole: 'teacher',
        createdAt: new Date().toISOString(),
      });
      setAnnMsg('Aviso enviado al grupo ✅');
      setAnnForm(f => ({ ...f, title: '', body: '' }));
      setTimeout(() => setAnnMsg(''), 4000);
    } catch (e) { alert('Error al enviar aviso: ' + e.message); }
    setAnnSaving(false);
  };

  if (!classes.length) {
    return (
      <div className="page-container animate-in">
        <div className="card" style={{textAlign:'center', padding:48}}>
          <Users size={48} color="var(--gris-300)" style={{margin:'0 auto 16px'}} />
          <h2 style={{fontWeight:700, marginBottom:8}}>Aún no tienes grupos asignados</h2>
          <p style={{color:'var(--gris-500)'}}>Pide a un administrador que te asigne tus grupos para pasar lista.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container animate-in">
      <div className="page-header">
        <h1 className="page-title">Panel del Profesor</h1>
        <p className="page-subtitle">Hola {userData?.displayName} · {classes.length} grupo(s) asignado(s)</p>
      </div>

      <div className="flex gap-2 mb-4">
        <button className={`btn ${tab==='asistencia'?'btn-primary':'btn-secondary'}`} onClick={() => setTab('asistencia')}>
          <ClipboardCheck size={16}/> Pase de lista
        </button>
        <button className={`btn ${tab==='avisos'?'btn-primary':'btn-secondary'}`} onClick={() => setTab('avisos')}>
          <Megaphone size={16}/> Enviar aviso
        </button>
      </div>

      {/* Selector de grupo */}
      <div className="card mb-4">
        <label className="form-label">Grupo</label>
        <select className="form-select" value={selectedClass} onChange={e => setSelectedClass(e.target.value)}>
          {classes.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
      </div>

      {tab === 'asistencia' && (
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
                    <div key={s.id} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 0',borderBottom:'1px solid var(--gris-100)'}}>
                      <div style={{fontWeight:600}}>{s.lastName} {s.name}</div>
                      <div className="flex gap-2">
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
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:16}}>
                  {savedMsg && <span className="badge badge-success">{savedMsg}</span>}
                  <button onClick={saveAttendance} className="btn btn-primary" disabled={saving} style={{marginLeft:'auto'}}>
                    {saving ? 'Guardando...' : 'Guardar lista'}
                  </button>
                </div>
                <p style={{fontSize:'0.75rem',color:'var(--gris-500)',marginTop:8}}>Los alumnos sin marcar se guardan como ausentes.</p>
              </>
            )}
          </div>
        </>
      )}

      {tab === 'avisos' && (
        <div className="card" style={{maxWidth:600}}>
          <form onSubmit={sendAnnouncement}>
            <div className="form-group">
              <label className="form-label">Para el grupo</label>
              <select className="form-select" value={annForm.scope} onChange={e => setAnnForm({...annForm, scope: e.target.value})} required>
                {classes.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Título</label>
              <input className="form-input" value={annForm.title} onChange={e => setAnnForm({...annForm, title: e.target.value})} required placeholder="Ej. Tarea de matemáticas" />
            </div>
            <div className="form-group">
              <label className="form-label">Mensaje</label>
              <textarea className="form-input" rows={4} value={annForm.body} onChange={e => setAnnForm({...annForm, body: e.target.value})} required placeholder="Escribe el aviso para los padres del grupo..." />
            </div>
            {annMsg && <p className="badge badge-success" style={{marginBottom:12}}>{annMsg}</p>}
            <button type="submit" className="btn btn-primary" disabled={annSaving}>
              <Send size={16}/> {annSaving ? 'Enviando...' : 'Enviar aviso'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
