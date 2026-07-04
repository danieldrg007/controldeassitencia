import { useState, useEffect, useMemo, useCallback } from 'react';
import { db } from '../firebase';
import { collection, query, where, getDocs, doc, getDoc, setDoc } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { CalendarClock, Plus, Trash2, Save, X } from 'lucide-react';
import { todasLasClases, classLabel, parseClassId } from '../config/colegio';

const allClasses = todasLasClases();
const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];
const sanitize = (s) => (s || '').replace(/[^a-zA-Z0-9]/g, '_');
const emptyBlock = { day: 0, start: '07:30', end: '08:20', subject: '', teacher: '' };

// Horarios de clase por grupo. Administración los edita; profesores y padres
// consultan el horario de sus grupos / hijos.
export default function Schedules() {
  const { user, userData } = useAuth();
  const role = typeof userData?.role === 'string' ? userData.role.trim().toLowerCase() : '';
  const isAdmin = role === 'admin' || role === 'superadmin';
  const isTeacher = role === 'teacher';

  const [myClasses, setMyClasses] = useState([]); // grupos visibles según rol
  const [selectedClass, setSelectedClass] = useState('');
  const [blocks, setBlocks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [subjects, setSubjects] = useState([]);
  const [form, setForm] = useState(emptyBlock);

  // Grupos que puede ver este usuario.
  useEffect(() => {
    if (!user) return;
    if (isAdmin) {
      setMyClasses(allClasses.map(c => ({ id: c.id, label: c.label })));
    } else if (isTeacher) {
      const ids = Array.isArray(userData?.classIds) ? userData.classIds : [];
      setMyClasses(ids.map(id => ({ id, label: classLabel(parseClassId(id)) })));
    } else if (role === 'parent') {
      (async () => {
        try {
          const snap = await getDocs(query(collection(db, 'students'), where('parentIds', 'array-contains', user.uid)));
          const seen = new Map();
          snap.forEach(d => {
            const s = d.data();
            if (s.classId && !seen.has(s.classId)) seen.set(s.classId, `${s.name} — ${classLabel(parseClassId(s.classId))}`);
          });
          setMyClasses([...seen].map(([id, label]) => ({ id, label })));
        } catch (e) { console.error('grupos del padre', e); }
      })();
    }
  }, [user, role, isAdmin, isTeacher, userData]);

  useEffect(() => {
    if (!selectedClass && myClasses.length) setSelectedClass(myClasses[0].id);
  }, [myClasses, selectedClass]);

  // Catálogo de materias (para el selector del admin).
  useEffect(() => {
    if (!isAdmin) return;
    getDocs(collection(db, 'subjects')).then(snap => {
      const arr = [];
      snap.forEach(d => arr.push({ id: d.id, ...d.data() }));
      arr.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      setSubjects(arr);
    }).catch(() => {});
  }, [isAdmin]);

  // Horario del grupo seleccionado.
  const loadSchedule = useCallback(async () => {
    if (!selectedClass) return;
    setLoading(true);
    try {
      const snap = await getDoc(doc(db, 'schedules', sanitize(selectedClass)));
      setBlocks(snap.exists() ? (snap.data().blocks || []) : []);
    } catch (e) { console.error(e); setBlocks([]); }
    setLoading(false);
  }, [selectedClass]);
  useEffect(() => { loadSchedule(); }, [loadSchedule]);

  const save = async (newBlocks) => {
    setSaving(true);
    try {
      await setDoc(doc(db, 'schedules', sanitize(selectedClass)), {
        classId: selectedClass,
        blocks: newBlocks,
        updatedAt: new Date().toISOString(),
        updatedBy: userData?.displayName || '',
      });
      setBlocks(newBlocks);
      setSavedMsg('Horario guardado ✅');
      setTimeout(() => setSavedMsg(''), 3000);
    } catch (e) { alert('Error al guardar: ' + e.message); }
    setSaving(false);
  };

  const addBlock = (e) => {
    e.preventDefault();
    if (!form.subject.trim()) { alert('Indica la materia'); return; }
    if (form.end <= form.start) { alert('La hora de fin debe ser posterior a la de inicio'); return; }
    const nb = [...blocks, { ...form, day: Number(form.day), subject: form.subject.trim(), teacher: form.teacher.trim() }];
    save(nb);
    setShowAdd(false);
    setForm(emptyBlock);
  };

  const removeBlock = (idx) => {
    if (!window.confirm('¿Quitar esta clase del horario?')) return;
    save(blocks.filter((_, i) => i !== idx));
  };

  // Bloques agrupados por día y ordenados por hora.
  const byDay = useMemo(() => {
    const map = DIAS.map(() => []);
    blocks.forEach((b, i) => { if (map[b.day]) map[b.day].push({ ...b, _idx: i }); });
    map.forEach(list => list.sort((a, b) => (a.start || '').localeCompare(b.start || '')));
    return map;
  }, [blocks]);

  return (
    <div className="page-container animate-in">
      <div className="page-header">
        <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}><CalendarClock size={26} /> Horarios</h1>
        <p className="page-subtitle">{isAdmin ? 'Edita el horario de clases de cada grupo' : 'Horario de clases del grupo'}</p>
      </div>

      {myClasses.length === 0 ? (
        <div className="card"><div className="empty-state"><div className="empty-state-icon">🗓️</div><p className="empty-state-text">No hay grupos para mostrar.</p></div></div>
      ) : (
        <>
          <div className="card mb-4" style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 260px' }}>
              <label className="form-label">Grupo</label>
              <select className="form-select" value={selectedClass} onChange={e => setSelectedClass(e.target.value)}>
                {myClasses.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </div>
            {isAdmin && (
              <button onClick={() => { setForm(emptyBlock); setShowAdd(true); }} className="btn btn-primary" style={{ marginTop: 18 }}>
                <Plus size={16} /> Agregar clase
              </button>
            )}
            {savedMsg && <span className="badge badge-success" style={{ marginTop: 18 }}>{savedMsg}</span>}
          </div>

          {loading ? (
            <div className="card"><p style={{ textAlign: 'center', color: 'var(--gris-500)', padding: 24 }}>Cargando horario…</p></div>
          ) : blocks.length === 0 ? (
            <div className="card">
              <div className="empty-state">
                <div className="empty-state-icon">🗓️</div>
                <p className="empty-state-text">Este grupo aún no tiene horario.{isAdmin ? ' Usa "Agregar clase" para armarlo.' : ''}</p>
              </div>
            </div>
          ) : (
            <div className="schedule-grid">
              {DIAS.map((dia, di) => (
                <div key={dia} className="card" style={{ padding: 14 }}>
                  <h3 style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--guinda)', marginBottom: 10, textAlign: 'center' }}>{dia}</h3>
                  {byDay[di].length === 0 ? (
                    <p style={{ fontSize: '0.8rem', color: 'var(--gris-400)', textAlign: 'center', padding: '10px 0' }}>Sin clases</p>
                  ) : byDay[di].map(b => (
                    <div key={b._idx} style={{ padding: '8px 10px', borderRadius: 10, background: 'var(--surface-hover)', borderLeft: '3px solid var(--accent)', marginBottom: 8 }}>
                      <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--gris-500)' }}>{b.start} – {b.end}</div>
                      <div style={{ fontWeight: 700, fontSize: '0.88rem' }}>{b.subject}</div>
                      {b.teacher && <div style={{ fontSize: '0.76rem', color: 'var(--gris-500)' }}>{b.teacher}</div>}
                      {isAdmin && (
                        <button onClick={() => removeBlock(b._idx)} className="btn btn-sm btn-danger" style={{ marginTop: 6, padding: '3px 8px' }} disabled={saving} title="Quitar">
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Modal agregar clase (admin) */}
      {showAdd && (
        <div className="modal-overlay" onClick={() => setShowAdd(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Agregar clase al horario</h3>
              <button className="modal-close" onClick={() => setShowAdd(false)}><X size={16} /></button>
            </div>
            <form onSubmit={addBlock}>
              <div className="form-group">
                <label className="form-label">Día</label>
                <select className="form-select" value={form.day} onChange={e => setForm({ ...form, day: e.target.value })}>
                  {DIAS.map((d, i) => <option key={d} value={i}>{d}</option>)}
                </select>
              </div>
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Inicio</label>
                  <input type="time" className="form-input" value={form.start} onChange={e => setForm({ ...form, start: e.target.value })} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Fin</label>
                  <input type="time" className="form-input" value={form.end} onChange={e => setForm({ ...form, end: e.target.value })} required />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Materia</label>
                {subjects.length > 0 ? (
                  <select className="form-select" value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} required>
                    <option value="">Seleccionar…</option>
                    {subjects.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                    <option value="Receso">Receso</option>
                  </select>
                ) : (
                  <input className="form-input" placeholder="Ej. Matemáticas" value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} required />
                )}
              </div>
              <div className="form-group">
                <label className="form-label">Profesor (opcional)</label>
                <input className="form-input" value={form.teacher} onChange={e => setForm({ ...form, teacher: e.target.value })} />
              </div>
              <div className="modal-footer">
                <button type="button" onClick={() => setShowAdd(false)} className="btn btn-secondary">Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={saving}><Save size={16} /> {saving ? 'Guardando…' : 'Agregar'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
