import { useState, useEffect } from 'react';
import { db, secondaryAuth, auth } from '../firebase';
import { collection, getDocs, doc, setDoc, updateDoc, deleteDoc, query, where } from 'firebase/firestore';
import { createUserWithEmailAndPassword, signOut, sendPasswordResetEmail } from 'firebase/auth';
import { UserPlus, Search, Copy, Trash2, Link as LinkIcon, X, Edit, Key } from 'lucide-react';

export default function Users() {
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showLinkModal, setShowLinkModal] = useState(null);
  const [editUser, setEditUser] = useState(null);
  const [deleteUser, setDeleteUser] = useState(null);
  const [baseUrl, setBaseUrl] = useState(window.location.origin);
  const [loading, setLoading] = useState(false);
  
  const [form, setForm] = useState({
    displayName: '',
    email: '',
    password: ''
  });

  const loadUsers = async () => {
    const snap = await getDocs(query(collection(db, 'users'), where('role', '==', 'parent')));
    const list = [];
    snap.forEach(d => list.push({ id: d.id, ...d.data() }));
    list.sort((a, b) => a.displayName.localeCompare(b.displayName));
    setUsers(list);
  };

  useEffect(() => { loadUsers(); }, []);

  const generatePassword = () => {
    return Math.random().toString(36).slice(-8);
  };

  const handleOpenModal = () => {
    setForm({
      displayName: '',
      email: '',
      password: generatePassword()
    });
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      // Crear usuario en Firebase Auth usando la app secundaria para no desloguear al admin
      const cred = await createUserWithEmailAndPassword(secondaryAuth, form.email, form.password);
      
      // Guardar datos en Firestore
      await setDoc(doc(db, 'users', cred.user.uid), {
        email: form.email,
        displayName: form.displayName,
        role: 'parent',
        createdAt: new Date().toISOString()
      });

      // Cerrar sesión en la app secundaria
      await signOut(secondaryAuth);

      setShowModal(false);
      setShowLinkModal({
        email: form.email,
        password: form.password,
        displayName: form.displayName
      });
      loadUsers();
    } catch (err) {
      console.error(err);
      alert('Error al crear usuario: ' + err.message);
    }
    setLoading(false);
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await updateDoc(doc(db, 'users', editUser.id), {
        displayName: form.displayName,
        email: form.email
      });
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
    } catch (e) {
      alert('Error: ' + e.message);
    }
  };

  const confirmDelete = (u) => {
    setDeleteUser(u);
  };

  const handleDelete = async () => {
    if (!deleteUser) return;
    setLoading(true);
    try {
      await deleteDoc(doc(db, 'users', deleteUser.id));
      setDeleteUser(null);
      loadUsers();
    } catch(err) {
      alert("Error: " + err.message);
    }
    setLoading(false);
  };

  const copyLink = (userData) => {
    const link = `${baseUrl}/login?email=${encodeURIComponent(userData.email)}&pwd=${encodeURIComponent(userData.password)}`;
    navigator.clipboard.writeText(link);
    alert('Enlace de acceso copiado al portapapeles');
  };

  const filtered = users.filter(u => 
    u.displayName.toLowerCase().includes(search.toLowerCase()) || 
    u.email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="page-container animate-in">
      <div className="page-header flex justify-between items-center">
        <div>
          <h1 className="page-title">Gestión de Padres de Familia</h1>
          <p className="page-subtitle">{users.length} padres registrados</p>
        </div>
        <button onClick={handleOpenModal} className="btn btn-primary">
          <UserPlus size={16}/> Nuevo Padre
        </button>
      </div>

      <div className="card mb-4 flex gap-4 flex-col md:flex-row">
        <div style={{position:'relative', flex:1}}>
          <Search size={18} style={{position:'absolute',left:14,top:11,color:'var(--gris-500)'}} />
          <input className="form-input" placeholder="Buscar por nombre o correo..." value={search} onChange={e => setSearch(e.target.value)} style={{paddingLeft:40}} />
        </div>
        <div style={{flex:1, display:'flex', alignItems:'center', gap:8}}>
          <span className="form-label" style={{marginBottom:0, whiteSpace:'nowrap'}}>URL Base para enlaces:</span>
          <input className="form-input" value={baseUrl} onChange={e => setBaseUrl(e.target.value)} placeholder="https://tu-dominio.com" />
        </div>
      </div>

      <div className="card">
        {filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">👥</div>
            <p className="empty-state-text">No se encontraron padres de familia</p>
          </div>
        ) : (
          <div className="table-container">
            <table>
              <thead><tr><th>Nombre</th><th>Correo</th><th>Fecha Registro</th><th>Acciones</th></tr></thead>
              <tbody>
                {filtered.map(u => (
                  <tr key={u.id}>
                    <td style={{fontWeight:600}}>{u.displayName}</td>
                    <td>{u.email}</td>
                    <td>{new Date(u.createdAt).toLocaleDateString('es-MX')}</td>
                    <td>
                      <div className="flex gap-2">
                        <button onClick={() => {
                          setEditUser(u);
                          setForm({ displayName: u.displayName, email: u.email, password: '' });
                        }} className="btn btn-sm btn-secondary" title="Editar"><Edit size={14}/></button>
                        <button onClick={() => handleSendReset(u.email)} className="btn btn-sm btn-gold" title="Restablecer Contraseña"><Key size={14}/></button>
                        <button onClick={() => confirmDelete(u)} className="btn btn-sm btn-danger" title="Eliminar"><Trash2 size={14}/></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Nuevo Usuario */}
      {showModal && (
        <div className="modal-overlay" onClick={() => !loading && setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Registrar Padre de Familia</h3>
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
                <p style={{fontSize:'0.75rem', color:'var(--gris-500)', marginTop:4}}>Puedes cambiarla si lo deseas antes de guardar.</p>
              </div>
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
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Editar Padre de Familia</h3>
              <button className="modal-close" onClick={() => !loading && setEditUser(null)}><X size={16}/></button>
            </div>
            <form onSubmit={handleEditSubmit}>
              <div className="form-group">
                <label className="form-label">Nombre Completo</label>
                <input className="form-input" value={form.displayName} onChange={e => setForm({...form, displayName: e.target.value})} required />
              </div>
              <div className="form-group">
                <label className="form-label">Correo Electrónico (Solo referencia)</label>
                <input type="email" className="form-input" value={form.email} onChange={e => setForm({...form, email: e.target.value})} required />
                <p style={{fontSize:'0.75rem', color:'var(--gris-500)', marginTop:4}}>Nota: Cambiar el correo aquí no cambia el inicio de sesión. El usuario debe cambiarlo desde su Perfil.</p>
              </div>
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
              <p>¿Estás seguro de que deseas eliminar a <strong>{deleteUser.displayName}</strong>?</p>
              <p style={{fontSize: '0.85rem', color: 'var(--gris-500)', marginTop: 8}}>Esto no borrará su cuenta de Auth, solo su perfil en la base de datos.</p>
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
            <h3 className="modal-title" style={{marginBottom:8}}>¡Usuario Creado Exitosamente!</h3>
            <p style={{color:'var(--gris-500)', marginBottom:24}}>
              Se ha creado el acceso para <strong>{showLinkModal.displayName}</strong>.
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
