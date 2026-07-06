import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, getDocs, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { Megaphone, Send, ImagePlus, Paperclip, X, Pencil } from 'lucide-react';
import { NOMBRE_PLANTELES, todasLasClases } from '../config/colegio';
import { PRIORIDADES, CATEGORIAS, sortAnnouncements } from '../config/avisos';
import { uploadAnnouncementFile, uploadAnnouncementCover, deleteAnnouncementFiles, humanSize } from '../utils/announcements';
import AnnouncementCard from '../components/AnnouncementCard';

const clases = todasLasClases();
const emptyForm = { type: 'all', value: '', title: '', body: '', priority: 'normal', category: 'general' };

export default function Announcements() {
  const { user, userData } = useAuth();
  const [list, setList] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [coverFile, setCoverFile] = useState(null);
  const [coverPreview, setCoverPreview] = useState(null); // object URL de la portada elegida
  const [files, setFiles] = useState([]);
  const [editing, setEditing] = useState(null);          // aviso en edición (o null = crear)
  const [keepAtts, setKeepAtts] = useState([]);           // adjuntos existentes que se conservan
  const [keepCover, setKeepCover] = useState(null);       // portada existente {url, path} o null
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState('');
  const [msg, setMsg] = useState('');
  const [lightbox, setLightbox] = useState(null);

  const load = async () => {
    const snap = await getDocs(collection(db, 'announcements'));
    const arr = [];
    snap.forEach(d => arr.push({ id: d.id, ...d.data() }));
    setList(sortAnnouncements(arr));
  };

  useEffect(() => { load(); }, []);

  // Vista previa de la portada: crea (y libera) el object URL al cambiar el archivo.
  useEffect(() => {
    if (!coverFile) { setCoverPreview(null); return; }
    const url = URL.createObjectURL(coverFile);
    setCoverPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [coverFile]);

  const scopeLabel = () => {
    if (form.type === 'all') return 'Todo el colegio';
    if (form.type === 'plantel') return form.value;
    return clases.find(c => c.id === form.value)?.label || form.value;
  };

  const addFiles = (e) => {
    const picked = Array.from(e.target.files || []);
    setFiles(prev => [...prev, ...picked]);
    e.target.value = '';
  };
  const removeFile = (i) => setFiles(prev => prev.filter((_, idx) => idx !== i));

  const resetForm = () => { setForm(emptyForm); setCoverFile(null); setFiles([]); setEditing(null); setKeepAtts([]); setKeepCover(null); };

  const startEdit = (a) => {
    setEditing(a);
    setForm({
      type: a.scope?.type || 'all',
      value: a.scope?.type === 'all' ? '' : (a.scope?.value || ''),
      title: a.title || '',
      body: a.body || '',
      priority: a.priority || 'normal',
      category: a.category || 'general',
    });
    setCoverFile(null);
    setFiles([]);
    setKeepAtts(a.attachments || []);
    setKeepCover(a.coverUrl ? { url: a.coverUrl, path: a.coverPath || null } : null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const submit = async (e) => {
    e.preventDefault();
    if (form.type !== 'all' && !form.value) { alert('Selecciona el destino'); return; }
    setSaving(true);
    try {
      // Id pregenerado: lo usamos como carpeta en Storage y para escribir el doc
      // una sola vez (así la Cloud Function ya recibe el aviso completo).
      // En edición se reutiliza el id del aviso original.
      const ref = editing ? doc(db, 'announcements', editing.id) : doc(collection(db, 'announcements'));
      const id = ref.id;

      let cover = keepCover;
      if (coverFile) { setProgress('Subiendo portada...'); cover = await uploadAnnouncementCover(id, coverFile); }

      const attachments = [...keepAtts];
      for (let i = 0; i < files.length; i++) {
        setProgress(`Subiendo archivo ${i + 1} de ${files.length}...`);
        attachments.push(await uploadAnnouncementFile(id, files[i]));
      }

      setProgress(editing ? 'Guardando cambios...' : 'Publicando...');
      const payload = {
        title: form.title,
        body: form.body,
        priority: form.priority,
        category: form.category,
        scope: { type: form.type, value: form.type === 'all' ? 'all' : form.value },
        scopeLabel: scopeLabel(),
        coverUrl: cover?.url || null,
        coverPath: cover?.path || null,
        attachments,
      };
      if (editing) {
        await setDoc(ref, { ...payload, updatedAt: new Date().toISOString(), editedByName: userData?.displayName || 'Administración' }, { merge: true });
      } else {
        await setDoc(ref, {
          ...payload,
          authorId: user.uid,
          authorName: userData?.displayName || 'Administración',
          authorRole: 'admin',
          createdAt: new Date().toISOString(),
        });
      }

      setMsg(editing ? 'Aviso actualizado ✅' : 'Aviso publicado ✅');
      resetForm();
      setTimeout(() => setMsg(''), 4000);
      load();
    } catch (err) {
      alert('Error: ' + err.message);
    }
    setProgress('');
    setSaving(false);
  };

  const remove = async (a) => {
    if (!confirm('¿Eliminar este aviso? También se borrarán sus archivos adjuntos.')) return;
    await deleteAnnouncementFiles(a.id); // limpia Storage antes de borrar el doc
    await deleteDoc(doc(db, 'announcements', a.id));
    load();
  };

  return (
    <div className="page-container animate-in">
      <div className="page-header">
        <h1 className="page-title">Avisos y Anuncios</h1>
        <p className="page-subtitle">Publica avisos con imágenes y archivos para todo el colegio, por plantel o por grupo</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 24, alignItems: 'start' }}>
        <div className="card">
          <h3 className="card-title" style={{ marginBottom: 16 }}>
            {editing
              ? <><Pencil size={18} style={{ verticalAlign: 'middle', marginRight: 6 }} /> Editando aviso</>
              : <><Megaphone size={18} style={{ verticalAlign: 'middle', marginRight: 6 }} /> Nuevo aviso</>}
          </h3>
          {editing && (
            <div className="notice notice-info" style={{ marginBottom: 16 }}>
              <p style={{ fontSize: '0.82rem' }}>Estás editando <strong>{editing.title}</strong>. Los cambios se verán reflejados para todos; no se reenvían notificaciones.</p>
            </div>
          )}
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

            <div className="grid-2">
              <div className="form-group">
                <label className="form-label">Prioridad</label>
                <select className="form-select" value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })}>
                  {Object.entries(PRIORIDADES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Categoría</label>
                <select className="form-select" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
                  {Object.entries(CATEGORIAS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Título</label>
              <input className="form-input" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} required />
            </div>
            <div className="form-group">
              <label className="form-label">Mensaje</label>
              <textarea className="form-input" rows={5} value={form.body} onChange={e => setForm({ ...form, body: e.target.value })} required />
            </div>

            <div className="form-group">
              <label className="form-label">Imagen de portada (opcional)</label>
              {(coverFile || keepCover) ? (
                <>
                  <div style={{ position: 'relative' }}>
                    <div className="aviso-cover aviso-cover-form">
                      <div className="aviso-cover-bg" style={{ backgroundImage: `url("${coverFile ? coverPreview : keepCover.url}")` }} />
                      <img src={coverFile ? coverPreview : keepCover.url} alt="portada" className="aviso-cover-img" />
                    </div>
                    <button type="button" onClick={() => { setCoverFile(null); setKeepCover(null); }} className="btn btn-sm btn-danger" style={{ position: 'absolute', top: 8, right: 8 }} title="Quitar portada"><X size={14} /></button>
                  </div>
                  <p style={{ fontSize: '0.72rem', color: 'var(--gris-500)', marginTop: 6 }}>Así se verá la portada. Se ajusta a un marco 16:9 uniforme, sin recortar tu imagen.</p>
                  <label className="btn btn-secondary btn-sm w-full" style={{ cursor: 'pointer', marginTop: 8 }}>
                    <ImagePlus size={14} /> Cambiar imagen
                    <input type="file" accept="image/*" hidden onChange={e => { setCoverFile(e.target.files?.[0] || null); setKeepCover(null); }} />
                  </label>
                </>
              ) : (
                <label className="btn btn-secondary w-full" style={{ cursor: 'pointer' }}>
                  <ImagePlus size={16} /> Elegir imagen
                  <input type="file" accept="image/*" hidden onChange={e => setCoverFile(e.target.files?.[0] || null)} />
                </label>
              )}
            </div>

            <div className="form-group">
              <label className="form-label">Archivos adjuntos (PDF, imágenes, etc.)</label>
              <label className="btn btn-secondary w-full" style={{ cursor: 'pointer' }}>
                <Paperclip size={16} /> Agregar archivos
                <input type="file" multiple hidden onChange={addFiles} />
              </label>
              {keepAtts.length > 0 && (
                <div className="flex flex-col gap-2" style={{ marginTop: 8 }}>
                  {keepAtts.map((f, i) => (
                    <div key={`k${i}`} className="flex justify-between items-center" style={{ gap: 8, fontSize: '0.82rem', padding: '6px 10px', border: '1px solid var(--gris-200)', borderRadius: 8, background: 'var(--surface-hover)' }}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ color: 'var(--gris-500)', fontSize: '0.72rem' }}>{f.size ? humanSize(f.size) : 'actual'}</span>
                        <button type="button" onClick={() => setKeepAtts(prev => prev.filter((_, idx) => idx !== i))} className="btn btn-sm btn-danger" title="Quitar adjunto"><X size={12} /></button>
                      </span>
                    </div>
                  ))}
                </div>
              )}
              {files.length > 0 && (
                <div className="flex flex-col gap-2" style={{ marginTop: 8 }}>
                  {files.map((f, i) => (
                    <div key={i} className="flex justify-between items-center" style={{ gap: 8, fontSize: '0.82rem', padding: '6px 10px', border: '1px solid var(--gris-200)', borderRadius: 8 }}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ color: 'var(--gris-500)', fontSize: '0.72rem' }}>{humanSize(f.size)}</span>
                        <button type="button" onClick={() => removeFile(i)} className="btn btn-sm btn-danger"><X size={12} /></button>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {msg && <p className="badge badge-success" style={{ marginBottom: 12 }}>{msg}</p>}
            <div className="flex gap-2">
              {editing && (
                <button type="button" onClick={resetForm} className="btn btn-secondary" disabled={saving}>Cancelar</button>
              )}
              <button type="submit" className="btn btn-primary w-full" style={{ flex: 1 }} disabled={saving}>
                <Send size={16} /> {saving ? (progress || 'Guardando...') : (editing ? 'Guardar cambios' : 'Publicar aviso')}
              </button>
            </div>
          </form>
        </div>

        <div className="card">
          <h3 className="card-title" style={{ marginBottom: 16 }}>Avisos publicados ({list.length})</h3>
          {list.length === 0 ? (
            <div className="empty-state"><div className="empty-state-icon">📣</div><p className="empty-state-text">Aún no hay avisos</p></div>
          ) : (
            <div className="flex flex-col gap-3">
              {list.map(a => (
                <AnnouncementCard key={a.id} a={a} onDelete={remove} onEdit={startEdit} onImageClick={setLightbox} />
              ))}
            </div>
          )}
        </div>
      </div>

      {lightbox && (
        <div onClick={() => setLightbox(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
          <img src={lightbox} alt="" style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 8 }} />
        </div>
      )}
    </div>
  );
}
