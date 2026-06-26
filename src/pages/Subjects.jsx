import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, getDocs, addDoc, deleteDoc, doc } from 'firebase/firestore';
import { BookOpen, Plus, Trash2 } from 'lucide-react';

// Catálogo central de materias. Lo gestiona el administrador; los profesores las
// eligen al capturar calificaciones.
export default function Subjects() {
  const [list, setList] = useState([]);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const snap = await getDocs(collection(db, 'subjects'));
    const arr = [];
    snap.forEach(d => arr.push({ id: d.id, ...d.data() }));
    arr.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    setList(arr);
  };
  useEffect(() => { load(); }, []);

  const add = async (e) => {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    if (list.some(s => (s.name || '').toLowerCase() === n.toLowerCase())) { alert('Esa materia ya existe.'); return; }
    setSaving(true);
    try {
      await addDoc(collection(db, 'subjects'), { name: n, createdAt: new Date().toISOString() });
      setName('');
      load();
    } catch (err) { alert('Error: ' + err.message); }
    setSaving(false);
  };

  const remove = async (s) => {
    if (!confirm(`¿Eliminar la materia "${s.name}"? Las calificaciones ya capturadas no se borran.`)) return;
    try { await deleteDoc(doc(db, 'subjects', s.id)); load(); }
    catch (err) { alert('Error: ' + err.message); }
  };

  return (
    <div className="page-container animate-in">
      <div className="page-header">
        <h1 className="page-title">Materias</h1>
        <p className="page-subtitle">Catálogo de materias para calificaciones · {list.length} registradas</p>
      </div>

      <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(300px, 1fr))', gap:24, alignItems:'start'}}>
        <div className="card">
          <h3 className="card-title" style={{marginBottom:16, display:'flex', alignItems:'center', gap:8}}><Plus size={18} color="var(--guinda)"/> Nueva materia</h3>
          <form onSubmit={add} style={{display:'flex', gap:8, flexWrap:'wrap'}}>
            <input className="form-input" style={{flex:1, minWidth:160}} placeholder="Ej. Matemáticas" value={name} onChange={e => setName(e.target.value)} required />
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Guardando…' : 'Agregar'}</button>
          </form>
        </div>

        <div className="card">
          <h3 className="card-title" style={{marginBottom:16, display:'flex', alignItems:'center', gap:8}}><BookOpen size={18} color="var(--guinda)"/> Materias registradas</h3>
          {list.length === 0 ? (
            <div className="empty-state" style={{padding:24}}><div className="empty-state-icon">📚</div><p className="empty-state-text">Aún no hay materias. Agrega la primera.</p></div>
          ) : (
            <div style={{display:'flex', flexWrap:'wrap', gap:8}}>
              {list.map(s => (
                <span key={s.id} style={{display:'inline-flex', alignItems:'center', gap:8, padding:'8px 12px', borderRadius:999, background:'var(--surface-hover)', border:'1px solid var(--surface-border)', fontWeight:600, fontSize:'0.88rem'}}>
                  {s.name}
                  <button onClick={() => remove(s)} title="Eliminar" style={{border:0, background:'transparent', cursor:'pointer', color:'var(--danger)', display:'inline-flex', padding:0}}><Trash2 size={14}/></button>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
