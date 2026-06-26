import { useState, useEffect, useRef, useCallback } from 'react';
import { db } from '../firebase';
import { collection, query, where, getDocs, getDoc, addDoc, updateDoc, doc } from 'firebase/firestore';
import { Html5Qrcode } from 'html5-qrcode';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { LogIn, LogOut, CheckCircle, XCircle, ScanLine, ArrowLeft, IdCard, User } from 'lucide-react';
import logo from '../assets/logo.jpg';

// Tiempo de espera para registrar la salida si nadie indica quién recoge.
const PICKUP_TIMEOUT_MS = 25000;

// Modo kiosko: escaneo continuo y desatendido para registrar entradas y salidas.
// En la salida pide (sin bloquear) quién recoge: se puede escanear su pase QR o tocar su nombre.
export default function Kiosk() {
  const { user, userData, logout } = useAuth();
  const navigate = useNavigate();
  const role = typeof userData?.role === 'string' ? userData.role.trim().toLowerCase() : '';
  const isKioskAccount = role === 'kiosk';
  const kioskPlantel = userData?.plantel || '';

  const [result, setResult] = useState(null); // {type, student, time, pickedUpBy}
  const [error, setError] = useState('');
  const [pendingExit, setPendingExit] = useState(null); // { student, recordId }
  const [authorized, setAuthorized] = useState([]);

  const html5QrRef = useRef(null);
  const busyRef = useRef(false);
  const modeRef = useRef('attendance'); // 'attendance' | 'pickup'
  const pendingExitRef = useRef(null);
  const authorizedRef = useRef([]);
  const pickupTimerRef = useRef(null);
  const today = new Date().toISOString().split('T')[0];

  const showFeedback = (data, ms = 3500) => {
    setResult(data);
    setTimeout(() => { setResult(null); busyRef.current = false; }, ms);
  };

  const sendNotification = async (student, type, time, person = null) => {
    try {
      const formattedTime = new Date(time).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
      let message = type === 'entry'
        ? `${student.name} ${student.lastName} ENTRÓ al colegio a las ${formattedTime}`
        : `${student.name} ${student.lastName} SALIÓ del colegio a las ${formattedTime}`;
      if (type === 'exit' && person) message += ` · Recogido por ${person.name} (${person.relation})`;
      for (const parentId of (student.parentIds || [])) {
        await addDoc(collection(db, 'notifications'), {
          parentId, studentId: student.id, type, message, time,
          read: false, createdAt: new Date().toISOString(),
        });
      }
    } catch (e) { console.error('Notification error:', e); }
  };

  // Personas autorizadas a recoger: titulares (padres) + grupo familiar con pase QR.
  const loadAuthorized = async (student) => {
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
    authorizedRef.current = people;
    setAuthorized(people);
  };

  // Registra la salida con (o sin) la persona que recoge.
  const confirmExit = useCallback(async (person) => {
    const pending = pendingExitRef.current;
    if (!pending) return;
    if (pickupTimerRef.current) { clearTimeout(pickupTimerRef.current); pickupTimerRef.current = null; }

    const { student, recordId } = pending;
    const now = new Date().toISOString();
    try {
      await updateDoc(doc(db, 'attendance', today, 'records', recordId), {
        exitTime: now,
        exitMethod: 'kiosk',
        pickedUpById: person?.id || null,
        pickedUpByName: person?.name || 'No registrado',
        pickedUpByRelation: person?.relation || '',
      });
      await sendNotification(student, 'exit', now, person);
      showFeedback({ type: 'exit', student, time: now, pickedUpBy: person });
    } catch (e) {
      console.error(e);
      setError('Error al registrar la salida. Intenta de nuevo.');
      setTimeout(() => setError(''), 3000);
    }
    modeRef.current = 'attendance';
    pendingExitRef.current = null;
    authorizedRef.current = [];
    setPendingExit(null);
    setAuthorized([]);
  }, [today]);

  // Inicia el modo "quién recoge" sin bloquear: si nadie responde, se registra sin especificar.
  const startPickup = useCallback(async (student, recordId) => {
    const pending = { student, recordId };
    pendingExitRef.current = pending;
    setPendingExit(pending);
    modeRef.current = 'pickup';
    busyRef.current = false;
    await loadAuthorized(student);
    pickupTimerRef.current = setTimeout(() => { confirmExit(null); }, PICKUP_TIMEOUT_MS);
  }, [confirmExit]);

  const handlePickupScan = useCallback((passCode) => {
    const match = authorizedRef.current.find(p => p.passCode && p.passCode === passCode);
    if (match) {
      confirmExit(match);
    } else {
      setError('Pase no reconocido para este alumno.');
      setTimeout(() => setError(''), 2500);
    }
  }, [confirmExit]);

  const processAttendance = useCallback(async (qrCode) => {
    try {
      const snap = await getDocs(query(collection(db, 'students'), where('qrCode', '==', qrCode)));
      if (snap.empty) { showFeedback({ type: 'unknown' }); return; }

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
          entryMethod: 'kiosk', exitMethod: null,
          guardId: user.uid,
          plantel: kioskPlantel || student.plantel || null,
        });
        showFeedback({ type: 'entry', student, time: now });
        sendNotification(student, 'entry', now);
      } else {
        const record = rsnap.docs[0];
        if (!record.data().exitTime) {
          // Salida: pasar a modo "quién recoge" (no bloquea el kiosko).
          startPickup(student, record.id);
        } else {
          showFeedback({ type: 'already', student, time: now });
        }
      }
    } catch (err) {
      console.error(err);
      busyRef.current = false;
      setError('Error al registrar. Intenta de nuevo.');
      setTimeout(() => setError(''), 3000);
    }
  }, [today, user, startPickup, kioskPlantel]);

  useEffect(() => {
    let scanner = null;
    let mounted = true;
    (async () => {
      try {
        await new Promise(r => setTimeout(r, 150));
        if (!mounted) return;
        scanner = new Html5Qrcode('kiosk-reader');
        html5QrRef.current = scanner;
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 280, height: 280 } },
          (decodedText) => {
            if (modeRef.current === 'pickup') { handlePickupScan(decodedText); return; }
            if (busyRef.current) return;
            busyRef.current = true;
            processAttendance(decodedText);
          },
          () => {}
        );
      } catch (err) {
        console.error('Camera error:', err);
        setError('No se pudo activar la cámara. Verifica permisos y que uses HTTPS.');
      }
    })();
    return () => {
      mounted = false;
      if (pickupTimerRef.current) clearTimeout(pickupTimerRef.current);
      if (html5QrRef.current) {
        html5QrRef.current.stop().then(() => html5QrRef.current?.clear()).catch(() => {});
        html5QrRef.current = null;
      }
    };
  }, [processAttendance, handlePickupScan]);

  const formatTime = (iso) => new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
  const clock = new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });

  const handleExitButton = async () => {
    if (isKioskAccount) {
      if (window.confirm('¿Cerrar sesión del kiosko? Necesitarás volver a iniciar sesión en esta tablet.')) {
        await logout();
        navigate('/login');
      }
    } else {
      navigate('/dashboard');
    }
  };

  const overlay = result && (() => {
    if (result.type === 'unknown') return { bg: 'var(--danger)', icon: <XCircle size={120} color="#fff"/>, title: 'QR no reconocido', sub: 'Acércate a recepción' };
    if (result.type === 'entry') return { bg: 'var(--success)', icon: <LogIn size={120} color="#fff"/>, title: '¡Bienvenido!', sub: `${result.student.name} ${result.student.lastName}` };
    if (result.type === 'exit') return { bg: 'var(--info)', icon: <LogOut size={120} color="#fff"/>, title: '¡Hasta pronto!', sub: `${result.student.name} ${result.student.lastName}` };
    return { bg: 'var(--warning)', icon: <CheckCircle size={120} color="#fff"/>, title: 'Ya registrado hoy', sub: `${result.student.name} ${result.student.lastName}` };
  })();

  return (
    <div style={{position:'fixed',inset:0,background:'var(--gris-900)',color:'#fff',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',zIndex:1000}}>
      <button onClick={handleExitButton} className="btn btn-secondary" style={{position:'absolute',top:16,left:16,zIndex:1002}}>
        {isKioskAccount ? <><LogOut size={16}/> Cerrar sesión</> : <><ArrowLeft size={16}/> Salir del kiosko</>}
      </button>

      <div style={{position:'absolute',top:16,right:24,textAlign:'right',opacity:0.8}}>
        <div style={{display:'flex',alignItems:'center',gap:10,justifyContent:'flex-end'}}>
          <img src={logo} alt="Logo" style={{width:36,height:36,borderRadius:'50%',objectFit:'cover'}} />
          <strong>Colegio Oliverio Cromwell</strong>
        </div>
        <div style={{fontSize:'0.85rem',textTransform:'capitalize'}}>{clock}</div>
      </div>

      <div style={{textAlign:'center',marginBottom:24}}>
        <h1 style={{fontSize:'2rem',fontWeight:800,marginBottom:4}}>Checador de Asistencia</h1>
        {kioskPlantel && (
          <div style={{display:'inline-block',background:'var(--guinda)',color:'#fff',fontWeight:700,padding:'4px 16px',borderRadius:999,marginBottom:8}}>
            Plantel {kioskPlantel}
          </div>
        )}
        <p style={{opacity:0.7,display:'flex',alignItems:'center',gap:8,justifyContent:'center'}}><ScanLine size={18}/> Acerca tu código QR a la cámara</p>
      </div>

      <div style={{width:340,maxWidth:'90vw',borderRadius:'var(--radius-lg)',overflow:'hidden',boxShadow:'var(--shadow-xl)'}}>
        <div id="kiosk-reader" style={{width:'100%'}}></div>
      </div>

      {error && <p style={{marginTop:20,color:'#fff',background:'var(--danger)',padding:'10px 18px',borderRadius:8}}>{error}</p>}

      {/* Modo "quién recoge" (salida) — overlay táctil, no detiene el escaneo del pase */}
      {pendingExit && (
        <div style={{position:'absolute',inset:0,background:'rgba(15,23,42,0.96)',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:24,zIndex:1001}}>
          <LogOut size={64} color="var(--info)" />
          <h1 style={{fontSize:'2rem',fontWeight:800,marginTop:12,textAlign:'center'}}>¿Quién recoge a {pendingExit.student.name}?</h1>
          <p style={{opacity:0.8,marginTop:4,display:'flex',alignItems:'center',gap:8}}><IdCard size={18}/> Escanea el pase QR o toca el nombre</p>

          <div style={{display:'flex',flexWrap:'wrap',gap:12,justifyContent:'center',marginTop:24,maxWidth:760}}>
            {authorized.map(p => (
              <button key={p.id} onClick={() => confirmExit(p)}
                className="btn"
                style={{background:'#fff',color:'var(--gris-900)',fontSize:'1.1rem',padding:'16px 22px',borderRadius:12,display:'flex',flexDirection:'column',alignItems:'center',gap:8,minWidth:180}}>
                {p.photo ? (
                  <img src={p.photo} alt="" style={{width:72,height:72,borderRadius:'50%',objectFit:'cover'}} />
                ) : (
                  <span style={{width:72,height:72,borderRadius:'50%',background:'var(--gris-200)',display:'flex',alignItems:'center',justifyContent:'center'}}><User size={30}/></span>
                )}
                <span style={{display:'flex',alignItems:'center',gap:8,fontWeight:700}}>{p.name}</span>
                <span style={{fontSize:'0.8rem',opacity:0.7}}>{p.relation}</span>
              </button>
            ))}
            {authorized.length === 0 && (
              <p style={{opacity:0.75}}>Sin personas autorizadas registradas.</p>
            )}
          </div>

          <button onClick={() => confirmExit(null)} className="btn btn-gold" style={{marginTop:28,padding:'14px 28px',fontSize:'1.05rem'}}>
            Registrar salida sin especificar
          </button>
          <p style={{opacity:0.6,marginTop:12,fontSize:'0.85rem'}}>Se registrará automáticamente en unos segundos.</p>
        </div>
      )}

      {overlay && (
        <div style={{position:'absolute',inset:0,background:overlay.bg,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',animation:'fadeIn 0.2s ease',zIndex:1001}}>
          {overlay.icon}
          <h1 style={{fontSize:'3rem',fontWeight:800,marginTop:16}}>{overlay.title}</h1>
          <p style={{fontSize:'1.5rem',marginTop:8}}>{overlay.sub}</p>
          {result.time && <p style={{fontSize:'1.25rem',opacity:0.85,marginTop:8}}>{formatTime(result.time)}</p>}
          {result.type === 'exit' && (
            <p style={{fontSize:'1.1rem',opacity:0.9,marginTop:6}}>
              Recogido por {result.pickedUpBy ? `${result.pickedUpBy.name} (${result.pickedUpBy.relation})` : 'No especificado'}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
