import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { QRCodeSVG } from 'qrcode.react';
import { UserPlus, Search, Download, Trash2, Edit, QrCode, X, Upload, Mail, Phone, ArrowRightLeft, Ban, CheckCircle2, GraduationCap, AlertTriangle } from 'lucide-react';
import {
  NOMBRE_PLANTELES, GRUPOS, nivelesDePlantel, gradosDeNivel,
  makeClassId, classLabel, promoverAlumno, adminScope, studentInScope,
} from '../config/colegio';
import { useAuth } from '../context/AuthContext';
import Avatar from '../components/Avatar';

function generateQR() {
  return 'COC-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).substring(2, 7).toUpperCase();
}

const emptyForm = { name: '', lastName: '', plantel: '', nivel: '', grado: '', grupo: '', parentIds: [] };

export default function Students() {
  const { userData } = useAuth();
  const role = typeof userData?.role === 'string' ? userData.role.trim().toLowerCase() : '';
  const isAdminRole = role === 'admin' || role === 'superadmin';
  const scope = adminScope(userData); // admin de plantel/sección → solo ve su alcance
  const [students, setStudents] = useState([]);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showQR, setShowQR] = useState(null);
  const [editId, setEditId] = useState(null);
  const [deleteStudent, setDeleteStudent] = useState(null);
  const [parents, setParents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [importPreview, setImportPreview] = useState(null); // { items:[{a,curp,exists}], fileName }
  const [importing, setImporting] = useState(false);
  const [moveStudent, setMoveStudent] = useState(null);     // alumno al que se le cambia de grupo
  const [moveForm, setMoveForm] = useState({ plantel: '', nivel: '', grado: '', grupo: '' });
  const [showPromote, setShowPromote] = useState(false);    // promoción masiva de grado (fin de ciclo)
  const [promoteConfirm, setPromoteConfirm] = useState('');
  const [promoting, setPromoting] = useState(false);

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

  // Suspensión por adeudo: bloquea el registro de entrada/salida del alumno en
  // Scanner y Kiosko hasta que administración lo reactive.
  const toggleSuspended = async (s) => {
    const action = s.suspended ? 'reactivar' : 'suspender';
    const msg = s.suspended
      ? `¿Reactivar a ${s.name} ${s.lastName}? Podrá volver a registrar entradas y salidas.`
      : `⚠️ ¿Suspender a ${s.name} ${s.lastName} por adeudo?\n\nAl escanear su QR aparecerá "Cuenta suspendida — presentarse en administración" y no se registrará su acceso.`;
    if (!window.confirm(msg)) return;
    try {
      await updateDoc(doc(db, 'students', s.id), {
        suspended: !s.suspended,
        suspendedAt: !s.suspended ? new Date().toISOString() : null,
      });
      loadStudents();
    } catch (err) { alert(`Error al ${action}: ` + err.message); }
  };

  const openMove = (s) => {
    setMoveForm({ plantel: s.plantel || '', nivel: s.nivel || '', grado: s.grado || '', grupo: s.grupo || '' });
    setMoveStudent(s);
  };

  const handleMove = async (e) => {
    e.preventDefault();
    const { plantel, nivel, grado, grupo } = moveForm;
    const newClassId = makeClassId({ plantel, nivel, grado, grupo });
    if (newClassId === moveStudent.classId) { alert('El alumno ya está en ese grupo.'); return; }
    setLoading(true);
    try {
      await updateDoc(doc(db, 'students', moveStudent.id), {
        plantel, nivel, grado, grupo,
        classId: newClassId,
        lastGroupChange: {
          from: moveStudent.classId || '',
          to: newClassId,
          at: new Date().toISOString(),
        },
      });
      setMoveStudent(null);
      loadStudents();
    } catch (err) { alert('Error al cambiar de grupo: ' + err.message); }
    setLoading(false);
  };

  // Vista previa de la promoción de grado (fin de ciclo, p. ej. 31 de agosto).
  const promotePreview = () => {
    const activos = students.filter(s => !s.egresado && s.nivel && s.grado);
    const promovidos = [], egresan = [], revisar = [], sinDatos = students.filter(s => !s.egresado && (!s.nivel || !s.grado));
    for (const s of activos) {
      const r = promoverAlumno(s);
      if (r.invalido) { sinDatos.push(s); continue; }
      if (r.egresado) { egresan.push(s); continue; }
      if (r.plantelSinNivel) revisar.push({ s, r });
      promovidos.push({ s, r });
    }
    return { promovidos, egresan, revisar, sinDatos };
  };

  const runPromotion = async () => {
    const { promovidos, egresan } = promotePreview();
    setPromoting(true);
    const at = new Date().toISOString();
    try {
      await Promise.all([
        ...promovidos.map(({ s, r }) => updateDoc(doc(db, 'students', s.id), {
          nivel: r.nivel,
          grado: r.grado,
          classId: makeClassId({ plantel: s.plantel, nivel: r.nivel, grado: r.grado, grupo: s.grupo || '' }),
          lastPromotion: { from: `${s.grado} ${s.nivel}`, to: `${r.grado} ${r.nivel}`, at },
        })),
        ...egresan.map(({ id, grado, nivel }) => updateDoc(doc(db, 'students', id), {
          egresado: true,
          egresadoAt: at,
          lastPromotion: { from: `${grado} ${nivel}`, to: 'Egresado', at },
        })),
      ]);
      setShowPromote(false);
      setPromoteConfirm('');
      await loadStudents();
      alert(`Promoción completada: ${promovidos.length} alumnos subieron de grado y ${egresan.length} egresaron.`);
    } catch (err) { alert('Error en la promoción: ' + err.message); }
    setPromoting(false);
  };

  const printQR = (student) => {
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
      <html><head><title>QR - ${student.name} ${student.lastName}</title>
      <style>body{font-family:Arial;text-align:center;padding:40px;}h2{color:#722F37;}</style></head>
      <body><h2>Colegio Oliverio Cromwell</h2><h3>${student.name} ${student.lastName}</h3>
      <p>${student.grado || ''} ${student.nivel || ''} ${student.grupo || ''}</p>
      <div id="qr"></div>
      <script src="https://cdn.jsdelivr.net/npm/qrcode/build/qrcode.min.js"></script>
      <script>QRCode.toCanvas(document.createElement('canvas'),
        '${student.qrCode}',{width:300},function(err,canvas){
        document.getElementById('qr').appendChild(canvas);
        setTimeout(()=>window.print(),500);
      });</script></body></html>
    `);
  };

  // Lee el archivo exportado por Inscripciones y arma la vista previa (con dedupe por CURP).
  const handleImportFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const alumnos = Array.isArray(data) ? data : (data.alumnos || []);
      if (!alumnos.length) { alert('El archivo no contiene alumnos.'); return; }
      const existingCurps = new Set(students.map(s => (s.curp || '').toUpperCase()).filter(Boolean));
      const seen = new Set();
      const items = alumnos.map(a => {
        const curp = (a.curp || '').toUpperCase().trim();
        const dupInFile = curp && seen.has(curp);
        if (curp) seen.add(curp);
        return { a, curp, exists: (curp && existingCurps.has(curp)) || dupInFile };
      });
      setImportPreview({ items, fileName: file.name });
    } catch (err) { alert('No se pudo leer el archivo: ' + err.message); }
  };

  const confirmImport = async () => {
    if (!importPreview) return;
    const toCreate = importPreview.items.filter(it => !it.exists);
    if (toCreate.length === 0) { alert('No hay alumnos nuevos para importar (todos ya existen).'); return; }
    setImporting(true);
    try {
      await Promise.all(toCreate.map(it => {
        const a = it.a;
        return addDoc(collection(db, 'students'), {
          name: a.name || '', lastName: a.lastName || '',
          plantel: a.plantel || '', nivel: a.nivel || '', grado: a.grado || '',
          grupo: '', classId: '', parentIds: [],
          qrCode: generateQR(),
          curp: it.curp || '', tutor: a.tutor || null, inscripcionId: a.inscripcionId || '',
          source: 'inscripciones',
          createdAt: new Date().toISOString(),
        });
      }));
      const n = toCreate.length;
      setImportPreview(null);
      await loadStudents();
      alert(`${n} alumno(s) importado(s). Ahora asígnales su grupo y tutor desde la lista.`);
    } catch (err) { alert('Error al importar: ' + err.message); }
    setImporting(false);
  };

  const filtered = students.filter(s =>
    studentInScope(s, scope) &&
    `${s.name} ${s.lastName} ${s.grado} ${s.nivel} ${s.grupo} ${s.plantel}`.toLowerCase().includes(search.toLowerCase())
  );
  const editingTutor = editId ? students.find(s => s.id === editId)?.tutor : null;

  const niveles = form.plantel ? nivelesDePlantel(form.plantel) : [];
  const grados = form.nivel ? gradosDeNivel(form.nivel) : [];

  return (
    <div className="page-container animate-in">
      <div className="page-header flex justify-between items-center">
        <div>
          <h1 className="page-title">Gestión de Alumnos</h1>
          <p className="page-subtitle">{students.length} alumnos registrados</p>
        </div>
        <div style={{display:'flex', gap:8, flexWrap:'wrap'}}>
          {isAdminRole && (
            <button onClick={() => { setPromoteConfirm(''); setShowPromote(true); }} className="btn btn-gold" title="Subir de grado a todos los alumnos (fin de ciclo escolar)">
              <GraduationCap size={16}/> <span>Promover grado</span>
            </button>
          )}
          <label className="btn btn-secondary" style={{cursor:'pointer'}} title="Importar alumnos exportados desde Inscripciones">
            <Upload size={16}/> <span>Importar</span>
            <input type="file" accept="application/json,.json" hidden onChange={handleImportFile} />
          </label>
          <button onClick={() => { setEditId(null); setForm(emptyForm); setShowModal(true); }} className="btn btn-primary">
            <UserPlus size={16}/> <span>Nuevo Alumno</span>
          </button>
        </div>
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
            <table className="table-cards">
              <thead><tr><th>Alumno</th><th>Plantel</th><th>Grupo</th><th>QR</th><th>Acciones</th></tr></thead>
              <tbody>
                {filtered.map(s => (
                  <tr key={s.id}>
                    <td>
                      <div style={{display:'flex', alignItems:'center', gap:10}}>
                        <Avatar name={s.name} size={34} />
                        <span style={{fontWeight:600, opacity: s.suspended || s.egresado ? 0.6 : 1}}>{s.lastName} {s.name}</span>
                        {s.suspended && <span className="badge badge-danger"><Ban size={11}/> Suspendido</span>}
                        {s.egresado && <span className="badge badge-gold"><GraduationCap size={11}/> Egresado</span>}
                      </div>
                    </td>
                    <td data-label="Plantel">{s.plantel || '—'}</td>
                    <td data-label="Grupo">{s.grado} {s.nivel} {s.grupo && `"${s.grupo}"`}</td>
                    <td data-label="QR">
                      <button onClick={() => setShowQR(s)} className="btn btn-sm btn-secondary">
                        <QrCode size={14}/> Ver QR
                      </button>
                    </td>
                    <td data-label="">
                      <div className="flex gap-2" style={{flexWrap:'wrap'}}>
                        <button onClick={() => handleEdit(s)} className="btn btn-sm btn-secondary" title="Editar los datos del alumno"><Edit size={14}/> Editar</button>
                        <button onClick={() => openMove(s)} className="btn btn-sm btn-secondary" title="Cambiarlo a otro plantel/grado/grupo"><ArrowRightLeft size={14}/> Cambiar grupo</button>
                        <button onClick={() => toggleSuspended(s)} className={`btn btn-sm ${s.suspended ? 'btn-success' : 'btn-gold'}`} title={s.suspended ? 'Quitar la suspensión: vuelve a poder entrar al colegio' : 'Suspender por adeudo: el escáner y el kiosko no le permitirán el acceso'}>
                          {s.suspended ? <><CheckCircle2 size={14}/> Reactivar</> : <><Ban size={14}/> Suspender</>}
                        </button>
                        <button onClick={() => printQR(s)} className="btn btn-sm btn-gold" title="Descargar/imprimir su credencial con código QR"><Download size={14}/> Imprimir QR</button>
                        <button onClick={() => setDeleteStudent(s)} className="btn btn-sm btn-danger" title="Eliminar al alumno de forma permanente"><Trash2 size={14}/> Eliminar</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal vista previa de importación */}
      {importPreview && (
        <div className="modal-overlay" onClick={() => !importing && setImportPreview(null)}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Importar alumnos inscritos</h3>
              <button className="modal-close" onClick={() => !importing && setImportPreview(null)}><X size={16}/></button>
            </div>
            {(() => {
              const nuevos = importPreview.items.filter(i => !i.exists).length;
              const repetidos = importPreview.items.length - nuevos;
              return (
                <>
                  <div className="flex gap-2" style={{marginBottom:12, flexWrap:'wrap'}}>
                    <span className="badge badge-success">{nuevos} nuevos</span>
                    {repetidos > 0 && <span className="badge badge-warning">{repetidos} ya existen (se omiten)</span>}
                  </div>
                  <div className="table-container" style={{maxHeight:340, overflowY:'auto'}}>
                    <table>
                      <thead><tr><th>Alumno</th><th>Plantel</th><th>Nivel / Grado</th><th>Estado</th></tr></thead>
                      <tbody>
                        {importPreview.items.map((it, i) => (
                          <tr key={i} style={{opacity: it.exists ? 0.5 : 1}}>
                            <td style={{fontWeight:600}}>{it.a.lastName} {it.a.name}</td>
                            <td>{it.a.plantel || '—'}</td>
                            <td>{it.a.nivel} {it.a.grado}</td>
                            <td>{it.exists ? <span className="badge badge-warning">Ya existe</span> : <span className="badge badge-success">Nuevo</span>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p style={{fontSize:'0.78rem', color:'var(--gris-500)', marginTop:10}}>Se importan sin grupo ni tutor; los asignas después desde la lista. Los repetidos (por CURP) se omiten.</p>
                  <div className="modal-footer">
                    <button onClick={() => setImportPreview(null)} className="btn btn-secondary" disabled={importing}>Cancelar</button>
                    <button onClick={confirmImport} className="btn btn-primary" disabled={importing || nuevos === 0}>{importing ? 'Importando…' : `Importar ${nuevos} alumno(s)`}</button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

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
              <div className="form-grid-auto">
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
              {editingTutor && (editingTutor.nombrePadre || editingTutor.nombreMadre) && (
                <div style={{background:'var(--surface-hover)', border:'1px solid var(--surface-border)', borderRadius:'var(--radius-sm)', padding:12, marginBottom:12}}>
                  <p style={{fontSize:'0.75rem', fontWeight:700, color:'var(--guinda)', marginBottom:6, textTransform:'uppercase'}}>Tutor (datos de inscripción)</p>
                  {[['Padre', editingTutor.nombrePadre, editingTutor.correoPadre, editingTutor.celPadre], ['Madre', editingTutor.nombreMadre, editingTutor.correoMadre, editingTutor.celMadre]].map(([rol, nom, mail, cel]) => nom ? (
                    <div key={rol} style={{fontSize:'0.8rem', color:'var(--gris-600)', marginBottom:4}}>
                      <strong>{rol}:</strong> {nom}
                      {mail && <span style={{display:'inline-flex', alignItems:'center', gap:3, marginLeft:8}}><Mail size={12}/> {mail}</span>}
                      {cel && <span style={{display:'inline-flex', alignItems:'center', gap:3, marginLeft:8}}><Phone size={12}/> {cel}</span>}
                    </div>
                  ) : null)}
                  <p style={{fontSize:'0.72rem', color:'var(--gris-500)', marginTop:4}}>Crea/elige la cuenta de este tutor abajo para ligarlo al alumno.</p>
                </div>
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

      {/* Modal Promoción de Grado (fin de ciclo) */}
      {showPromote && (() => {
        const { promovidos, egresan, revisar, sinDatos } = promotePreview();
        const ok = promoteConfirm.trim().toUpperCase() === 'PROMOVER';
        return (
          <div className="modal-overlay" onClick={() => !promoting && setShowPromote(false)}>
            <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h3 className="modal-title"><GraduationCap size={20} style={{verticalAlign:'middle', marginRight:6}}/> Promoción de grado escolar</h3>
                <button className="modal-close" onClick={() => !promoting && setShowPromote(false)}><X size={16}/></button>
              </div>
              <div className="notice notice-warning" style={{marginBottom:16}}>
                <AlertTriangle size={20} style={{flexShrink:0, marginTop:2}}/>
                <p style={{fontSize:'0.85rem', lineHeight:1.5}}>
                  Esta acción sube de grado a <strong>TODOS los alumnos</strong> al mismo tiempo (fin de ciclo escolar, p. ej. 31 de agosto).
                  Los de último grado pasan al siguiente nivel y los de 3° de Preparatoria se marcan como egresados. <strong>No se puede deshacer en bloque.</strong>
                </p>
              </div>
              <div className="stats-grid" style={{marginBottom:16}}>
                <div className="stat-card"><div className="stat-icon success"><GraduationCap size={20}/></div><div><div className="stat-value">{promovidos.length}</div><div className="stat-label">Suben de grado</div></div></div>
                <div className="stat-card"><div className="stat-icon guinda"><GraduationCap size={20}/></div><div><div className="stat-value">{egresan.length}</div><div className="stat-label">Egresan</div></div></div>
                <div className="stat-card"><div className="stat-icon warning"><AlertTriangle size={20}/></div><div><div className="stat-value">{revisar.length}</div><div className="stat-label">Revisar plantel</div></div></div>
                <div className="stat-card"><div className="stat-icon danger"><AlertTriangle size={20}/></div><div><div className="stat-value">{sinDatos.length}</div><div className="stat-label">Sin nivel/grado</div></div></div>
              </div>
              {revisar.length > 0 && (
                <div className="notice notice-info" style={{marginBottom:12}}>
                  <p style={{fontSize:'0.8rem'}}>
                    <strong>Cambio de plantel pendiente:</strong> {revisar.map(({s, r}) => `${s.name} ${s.lastName} (→ ${r.nivel}, ${s.plantel} no lo ofrece)`).join('; ')}.
                    Se promoverán de todas formas; reasígnales plantel después.
                  </p>
                </div>
              )}
              {sinDatos.length > 0 && (
                <p style={{fontSize:'0.8rem', color:'var(--gris-500)', marginBottom:12}}>
                  Sin nivel o grado válido (se omiten): {sinDatos.map(s => `${s.name} ${s.lastName}`).join(', ')}.
                </p>
              )}
              <div className="form-group">
                <label className="form-label">Escribe PROMOVER para confirmar</label>
                <input className="form-input" value={promoteConfirm} onChange={e => setPromoteConfirm(e.target.value)}
                  placeholder="PROMOVER" style={{textTransform:'uppercase', letterSpacing:1, fontWeight:700}} />
              </div>
              <div className="modal-footer">
                <button onClick={() => setShowPromote(false)} className="btn btn-secondary" disabled={promoting}>Cancelar</button>
                <button onClick={runPromotion} className="btn btn-danger" disabled={!ok || promoting || (promovidos.length + egresan.length === 0)}>
                  {promoting ? 'Promoviendo…' : `Promover ${promovidos.length + egresan.length} alumno(s)`}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Modal Cambiar de Grupo */}
      {moveStudent && (() => {
        const nivelesM = moveForm.plantel ? nivelesDePlantel(moveForm.plantel) : [];
        const gradosM = moveForm.nivel ? gradosDeNivel(moveForm.nivel) : [];
        return (
          <div className="modal-overlay" onClick={() => !loading && setMoveStudent(null)}>
            <div className="modal" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h3 className="modal-title"><ArrowRightLeft size={18} style={{verticalAlign:'middle', marginRight:6}}/> Cambiar de grupo</h3>
                <button className="modal-close" onClick={() => !loading && setMoveStudent(null)}><X size={16}/></button>
              </div>
              <div style={{marginBottom:16, padding:'10px 14px', background:'var(--surface-hover)', borderRadius:'var(--radius-sm)'}}>
                <strong>{moveStudent.name} {moveStudent.lastName}</strong>
                <p style={{fontSize:'0.82rem', color:'var(--gris-500)', marginTop:2}}>
                  Grupo actual: {moveStudent.grado} {moveStudent.nivel} {moveStudent.grupo ? `"${moveStudent.grupo}"` : ''} · {moveStudent.plantel || 'sin plantel'}
                </p>
              </div>
              <form onSubmit={handleMove}>
                <div className="grid-2">
                  <div className="form-group">
                    <label className="form-label">Plantel</label>
                    <select className="form-select" value={moveForm.plantel} onChange={e => setMoveForm({...moveForm, plantel: e.target.value, nivel: '', grado: ''})} required>
                      <option value="">Seleccionar...</option>
                      {NOMBRE_PLANTELES.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Nivel</label>
                    <select className="form-select" value={moveForm.nivel} onChange={e => setMoveForm({...moveForm, nivel: e.target.value, grado: ''})} required disabled={!moveForm.plantel}>
                      <option value="">...</option>
                      {nivelesM.map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Grado</label>
                    <select className="form-select" value={moveForm.grado} onChange={e => setMoveForm({...moveForm, grado: e.target.value})} required disabled={!moveForm.nivel}>
                      <option value="">...</option>
                      {gradosM.map(g => <option key={g} value={g}>{g}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Grupo</label>
                    <select className="form-select" value={moveForm.grupo} onChange={e => setMoveForm({...moveForm, grupo: e.target.value})} required>
                      <option value="">...</option>
                      {GRUPOS.map(g => <option key={g} value={g}>{g}</option>)}
                    </select>
                  </div>
                </div>
                {moveForm.plantel && moveForm.nivel && moveForm.grado && moveForm.grupo && (
                  <p style={{fontSize:'0.82rem', marginBottom:12}}>
                    Nuevo grupo: <strong style={{color:'var(--guinda)'}}>{classLabel(moveForm)}</strong>
                  </p>
                )}
                <div className="modal-footer">
                  <button type="button" onClick={() => setMoveStudent(null)} className="btn btn-secondary" disabled={loading}>Cancelar</button>
                  <button type="submit" className="btn btn-primary" disabled={loading}>{loading ? 'Guardando...' : 'Cambiar de grupo'}</button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}

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
