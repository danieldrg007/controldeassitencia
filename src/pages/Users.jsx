import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { db, secondaryAuth, auth } from '../firebase';
import { collection, getDocs, doc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { createUserWithEmailAndPassword, signOut, sendPasswordResetEmail } from 'firebase/auth';
import { UserPlus, Search, Copy, Trash2, X, Edit, Key, Mail, MapPin, ClipboardCheck, Link2, Check, FileSpreadsheet } from 'lucide-react';
import { ROLE_LABELS, NOMBRE_PLANTELES, nivelesDePlantel, gradosDeNivel, GRUPOS, makeClassId, classLabel, parseClassId } from '../config/colegio';
import Avatar from '../components/Avatar';

const ROLE_BADGE = { superadmin: 'badge-danger', admin: 'badge-gold', teacher: 'badge-info', guard: 'badge-warning', parent: 'badge-success', kiosk: 'badge-info' };

// Apartados (pestañas) por tipo de perfil.
const TABS = [
  { id: 'todos', label: 'Todos', roles: null },
  { id: 'admin', label: 'Administración', roles: ['admin', 'superadmin'] },
  { id: 'teacher', label: 'Profesores', roles: ['teacher'] },
  { id: 'parent', label: 'Padres', roles: ['parent'] },
  { id: 'op', label: 'Operación', roles: ['guard', 'kiosk'] },
];
const emptyForm = { displayName: '', email: '', password: '', role: 'parent', classIds: [], plantel: '' };

// Selector de grupos para profesores (agrupado por plantel).
function ClassPicker({ value, onChange }) {
  const toggle = (id) => onChange(value.includes(id) ? value.filter(x => x !== id) : [...value, id]);
  return (
    <div style={{maxHeight:240, overflowY:'auto', border:'1.5px solid var(--gris-200)', borderRadius:'var(--radius-sm)', padding:12}}>
      {NOMBRE_PLANTELES.map(plantel => (
        <div key={plantel} style={{marginBottom:10}}>
          <div style={{fontWeight:700, fontSize:'0.8rem', color:'var(--guinda)', marginBottom:4}}>{plantel}</div>
          <div style={{display:'flex', flexWrap:'wrap', gap:6}}>
            {nivelesDePlantel(plantel).flatMap(nivel =>
              gradosDeNivel(nivel).flatMap(grado =>
                GRUPOS.map(grupo => {
                  const meta = { plantel, nivel, grado, grupo };
                  const id = makeClassId(meta);
                  const on = value.includes(id);
                  return (
                    <button type="button" key={id} onClick={() => toggle(id)}
                      className={`btn btn-sm ${on ? 'btn-primary' : 'btn-secondary'}`}>
                      {grado} {nivel.slice(0,4)} {grupo}
                    </button>
                  );
                })
              )
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function Users() {
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('todos');
  const [showModal, setShowModal] = useState(false);
  const [showLinkModal, setShowLinkModal] = useState(null);
  const [editUser, setEditUser] = useState(null);
  const [deleteUser, setDeleteUser] = useState(null);
  const [baseUrl, setBaseUrl] = useState(window.location.origin);
  const [copiedId, setCopiedId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const loadUsers = async () => {
    const snap = await getDocs(collection(db, 'users'));
    const list = [];
    snap.forEach(d => list.push({ id: d.id, ...d.data() }));
    list.sort((a, b) => (a.displayName || '').localeCompare(b.displayName || ''));
    setUsers(list);
  };

  useEffect(() => { loadUsers(); }, []);

  const generatePassword = () => Math.random().toString(36).slice(-8);

  const openCreate = () => { setForm({ ...emptyForm, password: generatePassword() }); setShowModal(true); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const cred = await createUserWithEmailAndPassword(secondaryAuth, form.email, form.password);
      const payload = {
        email: form.email,
        displayName: form.displayName,
        role: form.role,
        // Guardamos la contraseña inicial para poder generar enlaces de acceso
        // directo. Inseguro a propósito: se asume que el profesor la cambia.
        password: form.password,
        createdAt: new Date().toISOString(),
      };
      if (form.role === 'teacher') payload.classIds = form.classIds;
      if (form.role === 'kiosk') payload.plantel = form.plantel;
      await setDoc(doc(db, 'users', cred.user.uid), payload);
      await signOut(secondaryAuth);
      setShowModal(false);
      setShowLinkModal({ email: form.email, password: form.password, displayName: form.displayName, role: form.role });
      loadUsers();
    } catch (err) {
      console.error(err);
      alert('Error al crear usuario: ' + err.message);
    }
    setLoading(false);
  };

  const openEdit = (u) => {
    setForm({ displayName: u.displayName || '', email: u.email || '', password: '', role: u.role || 'parent', classIds: u.classIds || [], plantel: u.plantel || '' });
    setEditUser(u);
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const payload = { displayName: form.displayName, email: form.email, role: form.role };
      payload.classIds = form.role === 'teacher' ? form.classIds : [];
      payload.plantel = form.role === 'kiosk' ? form.plantel : '';
      await updateDoc(doc(db, 'users', editUser.id), payload);
      setEditUser(null);
      loadUsers();
    } catch (err) {
      alert('Error al editar usuario: ' + err.message);
    }
    setLoading(false);
  };

  const handleSendReset = async (email) => {
    try {
      await sendPasswordResetEmail(auth, email);
      alert('Correo de restablecimiento enviado a ' + email);
    } catch (e) { alert('Error: ' + e.message); }
  };

  const handleDelete = async () => {
    if (!deleteUser) return;
    setLoading(true);
    try {
      await deleteDoc(doc(db, 'users', deleteUser.id));
      setDeleteUser(null);
      loadUsers();
    } catch (err) { alert('Error: ' + err.message); }
    setLoading(false);
  };

  const copyLink = (u) => {
    const link = `${baseUrl}/login?email=${encodeURIComponent(u.email)}&pwd=${encodeURIComponent(u.password)}`;
    navigator.clipboard.writeText(link);
    alert('Enlace de acceso copiado al portapapeles');
  };

  // Enlace de acceso para un usuario existente: abre el login con su correo
  // (y contraseña, si la guardamos al crearlo) precargados. Para los usuarios
  // antiguos sin contraseña almacenada, el enlace solo lleva el correo.
  const copyAccessLink = async (u) => {
    const pwd = u.password ? `&pwd=${encodeURIComponent(u.password)}` : '';
    const link = `${baseUrl}/login?email=${encodeURIComponent(u.email || '')}${pwd}`;
    try { await navigator.clipboard.writeText(link); }
    catch { window.prompt('Copia el enlace de acceso:', link); }
    setCopiedId(u.id);
    setTimeout(() => setCopiedId(c => (c === u.id ? null : c)), 2000);
  };

  const activeTab = TABS.find(t => t.id === tab) || TABS[0];
  const filtered = useMemo(() => users.filter(u => {
    if (activeTab.roles && !activeTab.roles.includes(u.role)) return false;
    const q = search.toLowerCase();
    return (u.displayName || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q);
  }), [users, activeTab, search]);

  // Conteo por apartado (para los badges de las pestañas).
  const tabCounts = useMemo(() => {
    const c = {};
    TABS.forEach(t => { c[t.id] = t.roles ? users.filter(u => t.roles.includes(u.role)).length : users.length; });
    return c;
  }, [users]);

  const renderRoleFields = () => (
    <>
      <div className="form-group">
        <label className="form-label">Rol</label>
        <select className="form-select" value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
          <option value="parent">Padre / Tutor</option>
          <option value="teacher">Profesor</option>
          <option value="guard">Checador</option>
          <option value="kiosk">Kiosko (tablet)</option>
          <option value="admin">Administrador</option>
          <option value="superadmin">Super Administrador</option>
        </select>
      </div>
      {form.role === 'teacher' && (
        <div className="form-group">
          <label className="form-label">Grupos asignados ({form.classIds.length})</label>
          <ClassPicker value={form.classIds} onChange={(ids) => setForm({ ...form, classIds: ids })} />
        </div>
      )}
      {form.role === 'kiosk' && (
        <div className="form-group">
          <label className="form-label">Plantel del kiosko</label>
          <select className="form-select" value={form.plantel} onChange={e => setForm({ ...form, plantel: e.target.value })} required>
            <option value="">Selecciona un plantel</option>
            {NOMBRE_PLANTELES.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <p style={{fontSize:'0.75rem', color:'var(--gris-500)', marginTop:4}}>La asistencia registrada en esta tablet se marcará con este plantel.</p>
        </div>
      )}
    </>
  );

  return (
    <div className="page-container animate-in">
      <div className="page-header flex justify-between items-center">
        <div>
          <h1 className="page-title">Gestión de Usuarios</h1>
          <p className="page-subtitle">{users.length} usuarios en total</p>
        </div>
        <div style={{display:'flex', gap:8, flexWrap:'wrap'}}>
          <button onClick={() => navigate('/import-teachers')} className="btn btn-secondary"><FileSpreadsheet size={16}/> Importar profesores</button>
          <button onClick={openCreate} className="btn btn-primary"><UserPlus size={16}/> Nuevo Usuario</button>
        </div>
      </div>

      {/* Apartados por tipo de perfil */}
      <div className="seg mb-4" style={{flexWrap:'wrap'}}>
        {TABS.map(t => (
          <button key={t.id} type="button" className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}
            style={{display:'inline-flex', alignItems:'center', justifyContent:'center', gap:6}}>
            {t.label}
            <span className="badge" style={{background: tab === t.id ? 'rgba(255,255,255,0.25)' : 'var(--surface-border)', color: tab === t.id ? '#fff' : 'var(--text-muted)'}}>{tabCounts[t.id]}</span>
          </button>
        ))}
      </div>

      {/* Buscador */}
      <div className="card mb-4">
        <div style={{position:'relative'}}>
          <Search size={18} style={{position:'absolute', left:14, top:11, color:'var(--gris-500)'}} />
          <input className="form-input" placeholder="Buscar por nombre o correo..." value={search} onChange={e => setSearch(e.target.value)} style={{paddingLeft:40}} />
        </div>
      </div>

      {/* Tarjetas de usuarios */}
      {filtered.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon">👥</div>
            <p className="empty-state-text">No hay usuarios en este apartado</p>
          </div>
        </div>
      ) : (
        <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(280px, 1fr))', gap:16}}>
          {filtered.map(u => (
            <div key={u.id} className="card" style={{display:'flex', flexDirection:'column', gap:10}}>
              <div style={{display:'flex', alignItems:'center', gap:12}}>
                <Avatar src={u.photo} name={u.displayName} size={48} />
                <div style={{flex:1, minWidth:0}}>
                  <div style={{fontWeight:700, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{u.displayName || 'Sin nombre'}</div>
                  <span className={`badge ${ROLE_BADGE[u.role] || 'badge-info'}`} style={{marginTop:2}}>{ROLE_LABELS[u.role] || u.role}</span>
                </div>
              </div>

              <div style={{fontSize:'0.82rem', color:'var(--gris-600)', display:'flex', alignItems:'center', gap:6, wordBreak:'break-all'}}>
                <Mail size={13} style={{flexShrink:0}}/> {u.email || '—'}
              </div>
              {u.role === 'teacher' && (
                <div style={{fontSize:'0.82rem', color:'var(--gris-500)', display:'flex', alignItems:'center', gap:6}}>
                  <ClipboardCheck size={13}/> {u.classIds?.length || 0} grupo(s) asignado(s)
                </div>
              )}
              {u.role === 'kiosk' && (
                <div style={{fontSize:'0.82rem', color:'var(--gris-500)', display:'flex', alignItems:'center', gap:6}}>
                  <MapPin size={13}/> {u.plantel ? `Plantel ${u.plantel}` : 'Sin plantel asignado'}
                </div>
              )}

              <div style={{marginTop:'auto', paddingTop:4, display:'flex', flexDirection:'column', gap:8}}>
                <button onClick={() => copyAccessLink(u)} className="btn btn-sm btn-secondary w-full" style={{justifyContent:'center'}} title={u.password ? 'Copia el enlace con correo y contraseña precargados (acceso directo)' : 'Copia el enlace con el correo precargado (este usuario no tiene contraseña guardada)'}>
                  {copiedId === u.id ? <><Check size={14}/> ¡Enlace copiado!</> : <><Link2 size={14}/> {u.password ? 'Copiar acceso directo' : 'Copiar enlace de acceso'}</>}
                </button>
                <div style={{display:'flex', gap:8, flexWrap:'wrap'}}>
                  <button onClick={() => openEdit(u)} className="btn btn-sm btn-secondary" style={{flex:1}}><Edit size={14}/> Editar</button>
                  <button onClick={() => handleSendReset(u.email)} className="btn btn-sm btn-gold" title="Enviar correo para restablecer contraseña"><Key size={14}/></button>
                  <button onClick={() => setDeleteUser(u)} className="btn btn-sm btn-danger" title="Eliminar"><Trash2 size={14}/></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal Nuevo Usuario */}
      {showModal && (
        <div className="modal-overlay" onClick={() => !loading && setShowModal(false)}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Nuevo Usuario</h3>
              <button className="modal-close" onClick={() => !loading && setShowModal(false)}><X size={16}/></button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label className="form-label">Nombre Completo</label>
                <input className="form-input" value={form.displayName} onChange={e => setForm({...form, displayName: e.target.value})} required />
              </div>
              <div className="form-group">
                <label className="form-label">Correo Electrónico</label>
                <input type="email" className="form-input" value={form.email} onChange={e => setForm({...form, email: e.target.value})} required />
              </div>
              <div className="form-group">
                <label className="form-label">Contraseña (Generada automáticamente)</label>
                <input className="form-input" value={form.password} onChange={e => setForm({...form, password: e.target.value})} required />
              </div>
              {renderRoleFields()}
              <div className="modal-footer">
                <button type="button" onClick={() => setShowModal(false)} className="btn btn-secondary" disabled={loading}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={loading}>{loading ? 'Guardando...' : 'Crear Usuario'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Editar Usuario */}
      {editUser && (
        <div className="modal-overlay" onClick={() => !loading && setEditUser(null)}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Editar Usuario</h3>
              <button className="modal-close" onClick={() => !loading && setEditUser(null)}><X size={16}/></button>
            </div>
            <form onSubmit={handleEditSubmit}>
              <div className="form-group">
                <label className="form-label">Nombre Completo</label>
                <input className="form-input" value={form.displayName} onChange={e => setForm({...form, displayName: e.target.value})} required />
              </div>
              <div className="form-group">
                <label className="form-label">Correo Electrónico (referencia)</label>
                <input type="email" className="form-input" value={form.email} onChange={e => setForm({...form, email: e.target.value})} required />
                <p style={{fontSize:'0.75rem', color:'var(--gris-500)', marginTop:4}}>Cambiar el correo aquí no cambia el inicio de sesión.</p>
              </div>
              {renderRoleFields()}
              <div className="modal-footer">
                <button type="button" onClick={() => setEditUser(null)} className="btn btn-secondary" disabled={loading}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={loading}>{loading ? 'Guardando...' : 'Guardar Cambios'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Confirmar Eliminar */}
      {deleteUser && (
        <div className="modal-overlay" onClick={() => !loading && setDeleteUser(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{textAlign: 'center'}}>
            <div className="modal-header">
              <h3 className="modal-title">Confirmar Eliminación</h3>
              <button className="modal-close" onClick={() => !loading && setDeleteUser(null)}><X size={16}/></button>
            </div>
            <div style={{marginBottom: 24}}>
              <Trash2 size={48} color="var(--danger)" style={{margin: '0 auto 16px'}} />
              <p>¿Eliminar a <strong>{deleteUser.displayName}</strong>?</p>
              <p style={{fontSize: '0.85rem', color: 'var(--gris-500)', marginTop: 8}}>Esto no borra su cuenta de Auth, solo su perfil en la base de datos.</p>
            </div>
            <div className="modal-footer" style={{justifyContent: 'center'}}>
              <button onClick={() => setDeleteUser(null)} className="btn btn-secondary" disabled={loading}>Cancelar</button>
              <button onClick={handleDelete} className="btn btn-danger" disabled={loading}>{loading ? 'Eliminando...' : 'Sí, Eliminar'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Link Generado */}
      {showLinkModal && (
        <div className="modal-overlay">
          <div className="modal" style={{textAlign:'center'}}>
            <div style={{width:64,height:64,borderRadius:'50%',background:'var(--success-bg)',color:'var(--success)',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 16px'}}>
              <UserPlus size={32} />
            </div>
            <h3 className="modal-title" style={{marginBottom:8}}>¡Usuario Creado!</h3>
            <p style={{color:'var(--gris-500)', marginBottom:24}}>
              {ROLE_LABELS[showLinkModal.role]} · <strong>{showLinkModal.displayName}</strong>
            </p>
            <div style={{background:'var(--gris-100)', padding:16, borderRadius:'var(--radius-sm)', textAlign:'left', marginBottom:24}}>
              <p style={{fontSize:'0.85rem', marginBottom:8}}><strong>Correo:</strong> {showLinkModal.email}</p>
              <p style={{fontSize:'0.85rem', marginBottom:8}}><strong>Contraseña:</strong> {showLinkModal.password}</p>
              <div style={{marginTop:16}}>
                <label className="form-label">Enlace de acceso directo:</label>
                <div className="flex gap-2">
                  <input readOnly className="form-input" style={{fontSize:'0.8rem'}} value={`${baseUrl}/login?email=${encodeURIComponent(showLinkModal.email)}&pwd=${encodeURIComponent(showLinkModal.password)}`} />
                  <button onClick={() => copyLink(showLinkModal)} className="btn btn-primary btn-icon"><Copy size={16}/></button>
                </div>
              </div>
            </div>
            <button onClick={() => setShowLinkModal(null)} className="btn btn-primary w-full">Aceptar</button>
          </div>
        </div>
      )}
    </div>
  );
}
