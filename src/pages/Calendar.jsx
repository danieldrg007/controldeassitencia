import { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase';
import { collection, query, where, getDocs, onSnapshot, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { CalendarDays, Plus, X, ChevronLeft, ChevronRight, Clock, MapPin, Users as UsersIcon, Trash2, Pencil, CalendarPlus, Copy, Check, ExternalLink } from 'lucide-react';
import { NOMBRE_PLANTELES, todasLasClases, classLabel, parseClassId } from '../config/colegio';
import { CATEGORIAS, getCategoria } from '../config/avisos';
import {
  AUDIENCES, AUDIENCE_ORDER, audienceLabels, canSeeEvent,
  MONTHS_ES, WEEKDAYS_ES, buildMonthMatrix, todayStr, fmtEventDate,
  getGoogleCalendarUrl,
} from '../utils/events';

const allClasses = todasLasClases();

export default function Calendar() {
  const { user, userData } = useAuth();
  const role = typeof userData?.role === 'string' ? userData.role.trim().toLowerCase() : '';
  const isAdmin = role === 'admin' || role === 'superadmin';
  const isTeacher = role === 'teacher';
  const canCreate = isAdmin || isTeacher;

  const teacherClasses = useMemo(
    () => (Array.isArray(userData?.classIds) ? userData.classIds : []).map(cid => ({ id: cid, label: classLabel(parseClassId(cid)) })),
    [userData],
  );

  const [events, setEvents] = useState([]);
  const [viewerScope, setViewerScope] = useState({ planteles: [], classIds: [] });
  const today = todayStr();
  const [cursor, setCursor] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; });
  const [selectedDate, setSelectedDate] = useState(today);

  const [showModal, setShowModal] = useState(false);
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const emptyForm = {
    title: '', description: '', date: today, time: '', category: 'evento',
    audiences: ['general'],
    scopeType: isTeacher && !isAdmin ? 'class' : 'all',
    scopeValue: isTeacher && !isAdmin ? (teacherClasses[0]?.id || '') : '',
  };
  const [form, setForm] = useState(emptyForm);

  const handleCopyLink = () => {
    const feedUrl = `${window.location.origin.includes('localhost') ? 'https://mi-app-oliverio.web.app' : window.location.origin}/api/calendarFeed?uid=${user?.uid || ''}`;
    navigator.clipboard.writeText(feedUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Eventos en tiempo real.
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'events'), (snap) => {
      setEvents(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => console.error('events snapshot', err));
    return unsub;
  }, []);

  // Alcance del espectador (para filtrar por plantel/grupo).
  useEffect(() => {
    if (!user) return;
    if (isTeacher) {
      const classIds = Array.isArray(userData?.classIds) ? userData.classIds : [];
      const planteles = [...new Set(classIds.map(c => parseClassId(c).plantel).filter(Boolean))];
      setViewerScope({ planteles, classIds });
    } else if (role === 'parent') {
      (async () => {
        try {
          const snap = await getDocs(query(collection(db, 'students'), where('parentIds', 'array-contains', user.uid)));
          const planteles = new Set(), classIds = new Set();
          snap.forEach(d => { const s = d.data(); if (s.plantel) planteles.add(s.plantel); if (s.classId) classIds.add(s.classId); });
          setViewerScope({ planteles: [...planteles], classIds: [...classIds] });
        } catch (e) { console.error('scope padre', e); }
      })();
    }
  }, [user, role, isTeacher, userData]);

  const viewer = useMemo(() => ({ role, ...viewerScope }), [role, viewerScope]);
  const visibleEvents = useMemo(() => events.filter(e => canSeeEvent(e, viewer)), [events, viewer]);

  // Mapa fecha → eventos (del mes visible y en general).
  const eventsByDate = useMemo(() => {
    const map = {};
    for (const e of visibleEvents) { if (!e.date) continue; (map[e.date] = map[e.date] || []).push(e); }
    return map;
  }, [visibleEvents]);

  const weeks = useMemo(() => buildMonthMatrix(cursor.y, cursor.m), [cursor]);
  const dayEvents = (eventsByDate[selectedDate] || []).slice().sort((a, b) => (a.time || '').localeCompare(b.time || ''));
  const upcoming = useMemo(
    () => visibleEvents.filter(e => e.date >= today).sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || ''))).slice(0, 12),
    [visibleEvents, today],
  );

  const moveMonth = (delta) => setCursor(c => {
    const d = new Date(c.y, c.m + delta, 1);
    return { y: d.getFullYear(), m: d.getMonth() };
  });

  const openCreate = () => {
    setEditing(null);
    setForm({ ...emptyForm, date: selectedDate });
    setShowModal(true);
  };
  const openEdit = (e) => {
    setEditing(e);
    setForm({
      title: e.title || '', description: e.description || '', date: e.date || today, time: e.time || '',
      category: e.category || 'evento', audiences: e.audiences?.length ? e.audiences : ['general'],
      scopeType: e.scope?.type || 'all', scopeValue: e.scope?.type === 'all' ? '' : (e.scope?.value || ''),
    });
    setShowModal(true);
  };

  const toggleAudience = (a) => setForm(f => ({ ...f, audiences: f.audiences.includes(a) ? f.audiences.filter(x => x !== a) : [...f.audiences, a] }));

  const scopeLabelOf = (type, value) => type === 'all' ? 'Todo el colegio' : type === 'plantel' ? value : (classLabel(parseClassId(value)) || value);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) { alert('Escribe un título'); return; }
    if (!form.audiences.length) { alert('Elige al menos un público'); return; }
    const scopeType = isTeacher && !isAdmin ? 'class' : form.scopeType;
    const scopeValue = scopeType === 'all' ? 'all' : form.scopeValue;
    if (scopeType !== 'all' && !scopeValue) { alert('Selecciona el destino (plantel o grupo)'); return; }

    setSaving(true);
    try {
      const id = editing?.id || doc(collection(db, 'events')).id;
      await setDoc(doc(db, 'events', id), {
        title: form.title.trim(),
        description: form.description.trim(),
        date: form.date,
        time: form.time || '',
        category: form.category,
        audiences: form.audiences,
        scope: { type: scopeType, value: scopeValue },
        scopeLabel: scopeLabelOf(scopeType, scopeValue),
        authorId: editing?.authorId || user.uid,
        authorName: userData?.displayName || (isTeacher ? 'Profesor' : 'Administración'),
        authorRole: role,
        createdAt: editing?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }, { merge: true });
      setShowModal(false);
      setSelectedDate(form.date);
      setCursor({ y: Number(form.date.slice(0, 4)), m: Number(form.date.slice(5, 7)) - 1 });
    } catch (err) { alert('Error: ' + err.message); }
    setSaving(false);
  };

  const remove = async (ev) => {
    if (!confirm('¿Eliminar este evento?')) return;
    try { await deleteDoc(doc(db, 'events', ev.id)); } catch (err) { alert('Error: ' + err.message); }
  };

  const canEdit = (ev) => isAdmin || (isTeacher && ev.authorId === user.uid);

  const EventRow = ({ ev }) => {
    const cat = getCategoria(ev.category);
    const CatIcon = cat.icon;
    return (
      <div style={{ display: 'flex', gap: 12, padding: '12px 0', borderBottom: '1px solid var(--surface-border)' }}>
        <div style={{ width: 4, borderRadius: 4, background: cat.color, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.72rem', fontWeight: 700, padding: '2px 8px', borderRadius: 999, color: cat.color, background: `${cat.color}1A` }}>
              <CatIcon size={12} /> {cat.label}
            </span>
            {ev.time && <span style={{ fontSize: '0.78rem', color: 'var(--gris-500)', display: 'inline-flex', alignItems: 'center', gap: 3 }}><Clock size={12} /> {ev.time}</span>}
          </div>
          <div style={{ fontWeight: 700, marginTop: 4 }}>{ev.title}</div>
          {ev.description && <p style={{ fontSize: '0.88rem', color: 'var(--gris-700)', whiteSpace: 'pre-wrap', marginTop: 2 }}>{ev.description}</p>}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 6, fontSize: '0.74rem', color: 'var(--gris-500)' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><UsersIcon size={12} /> {audienceLabels(ev.audiences)}</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><MapPin size={12} /> {ev.scopeLabel || 'Todo el colegio'}</span>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, justifyContent: 'flex-start' }}>
          <a
            href={getGoogleCalendarUrl(ev)}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-sm btn-secondary"
            title="Agregar a Google Calendar"
            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '6px' }}
          >
            <CalendarPlus size={14} />
          </a>
          {canEdit(ev) && (
            <>
              <button onClick={() => openEdit(ev)} className="btn btn-sm btn-secondary"><Pencil size={13} /></button>
              <button onClick={() => remove(ev)} className="btn btn-sm btn-danger"><Trash2 size={13} /></button>
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="page-container animate-in">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}><CalendarDays size={24} /> Calendario</h1>
          <p className="page-subtitle">Eventos y fechas importantes del colegio</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={() => setShowSyncModal(true)} className="btn btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <ExternalLink size={16} /> Sincronizar Calendario
          </button>
          {canCreate && <button onClick={openCreate} className="btn btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Plus size={16} /> Nuevo evento</button>}
        </div>
      </div>

      <div className="cal-layout">
        {/* Calendario mensual */}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <button onClick={() => moveMonth(-1)} className="btn btn-icon btn-secondary"><ChevronLeft size={18} /></button>
            <strong style={{ fontSize: '1.05rem' }}>{MONTHS_ES[cursor.m]} {cursor.y}</strong>
            <button onClick={() => moveMonth(1)} className="btn btn-icon btn-secondary"><ChevronRight size={18} /></button>
          </div>

          <div className="cal-grid cal-weekdays">
            {WEEKDAYS_ES.map((d, i) => <div key={i} className="cal-weekday">{d}</div>)}
          </div>
          {weeks.map((week, wi) => (
            <div key={wi} className="cal-grid">
              {week.map((cell, ci) => {
                if (!cell) return <div key={ci} className="cal-cell cal-empty" />;
                const evs = eventsByDate[cell.dateStr] || [];
                const isToday = cell.dateStr === today;
                const isSel = cell.dateStr === selectedDate;
                return (
                  <button key={ci} onClick={() => setSelectedDate(cell.dateStr)}
                    className={`cal-cell ${isSel ? 'cal-sel' : ''} ${isToday ? 'cal-today' : ''}`}>
                    <span className="cal-daynum">{cell.day}</span>
                    {evs.length > 0 && (
                      <span className="cal-dots">
                        {evs.slice(0, 3).map((e, i) => <span key={i} className="cal-dot" style={{ background: getCategoria(e.category).color }} />)}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* Eventos del día seleccionado + próximos */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card">
            <h3 className="card-title" style={{ marginBottom: 8, textTransform: 'capitalize' }}>{fmtEventDate(selectedDate, true)}</h3>
            {dayEvents.length === 0 ? (
              <p style={{ color: 'var(--gris-500)', fontSize: '0.9rem', padding: '8px 0' }}>Sin eventos este día.</p>
            ) : dayEvents.map(ev => <EventRow key={ev.id} ev={ev} />)}
          </div>

          <div className="card">
            <h3 className="card-title" style={{ marginBottom: 8 }}>Próximos eventos</h3>
            {upcoming.length === 0 ? (
              <div className="empty-state" style={{ padding: 20 }}><div className="empty-state-icon">📅</div><p className="empty-state-text">No hay eventos próximos.</p></div>
            ) : upcoming.map(ev => (
              <button key={ev.id} onClick={() => { setSelectedDate(ev.date); setCursor({ y: Number(ev.date.slice(0, 4)), m: Number(ev.date.slice(5, 7)) - 1 }); }}
                style={{ width: '100%', textAlign: 'left', border: 0, background: 'transparent', cursor: 'pointer', display: 'flex', gap: 10, alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--surface-border)' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: getCategoria(ev.category).color, flexShrink: 0 }} />
                <span style={{ fontSize: '0.78rem', color: 'var(--gris-500)', minWidth: 64, textTransform: 'capitalize' }}>{fmtEventDate(ev.date)}</span>
                <span style={{ fontWeight: 600, fontSize: '0.9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.title}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Modal crear/editar */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">{editing ? 'Editar evento' : 'Nuevo evento'}</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}><X size={16} /></button>
            </div>
            <form onSubmit={submit}>
              <div className="form-group">
                <label className="form-label">Título</label>
                <input className="form-input" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} required placeholder="Ej. Junta de padres" />
              </div>
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Fecha</label>
                  <input type="date" className="form-input" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Hora (opcional)</label>
                  <input type="time" className="form-input" value={form.time} onChange={e => setForm({ ...form, time: e.target.value })} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Categoría</label>
                <select className="form-select" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
                  {Object.entries(CATEGORIAS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Descripción (opcional)</label>
                <textarea className="form-input" rows={3} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
              </div>

              <div className="form-group">
                <label className="form-label">¿Para quién? (público)</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {AUDIENCE_ORDER.map(a => {
                    const on = form.audiences.includes(a);
                    return (
                      <button type="button" key={a} onClick={() => toggleAudience(a)}
                        className={`btn btn-sm ${on ? 'btn-primary' : 'btn-secondary'}`}>
                        {AUDIENCES[a].emoji} {AUDIENCES[a].label}
                      </button>
                    );
                  })}
                </div>
                <p style={{ fontSize: '0.72rem', color: 'var(--gris-500)', marginTop: 6 }}>Solo el público elegido verá el evento. "Alumnos" lo ven sus padres.</p>
              </div>

              {isAdmin ? (
                <>
                  <div className="form-group">
                    <label className="form-label">Destino</label>
                    <select className="form-select" value={form.scopeType} onChange={e => setForm({ ...form, scopeType: e.target.value, scopeValue: '' })}>
                      <option value="all">Todo el colegio</option>
                      <option value="plantel">Un plantel</option>
                      <option value="class">Un grupo</option>
                    </select>
                  </div>
                  {form.scopeType === 'plantel' && (
                    <div className="form-group">
                      <label className="form-label">Plantel</label>
                      <select className="form-select" value={form.scopeValue} onChange={e => setForm({ ...form, scopeValue: e.target.value })} required>
                        <option value="">Seleccionar...</option>
                        {NOMBRE_PLANTELES.map(p => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </div>
                  )}
                  {form.scopeType === 'class' && (
                    <div className="form-group">
                      <label className="form-label">Grupo</label>
                      <select className="form-select" value={form.scopeValue} onChange={e => setForm({ ...form, scopeValue: e.target.value })} required>
                        <option value="">Seleccionar...</option>
                        {allClasses.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                      </select>
                    </div>
                  )}
                </>
              ) : (
                <div className="form-group">
                  <label className="form-label">Grupo (destino)</label>
                  <select className="form-select" value={form.scopeValue} onChange={e => setForm({ ...form, scopeValue: e.target.value })} required>
                    {teacherClasses.length === 0 && <option value="">No tienes grupos asignados</option>}
                    {teacherClasses.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                </div>
              )}

              <button type="submit" className="btn btn-primary w-full" disabled={saving} style={{ marginTop: 8 }}>
                {saving ? 'Guardando...' : (editing ? 'Guardar cambios' : 'Crear evento')}
              </button>
            </form>
          </div>
        </div>
      )}
      {/* Modal sincronización */}
      {showSyncModal && (
        <div className="modal-overlay" onClick={() => setShowSyncModal(false)}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px' }}>
            <div className="modal-header">
              <h3 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}><ExternalLink size={20} /> Sincronizar</h3>
              <button className="modal-close" onClick={() => setShowSyncModal(false)}><X size={16} /></button>
            </div>
            <div style={{ padding: '16px 0 0 0' }}>
              <p style={{ fontSize: '0.9rem', color: 'var(--gris-700)', marginBottom: 16 }}>
                Sincroniza automáticamente los eventos en tu calendario de <strong>Google Calendar</strong>, <strong>Apple Calendar</strong> o <strong>Outlook</strong>.
              </p>

              <div className="form-group">
                <label className="form-label">Tu enlace de suscripción único</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="text"
                    className="form-input"
                    readOnly
                    value={`${window.location.origin.includes('localhost') ? 'https://mi-app-oliverio.web.app' : window.location.origin}/api/calendarFeed?uid=${user?.uid || ''}`}
                    style={{ background: 'var(--gris-100)', color: 'var(--gris-700)', fontSize: '0.82rem', flex: 1 }}
                    onClick={e => e.target.select()}
                  />
                  <button onClick={handleCopyLink} className="btn btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, minWidth: '90px', justifyContent: 'center' }}>
                    {copied ? <><Check size={14} /> Copiado</> : <><Copy size={14} /> Copiar</>}
                  </button>
                </div>
              </div>

              <div style={{ borderTop: '1px solid var(--surface-border)', paddingTop: 14, marginTop: 14 }}>
                <h4 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: 8 }}>¿Cómo agregarlo en Google Calendar?</h4>
                <ol style={{ fontSize: '0.82rem', color: 'var(--gris-600)', paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <li>Copia el enlace de arriba usando el botón <strong>Copiar</strong>.</li>
                  <li>Abre <a href="https://calendar.google.com" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-primary)', textDecoration: 'underline' }}>Google Calendar</a> en web.</li>
                  <li>En la izquierda, al lado de <strong>"Otros calendarios"</strong>, da clic en el <strong>"+"</strong>.</li>
                  <li>Selecciona la opción <strong>"Desde URL"</strong>.</li>
                  <li>Pega el enlace copiado y da clic en <strong>"Añadir calendario"</strong>.</li>
                </ol>
                <p style={{ fontSize: '0.74rem', color: 'var(--gris-500)', marginTop: 10, fontStyle: 'italic' }}>
                  Nota: Google Calendar actualiza las suscripciones de forma automática cada ciertas horas.
                </p>
              </div>

              <button onClick={() => setShowSyncModal(false)} className="btn btn-secondary w-full" style={{ marginTop: 18 }}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
