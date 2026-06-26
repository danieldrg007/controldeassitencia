import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, getDocs, addDoc, deleteDoc, doc } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { Megaphone, Send, Trash2 } from 'lucide-react';
import { NOMBRE_PLANTELES, todasLasClases } from '../config/colegio';

const clases = todasLasClases();

export default function Announcements() {
  const { user, userData } = useAuth();
  const [list, setList] = useState([]);
  const [form, setForm] = useState({ type: 'all', value: '', title: '', body: '' });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const load = async () => {
    const snap = await getDocs(collection(db, 'announcements'));
    const arr = [];
    snap.forEach(d => arr.push({ id: d.id, ...d.data() }));
    arr.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    setList(arr);
  };

  useEffect(() => { load(); }, []);

  const scopeLabel = () => {
    if (form.type === 'all') return 'Todo el colegio';
    if (form.type === 'plantel') return form.value;
    return clases.find(c => c.id === form.value)?.label || form.value;
  };

  const submit = async (e) => {
    e.preventDefault();
    if (form.type !== 'all' && !form.value) { alert('Selecciona el destino'); return; }
    setSaving(true);
    try {
      await addDoc(collection(db, 'announcements'), {
        title: form.title,
        body: form.body,
        scope: { type: form.type, value: form.type === 'all' ? 'all' : form.value },
        scopeLabel: scopeLabel(),
        authorId: user.uid,
        authorName: userData?.displayName || 'Administración',
        authorRole: 'admin',
        createdAt: new Date().toISOString(),
      });
      setMsg('Aviso publicado ✅');
      setForm({ type: 'all', value: '', title: '', body: '' });
      setTimeout(() => setMsg(''), 4000);
      load();
    } catch (err) { alert('Error: ' + err.message); }
    setSaving(false);
  };

  const remove = async (id) => {
    if (!confirm('¿Eliminar este aviso?')) return;
    await deleteDoc(doc(db, 'announcements', id));
    load();
  };

  const fmt = (iso) => iso ? new Date(iso).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';

  return (
    <div className="page-container animate-in">
      <div className="page-header">
        <h1 className="page-title">Avisos y Anuncios</h1>
        <p className="page-subtitle">Publica avisos para todo el colegio, por plantel o por grupo</p>
      </div>

      <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(300px, 1fr))', gap:24, alignItems:'start'}}>
        <div className="card">
          <h3 className="card-title" style={{marginBottom:16}}><Megaphone size={18} style={{verticalAlign:'middle', marginRight:6}}/> Nuevo aviso</h3>
          <form onSubmit={submit}>
            <div className="form-group">
              <label className="form-label">Destino</label>
              <select className="form-select" value={form.type} onChange={e => setForm({ ...form, type: e.target.value, value: '' })}>
                <option value="all">Todo el colegio</option>
                <option value="plantel">Un plantel</option>
                <option value="class">Un grupo</option>
              </select>
            </div>
            {form.type === 'plantel' && (
              <div className="form-group">
                <label className="form-label">Plantel</label>
                <select className="form-select" value={form.value} onChange={e => setForm({ ...form, value: e.target.value })} required>
                  <option value="">Seleccionar...</option>
                  {NOMBRE_PLANTELES.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            )}
            {form.type === 'class' && (
              <div className="form-group">
                <label className="form-label">Grupo</label>
                <select className="form-select" value={form.value} onChange={e => setForm({ ...form, value: e.target.value })} required>
                  <option value="">Seleccionar...</option>
                  {clases.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </div>
            )}
            <div className="form-group">
              <label className="form-label">Título</label>
              <input className="form-input" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} required />
            </div>
            <div className="form-group">
              <label className="form-label">Mensaje</label>
              <textarea className="form-input" rows={5} value={form.body} onChange={e => setForm({ ...form, body: e.target.value })} required />
            </div>
            {msg && <p className="badge badge-success" style={{marginBottom:12}}>{msg}</p>}
            <button type="submit" className="btn btn-primary w-full" disabled={saving}><Send size={16}/> {saving ? 'Publicando...' : 'Publicar aviso'}</button>
          </form>
        </div>

        <div className="card">
          <h3 className="card-title" style={{marginBottom:16}}>Avisos publicados ({list.length})</h3>
          {list.length === 0 ? (
            <div className="empty-state"><div className="empty-state-icon">📣</div><p className="empty-state-text">Aún no hay avisos</p></div>
          ) : (
            <div className="flex flex-col gap-3">
              {list.map(a => (
                <div key={a.id} style={{padding:14, border:'1px solid var(--gris-200)', borderLeft:'4px solid var(--guinda)', borderRadius:'var(--radius-sm)'}}>
                  <div className="flex justify-between items-center" style={{marginBottom:6, gap:8}}>
                    <strong style={{display:'flex', alignItems:'center', gap:8}}><Megaphone size={15} color="var(--guinda)"/> {a.title}</strong>
                    <span className="badge badge-info">{a.scopeLabel}</span>
                  </div>
                  <p style={{fontSize:'0.9rem', color:'var(--gris-700)', whiteSpace:'pre-wrap'}}>{a.body}</p>
                  <div className="flex justify-between items-center" style={{marginTop:8}}>
                    <span style={{fontSize:'0.75rem', color:'var(--gris-500)'}}>{a.authorName} · {fmt(a.createdAt)}</span>
                    <button onClick={() => remove(a.id)} className="btn btn-sm btn-danger"><Trash2 size={14}/></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
