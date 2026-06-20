import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { QRCodeSVG } from 'qrcode.react';
import { UserPlus, Search, Download, Trash2, Edit, QrCode, X } from 'lucide-react';
import {
  NOMBRE_PLANTELES, GRUPOS, nivelesDePlantel, gradosDeNivel,
  makeClassId, classLabel,
} from '../config/colegio';

function generateQR() {
  return 'COC-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).substring(2, 7).toUpperCase();
}

const emptyForm = { name: '', lastName: '', plantel: '', nivel: '', grado: '', grupo: '', parentIds: [] };

export default function Students() {
  const [students, setStudents] = useState([]);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showQR, setShowQR] = useState(null);
  const [editId, setEditId] = useState(null);
  const [deleteStudent, setDeleteStudent] = useState(null);
  const [parents, setParents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const loadStudents = async () => {
    const snap = await getDocs(collection(db, 'students'));
    const list = [];
    snap.forEach(d => list.push({ id: d.id, ...d.data() }));
    list.sort((a, b) => `${a.lastName} ${a.name}`.localeCompare(`${b.lastName} ${b.name}`));
    setStudents(list);
  };

  const loadParents = async () => {
    const snap = await getDocs(collection(db, 'users'));
    const list = [];
    snap.forEach(d => {
      const data = d.data();
      if (data.role === 'parent') list.push({ id: d.id, ...data });
    });
    setParents(list);
  };

  useEffect(() => { loadStudents(); loadParents(); }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const { plantel, nivel, grado, grupo } = form;
    const classId = makeClassId({ plantel, nivel, grado, grupo });
    const payload = { ...form, classId };
    try {
      if (editId) {
        await updateDoc(doc(db, 'students', editId), payload);
      } else {
        await addDoc(collection(db, 'students'), {
          ...payload,
          qrCode: generateQR(),
          createdAt: new Date().toISOString()
        });
      }
      setShowModal(false);
      setEditId(null);
      setForm(emptyForm);
      loadStudents();
    } catch (err) { console.error(err); alert('Error: ' + err.message); }
  };

  const handleEdit = (s) => {
    setForm({
      name: s.name, lastName: s.lastName,
      plantel: s.plantel || '', nivel: s.nivel || '', grado: s.grado || '', grupo: s.grupo || '',
      parentIds: s.parentIds || [],
    });
    setEditId(s.id);
    setShowModal(true);
  };

  const handleDelete = async () => {
    if (!deleteStudent) return;
    setLoading(true);
    try {
      await deleteDoc(doc(db, 'students', deleteStudent.id));
      setDeleteStudent(null);
      loadStudents();
    } catch (err) {
      alert('Error: ' + err.message);
    }
    setLoading(false);
  };

  const printQR = (student) => {
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
      <html><head><title>QR - ${student.name} ${student.lastName}</title>
      <style>body{font-family:Arial;text-align:center;padding:40px;}h2{color:#722F37;}</style></head>
      <body><h2>Colegio Oliverio Cromwell</h2><h3>${student.name} ${student.lastName}</h3>
      <p>${student.grado || ''} ${student.nivel || ''} ${student.grupo || ''}</p>
      <div id="qr"></div>
      <script src="https://cdn.jsdelivr.net/npm/qrcode/build/qrcode.min.js"><\/script>
      <script>QRCode.toCanvas(document.createElement('canvas'),
        '${student.qrCode}',{width:300},function(err,canvas){
        document.getElementById('qr').appendChild(canvas);
        setTimeout(()=>window.print(),500);
      });<\/script></body></html>
    `);
  };

  const filtered = students.filter(s =>
    `${s.name} ${s.lastName} ${s.grado} ${s.nivel} ${s.grupo} ${s.plantel}`.toLowerCase().includes(search.toLowerCase())
  );

  const niveles = form.plantel ? nivelesDePlantel(form.plantel) : [];
  const grados = form.nivel ? gradosDeNivel(form.nivel) : [];

  return (
    <div className="page-container animate-in">
      <div className="page-header flex justify-between items-center">
        <div>
          <h1 className="page-title">Gestión de Alumnos</h1>
          <p className="page-subtitle">{students.length} alumnos registrados</p>
        </div>
        <button onClick={() => { setEditId(null); setForm(emptyForm); setShowModal(true); }} className="btn btn-primary">
          <UserPlus size={16}/> Nuevo Alumno
        </button>
      </div>

      <div className="card mb-4">
        <div style={{position:'relative'}}>
          <Search size={18} style={{position:'absolute',left:14,top:11,color:'var(--gris-500)'}} />
          <input className="form-input" placeholder="Buscar alumno..." value={search} onChange={e => setSearch(e.target.value)} style={{paddingLeft:40}} />
        </div>
      </div>

      <div className="card">
        {filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">👨‍🎓</div>
            <p className="empty-state-text">No se encontraron alumnos</p>
          </div>
        ) : (
          <div className="table-container">
            <table>
              <thead><tr><th>Alumno</th><th>Plantel</th><th>Grupo</th><th>QR</th><th>Acciones</th></tr></thead>
              <tbody>
                {filtered.map(s => (
                  <tr key={s.id}>
                    <td style={{fontWeight:600}}>{s.lastName} {s.name}</td>
                    <td>{s.plantel || '—'}</td>
                    <td>{s.grado} {s.nivel} {s.grupo && `"${s.grupo}"`}</td>
                    <td>
                      <button onClick={() => setShowQR(s)} className="btn btn-sm btn-secondary">
                        <QrCode size={14}/> Ver QR
                      </button>
                    </td>
                    <td>
                      <div className="flex gap-2">
                        <button onClick={() => handleEdit(s)} className="btn btn-sm btn-secondary"><Edit size={14}/></button>
                        <button onClick={() => printQR(s)} className="btn btn-sm btn-gold"><Download size={14}/></button>
                        <button onClick={() => setDeleteStudent(s)} className="btn btn-sm btn-danger"><Trash2 size={14}/></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* QR Modal */}
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
            <p style={{fontSize:'0.75rem',color:'var(--gris-300)',marginTop:8}}>{showQR.qrCode}</p>
            <button onClick={() => printQR(showQR)} className="btn btn-primary mt-4"><Download size={16}/> Imprimir</button>
          </div>
        </div>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">{editId ? 'Editar Alumno' : 'Nuevo Alumno'}</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}><X size={16}/></button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Nombre(s)</label>
                  <input className="form-input" value={form.name} onChange={e => setForm({...form, name: e.target.value})} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Apellidos</label>
                  <input className="form-input" value={form.lastName} onChange={e => setForm({...form, lastName: e.target.value})} required />
                </div>
              </div>
              <div style={{display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:16}}>
                <div className="form-group">
                  <label className="form-label">Plantel</label>
                  <select className="form-select" value={form.plantel} onChange={e => setForm({...form, plantel: e.target.value, nivel: '', grado: ''})} required>
                    <option value="">Seleccionar...</option>
                    {NOMBRE_PLANTELES.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Nivel</label>
                  <select className="form-select" value={form.nivel} onChange={e => setForm({...form, nivel: e.target.value, grado: ''})} required disabled={!form.plantel}>
                    <option value="">{form.plantel ? 'Seleccionar...' : 'Elige plantel'}</option>
                    {niveles.map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Grado</label>
                  <select className="form-select" value={form.grado} onChange={e => setForm({...form, grado: e.target.value})} required disabled={!form.nivel}>
                    <option value="">{form.nivel ? 'Seleccionar...' : 'Elige nivel'}</option>
                    {grados.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Grupo</label>
                  <select className="form-select" value={form.grupo} onChange={e => setForm({...form, grupo: e.target.value})} required>
                    <option value="">Seleccionar...</option>
                    {GRUPOS.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
              </div>
              {form.plantel && form.nivel && form.grado && form.grupo && (
                <p style={{fontSize:'0.8rem', color:'var(--gris-500)', marginBottom:12}}>
                  Grupo: <strong>{classLabel(form)}</strong>
                </p>
              )}
              <div className="form-group">
                <label className="form-label">Padre/Tutor Asignado</label>
                <select className="form-select" value={form.parentIds[0] || ''} onChange={e => setForm({...form, parentIds: e.target.value ? [e.target.value] : []})}>
                  <option value="">Sin asignar</option>
                  {parents.map(p => <option key={p.id} value={p.id}>{p.displayName} ({p.email})</option>)}
                </select>
              </div>
              <div className="modal-footer">
                <button type="button" onClick={() => setShowModal(false)} className="btn btn-secondary">Cancelar</button>
                <button type="submit" className="btn btn-primary">{editId ? 'Guardar Cambios' : 'Registrar Alumno'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Confirmar Eliminar */}
      {deleteStudent && (
        <div className="modal-overlay" onClick={() => !loading && setDeleteStudent(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{textAlign: 'center'}}>
            <div className="modal-header">
              <h3 className="modal-title">Confirmar Eliminación</h3>
              <button className="modal-close" onClick={() => !loading && setDeleteStudent(null)}><X size={16}/></button>
            </div>
            <div style={{marginBottom: 24}}>
              <Trash2 size={48} color="var(--danger)" style={{margin: '0 auto 16px'}} />
              <p>¿Estás seguro de que deseas eliminar al alumno <strong>{deleteStudent.name} {deleteStudent.lastName}</strong>?</p>
              <p style={{fontSize: '0.85rem', color: 'var(--gris-500)', marginTop: 8}}>Se perderá su historial de asistencia.</p>
            </div>
            <div className="modal-footer" style={{justifyContent: 'center'}}>
              <button onClick={() => setDeleteStudent(null)} className="btn btn-secondary" disabled={loading}>Cancelar</button>
              <button onClick={handleDelete} className="btn btn-danger" disabled={loading}>{loading ? 'Eliminando...' : 'Sí, Eliminar'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
