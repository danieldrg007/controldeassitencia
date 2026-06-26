import { useState, useEffect, useRef } from 'react';
import { db } from '../firebase';
import { collection, query, where, getDocs, getDoc, addDoc, updateDoc, doc } from 'firebase/firestore';
import { Html5Qrcode } from 'html5-qrcode';
import { useAuth } from '../context/AuthContext';
import { ScanLine, Camera, CheckCircle, XCircle, RotateCcw, LogIn, LogOut, IdCard, User } from 'lucide-react';

export default function Scanner() {
  const { user } = useAuth();
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [pendingExit, setPendingExit] = useState(null); // { student, recordId }
  const [authorized, setAuthorized] = useState([]);
  const [loadingPeople, setLoadingPeople] = useState(false);
  const [groupPickup, setGroupPickup] = useState(null); // { person, code, items }
  const [groupLoading, setGroupLoading] = useState(false);
  const [zoom, setZoom] = useState(null); // foto ampliada para verificar identidad

  const html5QrRef = useRef(null);
  const scanModeRef = useRef('student'); // 'student' | 'pass'
  const today = new Date().toISOString().split('T')[0];

  const startScanner = (mode = 'student') => {
    scanModeRef.current = mode;
    setResult(null);
    setError('');
    setScanning(true);
  };

  useEffect(() => {
    let scanner = null;
    const init = async () => {
      if (scanning && !html5QrRef.current) {
        try {
          await new Promise(r => setTimeout(r, 100));
          scanner = new Html5Qrcode('qr-reader');
          html5QrRef.current = scanner;
          await scanner.start(
            { facingMode: 'environment' },
            { fps: 10, qrbox: { width: 250, height: 250 } },
            onScanSuccess,
            () => {}
          );
        } catch (err) {
          console.error('Camera Access Error:', err);
          let msg = 'No se pudo acceder a la cámara.';
          if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') {
            msg += ' El navegador requiere HTTPS para activar la cámara.';
          } else {
            msg += ' Verifica los permisos o si otra app la está usando. Error: ' + (err.message || err);
          }
          setError(msg);
          setScanning(false);
        }
      }
    };
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanning]);

  const stopScanner = async () => {
    if (html5QrRef.current) {
      try {
        await html5QrRef.current.stop();
        html5QrRef.current.clear();
      } catch (e) { /* noop */ }
      html5QrRef.current = null;
    }
    setScanning(false);
  };

  const onScanSuccess = async (decodedText) => {
    await stopScanner();
    if (scanModeRef.current === 'pass') {
      handlePassScan(decodedText);
    } else if (scanModeRef.current === 'pickupGroup') {
      handleGroupCode(decodedText);
    } else {
      await processStudent(decodedText);
    }
  };

  // ---- Recogida grupal con pase temporal ----
  const handleGroupCode = async (code) => {
    setGroupLoading(true);
    setError('');
    try {
      const codeUp = (code || '').trim().toUpperCase();
      const studentIds = new Set();
      const authBy = {};
      let personName = '';

      // Autorizaciones temporales válidas hoy.
      const aSnap = await getDocs(query(collection(db, 'pickupAuthorizations'), where('pickupCode', '==', codeUp)));
      aSnap.forEach(d => {
        const a = d.data();
        if (a.validDate === today && a.status === 'active') {
          studentIds.add(a.studentId);
          authBy[a.studentId] = a.authorizedByName || 'Su tutor';
          if (!personName) personName = a.pickupName || '';
        }
      });

      // Si el código pertenece a un padre registrado, incluir a sus propios hijos.
      const uSnap = await getDocs(query(collection(db, 'users'), where('pickupCode', '==', codeUp)));
      if (!uSnap.empty) {
        const owner = uSnap.docs[0];
        if (!personName) personName = owner.data().displayName || 'Persona con pase';
        const sSnap = await getDocs(query(collection(db, 'students'), where('parentIds', 'array-contains', owner.id)));
        sSnap.forEach(d => { studentIds.add(d.id); if (!authBy[d.id]) authBy[d.id] = 'Titular'; });
      }

      if (studentIds.size === 0) {
        setError('Ese código no tiene recogidas autorizadas para hoy.');
        setGroupLoading(false);
        return;
      }

      const items = [];
      for (const sid of studentIds) {
        const sDoc = await getDoc(doc(db, 'students', sid));
        if (!sDoc.exists()) continue;
        const student = { id: sDoc.id, ...sDoc.data() };
        const rsnap = await getDocs(query(collection(db, 'attendance', today, 'records'), where('studentId', '==', sid)));
        const rec = rsnap.empty ? null : { id: rsnap.docs[0].id, ...rsnap.docs[0].data() };
        const inSchool = !!(rec && rec.entryTime && !rec.exitTime);
        items.push({
          student, recordId: rec?.id || null, authorizedBy: authBy[sid],
          inSchool, alreadyOut: !!(rec && rec.exitTime), noEntry: !rec, checked: inSchool,
        });
      }
      items.sort((a, b) => `${a.student.lastName}`.localeCompare(`${b.student.lastName}`));
      setGroupPickup({ person: personName || 'Persona con pase', code: codeUp, items });
    } catch (e) {
      console.error(e);
      setError('Error al leer el pase: ' + e.message);
    }
    setGroupLoading(false);
  };

  const toggleGroupItem = (sid) =>
    setGroupPickup(g => ({ ...g, items: g.items.map(it => it.student.id === sid && it.inSchool ? { ...it, checked: !it.checked } : it) }));

  const confirmGroupExit = async () => {
    const chosen = groupPickup.items.filter(it => it.checked && it.inSchool && it.recordId);
    if (chosen.length === 0) { setError('Selecciona al menos un alumno que esté en el colegio.'); return; }
    setGroupLoading(true);
    const now = new Date().toISOString();
    try {
      for (const it of chosen) {
        await updateDoc(doc(db, 'attendance', today, 'records', it.recordId), {
          exitTime: now, exitMethod: 'pase-temporal',
          pickedUpById: groupPickup.code, pickedUpByName: groupPickup.person, pickedUpByRelation: 'Pase temporal',
        });
        await sendNotification(it.student, 'exit', now, { name: groupPickup.person, relation: 'Pase temporal' });
      }
      setResult({ type: 'group', count: chosen.length, person: groupPickup.person, time: now });
      setGroupPickup(null);
    } catch (e) { setError('Error al registrar salidas: ' + e.message); }
    setGroupLoading(false);
  };

  const cancelGroup = () => { setGroupPickup(null); setError(''); };

  // Carga las personas autorizadas (grupo familiar de los padres + titulares).
  const loadAuthorized = async (student) => {
    setLoadingPeople(true);
    const people = [];
    try {
      for (const parentId of (student.parentIds || [])) {
        const pSnap = await getDoc(doc(db, 'users', parentId));
        if (pSnap.exists()) {
          people.push({ id: `parent-${parentId}`, name: pSnap.data().displayName || 'Padre/Tutor', relation: 'Titular', passCode: null, photo: pSnap.data().photo || null });
        }
        const fSnap = await getDocs(collection(db, 'users', parentId, 'familyMembers'));
        fSnap.forEach(d => {
          const m = d.data();
          if (m.active !== false) people.push({ id: d.id, name: m.name, relation: m.relation, passCode: m.passCode || null, photo: m.photo || null });
        });
      }
    } catch (e) { console.error('Error cargando autorizados', e); }
    setAuthorized(people);
    setLoadingPeople(false);
  };

  const processStudent = async (qrCode) => {
    try {
      const snap = await getDocs(query(collection(db, 'students'), where('qrCode', '==', qrCode)));
      if (snap.empty) { setError('Código QR no reconocido. No se encontró alumno.'); return; }

      const studentDoc = snap.docs[0];
      const student = { id: studentDoc.id, ...studentDoc.data() };
      const recordsRef = collection(db, 'attendance', today, 'records');
      const rsnap = await getDocs(query(recordsRef, where('studentId', '==', student.id)));
      const now = new Date().toISOString();

      if (rsnap.empty) {
        await addDoc(recordsRef, {
          studentId: student.id,
          studentName: `${student.name} ${student.lastName}`,
          entryTime: now, exitTime: null,
          entryMethod: 'qr', exitMethod: null,
          guardId: user.uid,
        });
        setResult({ type: 'entry', student, time: now });
        await sendNotification(student, 'entry', now);
      } else {
        const record = rsnap.docs[0];
        if (!record.data().exitTime) {
          // Salida: pedir quién recoge antes de registrar.
          setPendingExit({ student, recordId: record.id });
          loadAuthorized(student);
        } else {
          setResult({ type: 'already', student, time: now });
        }
      }
    } catch (err) {
      console.error(err);
      setError('Error al procesar el registro: ' + err.message);
    }
  };

  const handlePassScan = (passCode) => {
    const match = authorized.find(p => p.passCode && p.passCode === passCode);
    if (match) {
      confirmExit(match);
    } else {
      setError('Pase no reconocido o no autorizado para este alumno.');
    }
  };

  const confirmExit = async (person) => {
    if (!pendingExit) return;
    const { student, recordId } = pendingExit;
    const now = new Date().toISOString();
    try {
      await updateDoc(doc(db, 'attendance', today, 'records', recordId), {
        exitTime: now,
        exitMethod: 'qr',
        pickedUpById: person?.id || null,
        pickedUpByName: person?.name || 'No registrado',
        pickedUpByRelation: person?.relation || '',
      });
      setResult({ type: 'exit', student, time: now, pickedUpBy: person });
      await sendNotification(student, 'exit', now, person);
    } catch (err) {
      setError('Error al registrar la salida: ' + err.message);
    }
    setPendingExit(null);
    setAuthorized([]);
  };

  const cancelExit = () => { setPendingExit(null); setAuthorized([]); };

  const sendNotification = async (student, type, time, person = null) => {
    try {
      const formattedTime = new Date(time).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
      let message = type === 'entry'
        ? `Tu hijo/a ${student.name} ${student.lastName} acaba de ENTRAR al colegio a las ${formattedTime}`
        : `Tu hijo/a ${student.name} ${student.lastName} acaba de SALIR del colegio a las ${formattedTime}`;
      if (type === 'exit' && person) message += ` · Recogido por ${person.name} (${person.relation})`;

      for (const parentId of (student.parentIds || [])) {
        await addDoc(collection(db, 'notifications'), {
          parentId, studentId: student.id, type, message, time,
          read: false, createdAt: new Date().toISOString(),
        });
      }
    } catch (e) { console.error('Notification error:', e); }
  };

  const formatTime = (iso) => new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  useEffect(() => () => { stopScanner(); }, []);

  return (
    <div className="page-container animate-in">
      <div className="page-header" style={{textAlign:'center'}}>
        <h1 className="page-title">Escáner de Acceso</h1>
        <p className="page-subtitle">Escanea el código QR del alumno</p>
      </div>

      <div style={{maxWidth:520, margin:'0 auto'}}>
        {!scanning && !result && !pendingExit && !groupPickup && (
          <div className="card" style={{textAlign:'center', padding:'48px 24px'}}>
            <div style={{width:100,height:100,borderRadius:'50%',background:'linear-gradient(135deg,var(--guinda),var(--guinda-dark))',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 24px'}}>
              <ScanLine size={48} color="#fff" />
            </div>
            <h2 style={{fontSize:'1.25rem',fontWeight:700,marginBottom:8}}>Listo para escanear</h2>
            <p style={{color:'var(--gris-500)',marginBottom:24}}>Escanea el QR del alumno, o usa un pase de recogida para salidas en grupo</p>
            <div className="flex flex-col gap-2" style={{maxWidth:300, margin:'0 auto'}}>
              <button onClick={() => startScanner('student')} className="btn btn-primary btn-lg">
                <Camera size={20} /> Escanear alumno
              </button>
              <button onClick={() => startScanner('pickupGroup')} className="btn btn-gold btn-lg" disabled={groupLoading}>
                <IdCard size={20} /> Recogida con pase
              </button>
            </div>
          </div>
        )}

        {groupLoading && !groupPickup && (
          <div className="card" style={{textAlign:'center', padding:32}}>
            <p style={{color:'var(--gris-500)'}}>Leyendo pase de recogida...</p>
          </div>
        )}

        {scanning && (
          <div className="card" style={{padding:0, overflow:'hidden'}}>
            {scanModeRef.current === 'pass' && (
              <div style={{padding:'12px 16px', background:'var(--info-bg)', color:'var(--info)', fontWeight:600, textAlign:'center'}}>
                Escanea el pase de quien recoge
              </div>
            )}
            {scanModeRef.current === 'pickupGroup' && (
              <div style={{padding:'12px 16px', background:'var(--warning-bg)', color:'#8B6F2F', fontWeight:600, textAlign:'center'}}>
                Escanea el código de recogida (QR)
              </div>
            )}
            <div id="qr-reader" style={{width:'100%'}}></div>
            <div style={{padding:16, textAlign:'center'}}>
              <button onClick={() => { stopScanner(); if (scanModeRef.current === 'pass') { /* volver a selección */ } }} className="btn btn-danger">
                <XCircle size={16} /> Detener
              </button>
            </div>
          </div>
        )}

        {/* Selección de quién recoge (salida) */}
        {pendingExit && !scanning && (
          <div className="card">
            <div style={{textAlign:'center', marginBottom:16}}>
              <LogOut size={40} color="var(--info)" style={{margin:'0 auto 8px'}} />
              <h2 style={{fontSize:'1.25rem', fontWeight:800}}>¿Quién recoge a {pendingExit.student.name}?</h2>
              <p style={{color:'var(--gris-500)', fontSize:'0.85rem'}}>{pendingExit.student.lastName} · {pendingExit.student.grado} {pendingExit.student.nivel} {pendingExit.student.grupo}</p>
            </div>

            <button onClick={() => startScanner('pass')} className="btn btn-secondary w-full" style={{marginBottom:16}}>
              <IdCard size={16}/> Escanear pase QR
            </button>

            {error && (
              <p className="badge badge-danger" style={{display:'block', textAlign:'center', marginBottom:12, padding:8}}>{error}</p>
            )}

            {loadingPeople ? (
              <p style={{textAlign:'center', color:'var(--gris-500)'}}>Cargando personas autorizadas...</p>
            ) : (
              <div className="flex flex-col gap-2">
                {authorized.length === 0 && (
                  <p style={{textAlign:'center', color:'var(--gris-500)', fontSize:'0.85rem'}}>Sin personas autorizadas registradas.</p>
                )}
                {authorized.map(p => (
                  <button key={p.id} onClick={() => confirmExit(p)}
                    className="btn btn-secondary" style={{justifyContent:'space-between'}}>
                    <span style={{display:'flex', alignItems:'center', gap:10}}>
                      {p.photo ? (
                        <img src={p.photo} alt="" onClick={(e) => { e.stopPropagation(); setZoom(p.photo); }}
                          style={{width:40, height:40, borderRadius:'50%', objectFit:'cover', border:'2px solid var(--gris-200)'}} />
                      ) : (
                        <span style={{width:40, height:40, borderRadius:'50%', background:'var(--gris-200)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0}}><User size={18}/></span>
                      )}
                      {p.name}
                    </span>
                    <span className="badge badge-gold">{p.relation}</span>
                  </button>
                ))}
              </div>
            )}

            <div style={{display:'flex', gap:8, marginTop:16}}>
              <button onClick={() => confirmExit(null)} className="btn btn-gold" style={{flex:1}}>Registrar sin especificar</button>
              <button onClick={cancelExit} className="btn btn-secondary">Cancelar</button>
            </div>
          </div>
        )}

        {/* Recogida grupal: selección de alumnos autorizados por el pase */}
        {groupPickup && (
          <div className="card">
            <div style={{textAlign:'center', marginBottom:16}}>
              <IdCard size={40} color="var(--guinda)" style={{margin:'0 auto 8px'}} />
              <h2 style={{fontSize:'1.25rem', fontWeight:800}}>Recogida de {groupPickup.person}</h2>
              <p style={{color:'var(--gris-500)', fontSize:'0.85rem'}}>Pase <code style={{fontWeight:700, color:'var(--guinda)'}}>{groupPickup.code}</code> · selecciona a quién entregar</p>
            </div>

            {error && <p className="badge badge-danger" style={{display:'block', textAlign:'center', marginBottom:12, padding:8}}>{error}</p>}

            <div className="flex flex-col gap-2">
              {groupPickup.items.map(it => {
                const s = it.student;
                const estado = it.inSchool ? null : it.alreadyOut ? 'Ya salió' : 'Sin entrada hoy';
                return (
                  <button key={s.id} type="button" onClick={() => toggleGroupItem(s.id)} disabled={!it.inSchool}
                    style={{
                      display:'flex', alignItems:'center', justifyContent:'space-between', gap:8, textAlign:'left',
                      padding:12, borderRadius:'var(--radius-sm)', cursor: it.inSchool ? 'pointer' : 'not-allowed',
                      border:`1.5px solid ${it.checked ? 'var(--guinda)' : 'var(--gris-200)'}`,
                      background: it.checked ? 'rgba(155,36,62,0.06)' : (it.inSchool ? '#fff' : 'var(--gris-100)'),
                      opacity: it.inSchool ? 1 : 0.6,
                    }}>
                    <div>
                      <div style={{fontWeight:700}}>{it.inSchool ? (it.checked ? '☑ ' : '☐ ') : ''}{s.lastName} {s.name}</div>
                      <div style={{fontSize:'0.78rem', color:'var(--gris-500)'}}>{s.grado} {s.nivel} {s.grupo} · autoriza: {it.authorizedBy}</div>
                    </div>
                    {estado && <span className="badge badge-warning">{estado}</span>}
                  </button>
                );
              })}
            </div>

            <div style={{display:'flex', gap:8, marginTop:16}}>
              <button onClick={confirmGroupExit} className="btn btn-primary" style={{flex:1}} disabled={groupLoading}>
                {groupLoading ? 'Registrando...' : `Registrar salida (${groupPickup.items.filter(i => i.checked && i.inSchool).length})`}
              </button>
              <button onClick={cancelGroup} className="btn btn-secondary" disabled={groupLoading}>Cancelar</button>
            </div>
          </div>
        )}

        {error && !pendingExit && !groupPickup && (
          <div className="card" style={{textAlign:'center', padding:32, marginTop:16}}>
            <XCircle size={48} color="var(--danger)" style={{margin:'0 auto 12px'}} />
            <p style={{color:'var(--danger)', fontWeight:600, marginBottom:16}}>{error}</p>
            <button onClick={() => { setError(''); startScanner('student'); }} className="btn btn-primary">
              <RotateCcw size={16} /> Reintentar
            </button>
          </div>
        )}

        {result && result.type === 'group' && (
          <div className="scan-result exit" style={{marginTop:16}}>
            <LogOut size={56} color="var(--info)" style={{margin:'0 auto 12px'}} />
            <h2 style={{fontSize:'1.5rem', fontWeight:800, marginBottom:4}}>🔵 {result.count} salida(s) registrada(s)</h2>
            <p style={{fontSize:'1.1rem', fontWeight:600}}>Recogidos por {result.person}</p>
            <p style={{color:'var(--gris-500)'}}>{formatTime(result.time)}</p>
            <div style={{marginTop:24, display:'flex', gap:8, justifyContent:'center'}}>
              <button onClick={() => { setResult(null); startScanner('pickupGroup'); }} className="btn btn-gold">
                <IdCard size={16} /> Otro pase
              </button>
              <button onClick={() => setResult(null)} className="btn btn-secondary">Cerrar</button>
            </div>
          </div>
        )}

        {result && result.type !== 'group' && (
          <div className={`scan-result ${result.type === 'entry' ? 'entry' : 'exit'}`} style={{marginTop:16}}>
            {result.type === 'entry' ? <LogIn size={56} color="var(--success)" style={{margin:'0 auto 12px'}} />
              : result.type === 'exit' ? <LogOut size={56} color="var(--info)" style={{margin:'0 auto 12px'}} />
              : <CheckCircle size={56} color="var(--warning)" style={{margin:'0 auto 12px'}} />}
            <h2 style={{fontSize:'1.5rem', fontWeight:800, marginBottom:4}}>
              {result.type === 'entry' ? '✅ Entrada Registrada' : result.type === 'exit' ? '🔵 Salida Registrada' : '⚠️ Ya Registrado'}
            </h2>
            <p style={{fontSize:'1.25rem', fontWeight:600, marginBottom:4}}>
              {result.student.name} {result.student.lastName}
            </p>
            <p style={{color:'var(--gris-500)'}}>
              {result.student.grado} {result.student.nivel} {result.student.grupo} • {formatTime(result.time)}
            </p>
            {result.type === 'exit' && (
              <p style={{marginTop:8, fontWeight:600}}>
                Recogido por {result.pickedUpBy ? `${result.pickedUpBy.name} (${result.pickedUpBy.relation})` : 'No especificado'}
              </p>
            )}
            <div style={{marginTop:24, display:'flex', gap:8, justifyContent:'center'}}>
              <button onClick={() => { setResult(null); startScanner('student'); }} className="btn btn-primary">
                <ScanLine size={16} /> Escanear Otro
              </button>
              <button onClick={() => setResult(null)} className="btn btn-secondary">Cerrar</button>
            </div>
          </div>
        )}
      </div>

      {/* Visor de foto ampliada para verificar a quien recoge */}
      {zoom && (
        <div onClick={() => setZoom(null)}
          style={{position:'fixed', inset:0, background:'rgba(0,0,0,0.92)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:3000, cursor:'zoom-out', padding:24}}>
          <img src={zoom} alt="" style={{maxWidth:'95vw', maxHeight:'90vh', borderRadius:12, boxShadow:'0 10px 40px rgba(0,0,0,0.5)'}} />
          <button onClick={() => setZoom(null)}
            style={{position:'absolute', top:20, right:20, background:'rgba(255,255,255,0.15)', border:'none', color:'#fff', borderRadius:'50%', width:44, height:44, fontSize:20, cursor:'pointer'}}>✕</button>
        </div>
      )}
    </div>
  );
}
