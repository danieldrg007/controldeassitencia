import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { db } from '../firebase';
import {
  collection, query, where, orderBy, onSnapshot,
  getDocs, getDoc, doc, setDoc, addDoc, updateDoc,
} from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { MessageCircle, Send, Plus, Users as UsersIcon, User, X, Search, ArrowLeft, Bell } from 'lucide-react';
import { classLabel, parseClassId, todasLasClases } from '../config/colegio';
import { enablePushNotifications } from '../notifications';

const ROLE_LABEL = { superadmin: 'Administración', admin: 'Administración', teacher: 'Profesor', parent: 'Padre/Tutor', guard: 'Checador', kiosk: 'Kiosko' };
const sanitize = (s) => (s || '').replace(/[^a-zA-Z0-9]/g, '_');
const uniq = (arr) => [...new Set(arr)];

export default function Messages() {
  const { user, userData } = useAuth();
  const location = useLocation();
  const didDeepLink = useRef(false);
  const uid = user?.uid;
  const myRole = typeof userData?.role === 'string' ? userData.role.trim().toLowerCase() : '';
  const myName = userData?.displayName || userData?.email || 'Yo';
  const isStaff = myRole === 'admin' || myRole === 'superadmin';
  const isTeacher = myRole === 'teacher';
  const isParent = myRole === 'parent';

  const [conversations, setConversations] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');

  const [showNew, setShowNew] = useState(false);
  const [contacts, setContacts] = useState([]);
  const [groupOptions, setGroupOptions] = useState([]);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [contactSearch, setContactSearch] = useState('');

  const [showPushBanner, setShowPushBanner] = useState(false);

  const endRef = useRef(null);

  // Registra el token de notificaciones (o muestra banner para activarlas).
  useEffect(() => {
    if (!uid || typeof Notification === 'undefined') return;
    if (Notification.permission === 'granted') enablePushNotifications(uid);
    else if (Notification.permission === 'default') setShowPushBanner(true);
  }, [uid]);

  const enablePush = async () => {
    const res = await enablePushNotifications(uid);
    setShowPushBanner(false);
    if (!res.ok) alert(res.error || 'No se pudieron activar las notificaciones.');
  };

  // ---- Lista de conversaciones (tiempo real) ----
  useEffect(() => {
    if (!uid) return;
    const q = query(collection(db, 'conversations'), where('participants', 'array-contains', uid));
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
      setConversations(list);
    }, (err) => console.error('conversations snapshot', err));
    return unsub;
  }, [uid]);

  // ---- Mensajes de la conversación activa (tiempo real) ----
  useEffect(() => {
    if (!activeId) { setMessages([]); return; }
    const q = query(collection(db, 'conversations', activeId, 'messages'), orderBy('createdAt', 'asc'));
    const unsub = onSnapshot(q, (snap) => {
      setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => console.error('messages snapshot', err));
    return unsub;
  }, [activeId]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const active = useMemo(() => conversations.find(c => c.id === activeId) || null, [conversations, activeId]);

  const convTitle = useCallback((c) => {
    if (!c) return '';
    if (c.type === 'group') return c.title || 'Grupo';
    const other = (c.participants || []).find(p => p !== uid);
    return c.participantNames?.[other] || 'Conversación';
  }, [uid]);

  const convSubtitle = useCallback((c) => {
    if (!c) return '';
    if (c.type === 'group') return 'Canal del grupo';
    const other = (c.participants || []).find(p => p !== uid);
    return ROLE_LABEL[c.participantRoles?.[other]] || '';
  }, [uid]);

  // ¿La conversación tiene mensajes sin leer para mí?
  const isUnread = useCallback((c) => {
    if (!c?.lastMessage || c.lastMessage.senderId === uid) return false;
    const read = c.lastRead?.[uid];
    return !read || c.lastMessage.createdAt > read;
  }, [uid]);

  const markRead = useCallback(async (convId, ts) => {
    try { await updateDoc(doc(db, 'conversations', convId), { [`lastRead.${uid}`]: ts }); } catch { /* noop */ }
  }, [uid]);

  // Marca como leída la conversación abierta cuando llegan/cargan mensajes.
  useEffect(() => {
    if (!activeId || messages.length === 0) return;
    const last = messages[messages.length - 1].createdAt;
    if (active?.lastRead?.[uid] !== last) markRead(activeId, last);
  }, [activeId, messages, active, uid, markRead]);

  // ---- Cargar contactos disponibles según rol ----
  const loadContacts = useCallback(async () => {
    setLoadingContacts(true);
    const direct = [];
    let groups = [];
    // Cada consulta se aísla: si una falla (p. ej. por reglas) las demás igual cargan.
    const safe = async (label, fn) => {
      try { await fn(); }
      catch (e) { console.warn(`Contactos: falló "${label}" →`, e?.code || e?.message || e); }
    };
    if (isStaff) {
      await safe('todos-los-usuarios', async () => {
        const uSnap = await getDocs(collection(db, 'users'));
        uSnap.forEach(d => { if (d.id !== uid) direct.push({ uid: d.id, name: d.data().displayName || d.data().email || 'Usuario', role: d.data().role }); });
      });
      groups = todasLasClases().map(c => ({ id: c.id, label: c.label }));
    } else if (isTeacher) {
      const myClasses = Array.isArray(userData?.classIds) ? userData.classIds : [];
      const parentIds = new Set();
      await safe('alumnos-de-mis-grupos', async () => {
        for (const cid of myClasses) {
          const sSnap = await getDocs(query(collection(db, 'students'), where('classId', '==', cid)));
          sSnap.forEach(d => (d.data().parentIds || []).forEach(p => parentIds.add(p)));
        }
      });
      await safe('tutores', async () => {
        const pDocs = await Promise.all([...parentIds].map(id => getDoc(doc(db, 'users', id))));
        pDocs.forEach(d => { if (d.exists()) direct.push({ uid: d.id, name: d.data().displayName || 'Padre/Tutor', role: 'parent' }); });
      });
      await safe('administracion', async () => {
        const aSnap = await getDocs(query(collection(db, 'users'), where('role', 'in', ['admin', 'superadmin'])));
        aSnap.forEach(d => direct.push({ uid: d.id, name: d.data().displayName || 'Administración', role: d.data().role }));
      });
      groups = myClasses.map(cid => ({ id: cid, label: classLabel(parseClassId(cid)) }));
    } else if (isParent) {
      let classIds = [];
      await safe('mis-hijos', async () => {
        const cSnap = await getDocs(query(collection(db, 'students'), where('parentIds', 'array-contains', uid)));
        classIds = uniq(cSnap.docs.map(d => d.data().classId).filter(Boolean)).slice(0, 10);
      });
      if (classIds.length) {
        await safe('profesores', async () => {
          const tSnap = await getDocs(query(collection(db, 'users'), where('classIds', 'array-contains-any', classIds)));
          tSnap.forEach(d => { if ((d.data().role || '').toLowerCase() === 'teacher') direct.push({ uid: d.id, name: d.data().displayName || 'Profesor', role: 'teacher' }); });
        });
      }
      await safe('administracion', async () => {
        const aSnap = await getDocs(query(collection(db, 'users'), where('role', 'in', ['admin', 'superadmin'])));
        aSnap.forEach(d => direct.push({ uid: d.id, name: d.data().displayName || 'Administración', role: d.data().role }));
      });
    }
    // dedupe por uid
    const seen = new Set();
    setContacts(direct.filter(c => (seen.has(c.uid) ? false : (seen.add(c.uid), true))));
    setGroupOptions(groups);
    setLoadingContacts(false);
  }, [isStaff, isTeacher, isParent, uid, userData]);

  const openNew = () => { setShowNew(true); setContactSearch(''); loadContacts(); };

  // ---- Abrir/crear conversación directa ----
  const openDirect = async (other) => {
    const id = 'dm_' + [uid, other.uid].sort().join('_');
    try {
      await setDoc(doc(db, 'conversations', id), {
        type: 'direct',
        participants: [uid, other.uid],
        participantNames: { [uid]: myName, [other.uid]: other.name },
        participantRoles: { [uid]: myRole, [other.uid]: other.role },
        createdBy: uid,
        updatedAt: new Date().toISOString(),
      }, { merge: true });
      setActiveId(id);
      setShowNew(false);
    } catch (e) { alert('No se pudo abrir la conversación: ' + e.message); }
  };

  // ---- Abrir/crear canal de grupo (solo staff/profesor) ----
  const openGroup = async (classId) => {
    const gid = 'grp_' + sanitize(classId);
    try {
      const sSnap = await getDocs(query(collection(db, 'students'), where('classId', '==', classId)));
      const parentIds = uniq(sSnap.docs.flatMap(d => d.data().parentIds || []));
      const tSnap = await getDocs(query(collection(db, 'users'), where('classIds', 'array-contains', classId)));
      const teacherDocs = tSnap.docs.filter(d => (d.data().role || '').toLowerCase() === 'teacher');

      const names = { [uid]: myName };
      const roles = { [uid]: myRole };
      teacherDocs.forEach(d => { names[d.id] = d.data().displayName || 'Profesor'; roles[d.id] = 'teacher'; });
      const pDocs = await Promise.all(parentIds.map(id => getDoc(doc(db, 'users', id))));
      pDocs.forEach(d => { if (d.exists()) { names[d.id] = d.data().displayName || 'Padre/Tutor'; roles[d.id] = 'parent'; } });

      const memberIds = uniq([uid, ...teacherDocs.map(d => d.id), ...parentIds]);
      await setDoc(doc(db, 'conversations', gid), {
        type: 'group',
        classId,
        title: classLabel(parseClassId(classId)),
        participants: memberIds,
        participantNames: names,
        participantRoles: roles,
        createdBy: uid,
        updatedAt: new Date().toISOString(),
      }, { merge: true });
      setActiveId(gid);
      setShowNew(false);
    } catch (e) { alert('No se pudo abrir el canal del grupo: ' + e.message); }
  };

  // Deep-link: abrir un canal de grupo o una conversación directa al llegar desde otra pantalla.
  useEffect(() => {
    if (didDeepLink.current || !uid) return;
    const st = location.state;
    if (!st) return;
    didDeepLink.current = true;
    if (st.openGroupClassId && (isStaff || isTeacher)) openGroup(st.openGroupClassId);
    else if (st.openDirectUid) openDirect({ uid: st.openDirectUid, name: st.openDirectName, role: st.openDirectRole });
    window.history.replaceState({}, '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state, uid, isStaff, isTeacher]);

  const send = async () => {
    const text = draft.trim();
    if (!text || !activeId) return;
    setDraft('');
    const now = new Date().toISOString();
    try {
      await addDoc(collection(db, 'conversations', activeId, 'messages'), {
        text, senderId: uid, senderName: myName, senderRole: myRole, createdAt: now,
      });
      await updateDoc(doc(db, 'conversations', activeId), {
        lastMessage: { text, senderId: uid, createdAt: now },
        lastSenderName: myName,
        updatedAt: now,
      });
    } catch (e) { alert('No se pudo enviar: ' + e.message); setDraft(text); }
  };

  const filteredContacts = useMemo(() => {
    const q = contactSearch.toLowerCase();
    return contacts.filter(c => c.name.toLowerCase().includes(q));
  }, [contacts, contactSearch]);

  const fmt = (iso) => iso ? new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) : '';

  return (
    <div className="page-container animate-in">
      <div className="page-header">
        <h1 className="page-title">Mensajes</h1>
        <p className="page-subtitle">Comunicación entre profesores, padres y administración</p>
      </div>

      {showPushBanner && (
        <div className="card" style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Bell size={18} color="var(--guinda)" /> Activa las notificaciones para enterarte de los mensajes nuevos.
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={enablePush} className="btn btn-primary btn-sm">Activar</button>
            <button onClick={() => setShowPushBanner(false)} className="btn btn-secondary btn-sm">Ahora no</button>
          </div>
        </div>
      )}

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className={`msg-pane ${activeId ? 'show-chat' : ''}`} style={{ display: 'flex', height: '70vh', minHeight: 420 }}>
          {/* Lista de conversaciones */}
          <div style={{ width: 300, borderRight: '1px solid var(--gris-200)', display: 'flex', flexDirection: 'column' }} className="msg-sidebar">
            <div style={{ padding: 12, borderBottom: '1px solid var(--gris-200)' }}>
              <button onClick={openNew} className="btn btn-primary w-full"><Plus size={16} /> Nueva conversación</button>
            </div>
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {conversations.length === 0 ? (
                <p style={{ padding: 20, color: 'var(--gris-500)', fontSize: '0.85rem', textAlign: 'center' }}>Aún no tienes conversaciones.</p>
              ) : conversations.map(c => {
                const unread = isUnread(c);
                return (
                <button key={c.id} onClick={() => setActiveId(c.id)}
                  style={{
                    width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer',
                    padding: '12px 14px', borderBottom: '1px solid var(--gris-100)',
                    background: c.id === activeId ? 'var(--gris-100)' : 'transparent', display: 'flex', gap: 10, alignItems: 'center',
                  }}>
                  <div style={{ width: 38, height: 38, borderRadius: '50%', background: c.type === 'group' ? 'var(--guinda)' : 'var(--info)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontWeight: 700 }}>
                    {c.type === 'group' ? <UsersIcon size={18} /> : (convTitle(c) || '?').trim().charAt(0).toUpperCase()}
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontWeight: unread ? 800 : 600, fontSize: '0.9rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{convTitle(c)}</div>
                    <div style={{ fontSize: '0.78rem', color: unread ? 'var(--text-main)' : 'var(--gris-500)', fontWeight: unread ? 600 : 400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {c.lastMessage ? `${c.lastMessage.text}` : convSubtitle(c)}
                    </div>
                  </div>
                  {unread && <span style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--brand)', flexShrink: 0 }} />}
                </button>
                );
              })}
            </div>
          </div>

          {/* Panel de mensajes */}
          <div className="msg-chat" style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            {!active ? (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--gris-400)' }}>
                <MessageCircle size={56} />
                <p style={{ marginTop: 12 }}>Selecciona o inicia una conversación</p>
              </div>
            ) : (
              <>
                <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--gris-200)', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <button onClick={() => setActiveId(null)} className="btn btn-icon btn-secondary msg-back" style={{ display: 'none' }}><ArrowLeft size={16} /></button>
                  <div style={{ width: 36, height: 36, borderRadius: '50%', background: active.type === 'group' ? 'var(--guinda)' : 'var(--info)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>
                    {active.type === 'group' ? <UsersIcon size={18} /> : (convTitle(active) || '?').trim().charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div style={{ fontWeight: 700 }}>{convTitle(active)}</div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--gris-500)' }}>
                      {active.type === 'group' ? `${(active.participants || []).length} miembros` : convSubtitle(active)}
                    </div>
                  </div>
                </div>

                <div style={{ flex: 1, overflowY: 'auto', padding: 16, background: 'var(--surface)' }}>
                  {messages.map(m => {
                    const mine = m.senderId === uid;
                    return (
                      <div key={m.id} style={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start', marginBottom: 8 }}>
                        <div style={{ maxWidth: '75%', background: mine ? 'var(--guinda)' : '#fff', color: mine ? '#fff' : 'var(--gris-900)', padding: '8px 12px', borderRadius: mine ? '14px 14px 4px 14px' : '14px 14px 14px 4px', boxShadow: 'var(--shadow-sm)' }}>
                          {!mine && active.type === 'group' && (
                            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--guinda)', marginBottom: 2 }}>{m.senderName}</div>
                          )}
                          <div style={{ fontSize: '0.92rem', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.text}</div>
                          <div style={{ fontSize: '0.68rem', opacity: 0.7, textAlign: 'right', marginTop: 2 }}>{fmt(m.createdAt)}</div>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={endRef} />
                </div>

                <div style={{ padding: 12, borderTop: '1px solid var(--gris-200)', display: 'flex', gap: 8 }}>
                  <input
                    className="form-input"
                    placeholder="Escribe un mensaje..."
                    value={draft}
                    onChange={e => setDraft(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
                    style={{ flex: 1 }}
                  />
                  <button onClick={send} className="btn btn-primary" disabled={!draft.trim()}><Send size={16} /></button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Modal nueva conversación */}
      {showNew && (
        <div className="modal-overlay" onClick={() => setShowNew(false)}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Nueva conversación</h3>
              <button className="modal-close" onClick={() => setShowNew(false)}><X size={16} /></button>
            </div>

            <div style={{ position: 'relative', marginBottom: 16 }}>
              <Search size={18} style={{ position: 'absolute', left: 14, top: 11, color: 'var(--gris-500)' }} />
              <input className="form-input" placeholder="Buscar persona..." value={contactSearch} onChange={e => setContactSearch(e.target.value)} style={{ paddingLeft: 40 }} />
            </div>

            {loadingContacts ? (
              <p style={{ textAlign: 'center', color: 'var(--gris-500)', padding: 20 }}>Cargando contactos...</p>
            ) : (
              <div style={{ maxHeight: 360, overflowY: 'auto' }}>
                {groupOptions.length > 0 && (
                  <>
                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--gris-500)', textTransform: 'uppercase', margin: '4px 0 8px' }}>Canales de grupo</div>
                    {groupOptions.map(g => (
                      <button key={g.id} onClick={() => openGroup(g.id)} className="btn btn-secondary w-full" style={{ justifyContent: 'flex-start', marginBottom: 6 }}>
                        <UsersIcon size={16} /> {g.label}
                      </button>
                    ))}
                  </>
                )}

                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--gris-500)', textTransform: 'uppercase', margin: '12px 0 8px' }}>Personas</div>
                {filteredContacts.length === 0 ? (
                  <p style={{ color: 'var(--gris-500)', fontSize: '0.85rem', textAlign: 'center', padding: 12 }}>No hay contactos disponibles.</p>
                ) : filteredContacts.map(c => (
                  <button key={c.uid} onClick={() => openDirect(c)} className="btn btn-secondary w-full" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><User size={16} /> {c.name}</span>
                    <span className="badge badge-info">{ROLE_LABEL[c.role] || c.role}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
