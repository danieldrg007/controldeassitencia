import { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase';
import { collection, query, where, getDocs, addDoc, updateDoc, deleteDoc, doc, onSnapshot } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { Palette, Plus, X, Trash2, Pencil, Users as UsersIcon, CreditCard, CheckCircle2, Clock, Wallet } from 'lucide-react';
import { NOMBRE_PLANTELES } from '../config/colegio';
import { PAYMENT_STATUS, PAYMENTS_ENABLED, startOnlinePayment, fmtMoney } from '../utils/payments';

const emptyWorkshop = { name: '', description: '', cost: '', capacity: '', schedule: '', plantel: '' };

// Talleres extraescolares con control de inscripción y pago.
// Admin: catálogo + inscripciones + marcar pagado. Padre: inscribe a sus hijos.
export default function Workshops() {
  const { user, userData } = useAuth();
  const role = typeof userData?.role === 'string' ? userData.role.trim().toLowerCase() : '';
  const isAdmin = role === 'admin' || role === 'superadmin';
  const isParent = role === 'parent';

  const [workshops, setWorkshops] = useState([]);
  const [enrollments, setEnrollments] = useState([]); // admin: todas · padre: propias
  const [children, setChildren] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyWorkshop);
  const [enrollTarget, setEnrollTarget] = useState(null); // taller al que se inscribe
  const [detail, setDetail] = useState(null);             // taller cuyo detalle (inscritos) ve admin
  const [saving, setSaving] = useState(false);

  // Catálogo en tiempo real.
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'workshops'), (snap) => {
      const arr = [];
      snap.forEach(d => arr.push({ id: d.id, ...d.data() }));
      arr.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      setWorkshops(arr);
    }, (e) => console.error('workshops', e));
    return unsub;
  }, []);

  // Inscripciones: admin todas, padre solo las suyas.
  useEffect(() => {
    if (!user) return;
    const base = collection(db, 'workshopEnrollments');
    const q = isAdmin ? base : query(base, where('parentId', '==', user.uid));
    const unsub = onSnapshot(q, (snap) => {
      const arr = [];
      snap.forEach(d => arr.push({ id: d.id, ...d.data() }));
      setEnrollments(arr);
    }, (e) => console.error('enrollments', e));
    return unsub;
  }, [user, isAdmin]);

  // Hijos del padre (para inscribir).
  useEffect(() => {
    if (!user || !isParent) return;
    getDocs(query(collection(db, 'students'), where('parentIds', 'array-contains', user.uid))).then(snap => {
      const arr = [];
      snap.forEach(d => arr.push({ id: d.id, ...d.data() }));
      setChildren(arr);
    }).catch(() => {});
  }, [user, isParent]);

  const enrolledByWorkshop = useMemo(() => {
    const map = {};
    enrollments.forEach(e => { (map[e.workshopId] = map[e.workshopId] || []).push(e); });
    return map;
  }, [enrollments]);

  // ---- Admin: CRUD del catálogo ----
  const openCreate = () => { setEditing(null); setForm(emptyWorkshop); setShowForm(true); };
  const openEdit = (w) => {
    setEditing(w);
    setForm({ name: w.name || '', description: w.description || '', cost: String(w.cost ?? ''), capacity: String(w.capacity ?? ''), schedule: w.schedule || '', plantel: w.plantel || '' });
    setShowForm(true);
  };

  const submitWorkshop = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim(),
        cost: Number(form.cost) || 0,
        capacity: Number(form.capacity) || 0,
        schedule: form.schedule.trim(),
        plantel: form.plantel, // '' = todos los planteles
      };
      if (editing) {
        await updateDoc(doc(db, 'workshops', editing.id), payload);
      } else {
        await addDoc(collection(db, 'workshops'), { ...payload, active: true, authorId: user.uid, createdAt: new Date().toISOString() });
      }
      setShowForm(false);
    } catch (err) { alert('Error: ' + err.message); }
    setSaving(false);
  };

  const removeWorkshop = async (w) => {
    const n = (enrolledByWorkshop[w.id] || []).length;
    if (!window.confirm(`¿Eliminar el taller "${w.name}"?${n ? `\n\nTiene ${n} inscripción(es); también se eliminarán.` : ''}`)) return;
    try {
      await Promise.all((enrolledByWorkshop[w.id] || []).map(e => deleteDoc(doc(db, 'workshopEnrollments', e.id))));
      await deleteDoc(doc(db, 'workshops', w.id));
    } catch (err) { alert('Error: ' + err.message); }
  };

  const markPaid = async (enr, method) => {
    try {
      await updateDoc(doc(db, 'workshopEnrollments', enr.id), {
        paymentStatus: 'paid',
        paymentMethod: method,
        paidAt: new Date().toISOString(),
        paidRegisteredBy: userData?.displayName || '',
      });
    } catch (err) { alert('Error: ' + err.message); }
  };

  // ---- Padre: inscripción ----
  const enroll = async (child) => {
    const w = enrollTarget;
    const list = enrolledByWorkshop[w.id] || [];
    if (list.some(e => e.studentId === child.id)) { alert(`${child.name} ya está inscrito(a) en este taller.`); return; }
    if (w.capacity > 0 && list.length >= w.capacity) { alert('Este taller ya está lleno.'); return; }
    setSaving(true);
    try {
      await addDoc(collection(db, 'workshopEnrollments'), {
        workshopId: w.id,
        workshopName: w.name,
        studentId: child.id,
        studentName: `${child.name} ${child.lastName}`,
        parentId: user.uid,
        parentName: userData?.displayName || '',
        cost: w.cost || 0,
        paymentStatus: 'pending',
        paymentMethod: null,
        enrolledAt: new Date().toISOString(),
      });
      setEnrollTarget(null);
    } catch (err) { alert('Error al inscribir: ' + err.message); }
    setSaving(false);
  };

  const cancelEnrollment = async (enr) => {
    if (!window.confirm(`¿Cancelar la inscripción de ${enr.studentName} a ${enr.workshopName}?`)) return;
    try { await deleteDoc(doc(db, 'workshopEnrollments', enr.id)); }
    catch (err) { alert('Error: ' + err.message); }
  };

  const payOnline = async (enr) => {
    try { await startOnlinePayment(enr); }
    catch (err) { alert(err.message); }
  };

  const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }) : '';
  const myEnrollments = isParent ? enrollments : [];

  return (
    <div className="page-container animate-in">
      <div className="page-header flex justify-between items-center">
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Palette size={26} /> Talleres</h1>
          <p className="page-subtitle">{isAdmin ? 'Catálogo de talleres, inscripciones y pagos' : 'Inscribe a tus hijos a los talleres extraescolares'}</p>
        </div>
        {isAdmin && <button onClick={openCreate} className="btn btn-primary"><Plus size={16} /> Nuevo taller</button>}
      </div>

      {/* Mis inscripciones (padre) */}
      {isParent && myEnrollments.length > 0 && (
        <div className="card mb-4">
          <h3 className="card-title" style={{ marginBottom: 12 }}>Mis inscripciones</h3>
          <div className="flex flex-col gap-2">
            {myEnrollments.map(enr => {
              const st = PAYMENT_STATUS[enr.paymentStatus] || PAYMENT_STATUS.pending;
              return (
                <div key={enr.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 'var(--radius-sm)', background: 'var(--surface-hover)', flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 160 }}>
                    <strong style={{ fontSize: '0.92rem' }}>{enr.studentName}</strong>
                    <div style={{ fontSize: '0.8rem', color: 'var(--gris-500)' }}>{enr.workshopName} · {fmtMoney(enr.cost)}</div>
                  </div>
                  <span className={`badge ${st.badge}`}>{st.label}</span>
                  {enr.paymentStatus === 'pending' && (
                    <div style={{ display: 'flex', gap: 6 }}>
                      {PAYMENTS_ENABLED && (
                        <button onClick={() => payOnline(enr)} className="btn btn-sm btn-primary"><CreditCard size={14} /> Pagar en línea</button>
                      )}
                      <button onClick={() => cancelEnrollment(enr)} className="btn btn-sm btn-danger"><Trash2 size={14} /></button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <p style={{ fontSize: '0.78rem', color: 'var(--gris-500)', marginTop: 10 }}>
            💳 Paga en la caja del colegio o por transferencia; administración registrará tu pago.
            {!PAYMENTS_ENABLED && ' El pago en línea estará disponible próximamente.'}
          </p>
        </div>
      )}

      {/* Catálogo */}
      {workshops.length === 0 ? (
        <div className="card"><div className="empty-state"><div className="empty-state-icon">🎨</div><p className="empty-state-text">Aún no hay talleres publicados.</p></div></div>
      ) : (
        <div className="pp-grid">
          {workshops.map(w => {
            const list = enrolledByWorkshop[w.id] || [];
            const full = w.capacity > 0 && list.length >= w.capacity;
            return (
              <div key={w.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div className="flex justify-between items-center" style={{ gap: 8 }}>
                  <h3 style={{ fontWeight: 800, fontSize: '1.05rem' }}>{w.name}</h3>
                  <span className="badge badge-gold">{fmtMoney(w.cost)}</span>
                </div>
                {w.description && <p style={{ fontSize: '0.88rem', color: 'var(--gris-600)', whiteSpace: 'pre-wrap' }}>{w.description}</p>}
                <div style={{ fontSize: '0.8rem', color: 'var(--gris-500)', display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {w.schedule && <span><Clock size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} />{w.schedule}</span>}
                  <span><UsersIcon size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                    {list.length}{w.capacity ? ` / ${w.capacity}` : ''} inscrito(s) {full && <strong style={{ color: 'var(--danger)' }}>· LLENO</strong>}
                  </span>
                  <span>🏫 {w.plantel || 'Todos los planteles'}</span>
                </div>
                <div style={{ marginTop: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap', paddingTop: 8 }}>
                  {isParent && (
                    <button onClick={() => setEnrollTarget(w)} className="btn btn-primary btn-sm" style={{ flex: 1 }} disabled={full || children.length === 0}>
                      <Plus size={14} /> Inscribir
                    </button>
                  )}
                  {isAdmin && (
                    <>
                      <button onClick={() => setDetail(w)} className="btn btn-sm btn-secondary" style={{ flex: 1 }}><UsersIcon size={14} /> Inscritos ({list.length})</button>
                      <button onClick={() => openEdit(w)} className="btn btn-sm btn-secondary"><Pencil size={14} /></button>
                      <button onClick={() => removeWorkshop(w)} className="btn btn-sm btn-danger"><Trash2 size={14} /></button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal crear/editar taller (admin) */}
      {showForm && (
        <div className="modal-overlay" onClick={() => !saving && setShowForm(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">{editing ? 'Editar taller' : 'Nuevo taller'}</h3>
              <button className="modal-close" onClick={() => !saving && setShowForm(false)}><X size={16} /></button>
            </div>
            <form onSubmit={submitWorkshop}>
              <div className="form-group">
                <label className="form-label">Nombre</label>
                <input className="form-input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required placeholder="Ej. Fútbol, Robótica, Ballet" />
              </div>
              <div className="form-group">
                <label className="form-label">Descripción</label>
                <textarea className="form-input" rows={3} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
              </div>
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Costo (MXN)</label>
                  <input type="number" min="0" step="0.01" className="form-input" value={form.cost} onChange={e => setForm({ ...form, cost: e.target.value })} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Cupo (0 = sin límite)</label>
                  <input type="number" min="0" className="form-input" value={form.capacity} onChange={e => setForm({ ...form, capacity: e.target.value })} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Horario (texto)</label>
                <input className="form-input" value={form.schedule} onChange={e => setForm({ ...form, schedule: e.target.value })} placeholder="Ej. Martes y jueves 14:30–16:00" />
              </div>
              <div className="form-group">
                <label className="form-label">Plantel</label>
                <select className="form-select" value={form.plantel} onChange={e => setForm({ ...form, plantel: e.target.value })}>
                  <option value="">Todos los planteles</option>
                  {NOMBRE_PLANTELES.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div className="modal-footer">
                <button type="button" onClick={() => setShowForm(false)} className="btn btn-secondary" disabled={saving}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Guardando…' : (editing ? 'Guardar cambios' : 'Publicar taller')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal inscribir hijo (padre) */}
      {enrollTarget && (
        <div className="modal-overlay" onClick={() => !saving && setEnrollTarget(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Inscribir a {enrollTarget.name}</h3>
              <button className="modal-close" onClick={() => !saving && setEnrollTarget(null)}><X size={16} /></button>
            </div>
            <p style={{ fontSize: '0.88rem', marginBottom: 8 }}>Costo: <strong>{fmtMoney(enrollTarget.cost)}</strong>{enrollTarget.schedule ? ` · ${enrollTarget.schedule}` : ''}</p>
            <p style={{ fontSize: '0.82rem', color: 'var(--gris-500)', marginBottom: 16 }}>¿A quién quieres inscribir?</p>
            <div className="flex flex-col gap-2">
              {children.map(c => {
                const already = (enrolledByWorkshop[enrollTarget.id] || []).some(e => e.studentId === c.id);
                return (
                  <button key={c.id} onClick={() => enroll(c)} className="btn btn-secondary" disabled={saving || already} style={{ justifyContent: 'space-between' }}>
                    <span>{c.name} {c.lastName}</span>
                    {already && <span className="badge badge-success">Ya inscrito</span>}
                  </button>
                );
              })}
            </div>
            <p style={{ fontSize: '0.75rem', color: 'var(--gris-500)', marginTop: 14 }}>
              Al inscribir se genera un cargo <strong>pendiente de pago</strong>. Paga en caja o por transferencia y administración lo confirmará.
            </p>
          </div>
        </div>
      )}

      {/* Modal detalle de inscritos (admin) */}
      {detail && (
        <div className="modal-overlay" onClick={() => setDetail(null)}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">{detail.name} — inscritos</h3>
              <button className="modal-close" onClick={() => setDetail(null)}><X size={16} /></button>
            </div>
            {(enrolledByWorkshop[detail.id] || []).length === 0 ? (
              <div className="empty-state" style={{ padding: 24 }}><p className="empty-state-text">Nadie inscrito todavía.</p></div>
            ) : (
              <div className="flex flex-col gap-2">
                {(enrolledByWorkshop[detail.id] || []).map(enr => {
                  const st = PAYMENT_STATUS[enr.paymentStatus] || PAYMENT_STATUS.pending;
                  return (
                    <div key={enr.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--surface-border)', flexWrap: 'wrap' }}>
                      <div style={{ flex: 1, minWidth: 160 }}>
                        <strong style={{ fontSize: '0.9rem' }}>{enr.studentName}</strong>
                        <div style={{ fontSize: '0.78rem', color: 'var(--gris-500)' }}>
                          Tutor: {enr.parentName || '—'} · inscrito {fmtDate(enr.enrolledAt)} · {fmtMoney(enr.cost)}
                          {enr.paidAt && ` · pagado ${fmtDate(enr.paidAt)}`}
                        </div>
                      </div>
                      <span className={`badge ${st.badge}`}>{st.label}</span>
                      {enr.paymentStatus === 'pending' && (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button onClick={() => markPaid(enr, 'efectivo')} className="btn btn-sm btn-success" title="Marcar pagado en efectivo"><Wallet size={13} /> Efectivo</button>
                          <button onClick={() => markPaid(enr, 'transferencia')} className="btn btn-sm btn-success" title="Marcar pagado por transferencia"><CheckCircle2 size={13} /> Transf.</button>
                          <button onClick={() => cancelEnrollment(enr)} className="btn btn-sm btn-danger" title="Cancelar inscripción"><Trash2 size={13} /></button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
