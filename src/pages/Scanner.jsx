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
    } else {
      await processStudent(decodedText);
    }
  };

  // Carga las personas autorizadas (grupo familiar de los padres + titulares).
  const loadAuthorized = async (student) => {
    setLoadingPeople(true);
    const people = [];
    try {
      for (const parentId of (student.parentIds || [])) {
        const pSnap = await getDoc(doc(db, 'users', parentId));
        if (pSnap.exists()) {
          people.push({ id: `parent-${parentId}`, name: pSnap.data().displayName || 'Padre/Tutor', relation: 'Titular', passCode: null });
        }
        const fSnap = await getDocs(collection(db, 'users', parentId, 'familyMembers'));
        fSnap.forEach(d => {
          const m = d.data();
          if (m.active !== false) people.push({ id: d.id, name: m.name, relation: m.relation, passCode: m.passCode || null });
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
        {!scanning && !result && !pendingExit && (
          <div className="card" style={{textAlign:'center', padding:'48px 24px'}}>
            <div style={{width:100,height:100,borderRadius:'50%',background:'linear-gradient(135deg,var(--guinda),var(--guinda-dark))',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 24px'}}>
              <ScanLine size={48} color="#fff" />
            </div>
            <h2 style={{fontSize:'1.25rem',fontWeight:700,marginBottom:8}}>Listo para escanear</h2>
            <p style={{color:'var(--gris-500)',marginBottom:24}}>Presiona el botón para activar la cámara y escanear el QR del alumno</p>
            <button onClick={() => startScanner('student')} className="btn btn-primary btn-lg">
              <Camera size={20} /> Iniciar Escáner
            </button>
          </div>
        )}

        {scanning && (
          <div className="card" style={{padding:0, overflow:'hidden'}}>
            {scanModeRef.current === 'pass' && (
              <div style={{padding:'12px 16px', background:'var(--info-bg)', color:'var(--info)', fontWeight:600, textAlign:'center'}}>
                Escanea el pase de quien recoge
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
                    <span style={{display:'flex', alignItems:'center', gap:8}}><User size={16}/> {p.name}</span>
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

        {error && !pendingExit && (
          <div className="card" style={{textAlign:'center', padding:32, marginTop:16}}>
            <XCircle size={48} color="var(--danger)" style={{margin:'0 auto 12px'}} />
            <p style={{color:'var(--danger)', fontWeight:600, marginBottom:16}}>{error}</p>
            <button onClick={() => { setError(''); startScanner('student'); }} className="btn btn-primary">
              <RotateCcw size={16} /> Reintentar
            </button>
          </div>
        )}

        {result && (
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
    </div>
  );
}
