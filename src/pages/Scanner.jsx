import { useState, useEffect, useRef } from 'react';
import { db } from '../firebase';
import { collection, query, where, getDocs, addDoc, updateDoc, doc } from 'firebase/firestore';
import { Html5Qrcode } from 'html5-qrcode';
import { useAuth } from '../context/AuthContext';
import { ScanLine, Camera, CheckCircle, XCircle, RotateCcw } from 'lucide-react';

export default function Scanner() {
  const { user } = useAuth();
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const scannerRef = useRef(null);
  const html5QrRef = useRef(null);
  const today = new Date().toISOString().split('T')[0];

  const startScanner = () => {
    setResult(null);
    setError('');
    setScanning(true);
  };

  useEffect(() => {
    let scanner = null;

    const init = async () => {
      if (scanning && !html5QrRef.current) {
        try {
          // Wait a tiny bit to ensure React rendered the div
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

    return () => {
      if (html5QrRef.current && !scanning) {
        // Clean up handled by stopScanner or unmount
      }
    };
  }, [scanning]);

  const stopScanner = async () => {
    if (html5QrRef.current) {
      try {
        await html5QrRef.current.stop();
        html5QrRef.current.clear();
      } catch (e) {}
      html5QrRef.current = null;
    }
    setScanning(false);
  };

  const onScanSuccess = async (decodedText) => {
    await stopScanner();
    await processAttendance(decodedText, 'qr');
  };

  const processAttendance = async (qrCode, method) => {
    try {
      // Find student by QR
      const studentsRef = collection(db, 'students');
      const q = query(studentsRef, where('qrCode', '==', qrCode));
      const snap = await getDocs(q);

      if (snap.empty) {
        setError('Código QR no reconocido. No se encontró alumno.');
        return;
      }

      const studentDoc = snap.docs[0];
      const student = { id: studentDoc.id, ...studentDoc.data() };

      // Check today's records
      const recordsRef = collection(db, 'attendance', today, 'records');
      const rq = query(recordsRef, where('studentId', '==', student.id));
      const rsnap = await getDocs(rq);

      const now = new Date().toISOString();

      if (rsnap.empty) {
        // Register entry
        await addDoc(recordsRef, {
          studentId: student.id,
          studentName: `${student.name} ${student.lastName}`,
          entryTime: now,
          exitTime: null,
          entryMethod: method,
          exitMethod: null,
          guardId: user.uid
        });
        setResult({ type: 'entry', student, time: now });
        await sendNotification(student, 'entry', now);
      } else {
        const record = rsnap.docs[0];
        const data = record.data();
        if (!data.exitTime) {
          // Register exit
          await updateDoc(doc(db, 'attendance', today, 'records', record.id), {
            exitTime: now,
            exitMethod: method
          });
          setResult({ type: 'exit', student, time: now });
          await sendNotification(student, 'exit', now);
        } else {
          setResult({ type: 'already', student, time: now });
        }
      }
    } catch (err) {
      console.error(err);
      setError('Error al procesar el registro: ' + err.message);
    }
  };

  const sendNotification = async (student, type, time) => {
    // This would trigger a cloud function to send push notifications
    // For now, we create a notification record
    try {
      const formattedTime = new Date(time).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
      const message = type === 'entry'
        ? `Tu hijo/a ${student.name} ${student.lastName} acaba de ENTRAR al colegio a las ${formattedTime}`
        : `Tu hijo/a ${student.name} ${student.lastName} acaba de SALIR del colegio a las ${formattedTime}`;

      if (student.parentIds) {
        for (const parentId of student.parentIds) {
          await addDoc(collection(db, 'notifications'), {
            parentId,
            studentId: student.id,
            type,
            message,
            time,
            read: false,
            createdAt: new Date().toISOString()
          });
        }
      }
    } catch (e) { console.error('Notification error:', e); }
  };

  const formatTime = (iso) => new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  useEffect(() => {
    return () => { stopScanner(); };
  }, []);

  return (
    <div className="page-container animate-in">
      <div className="page-header" style={{textAlign:'center'}}>
        <h1 className="page-title">Escáner de Acceso</h1>
        <p className="page-subtitle">Escanea el código QR del alumno</p>
      </div>

      <div style={{maxWidth:500, margin:'0 auto'}}>
        {!scanning && !result && (
          <div className="card" style={{textAlign:'center', padding:'48px 24px'}}>
            <div style={{width:100,height:100,borderRadius:'50%',background:'linear-gradient(135deg,var(--guinda),var(--guinda-dark))',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 24px'}}>
              <ScanLine size={48} color="#fff" />
            </div>
            <h2 style={{fontSize:'1.25rem',fontWeight:700,marginBottom:8}}>Listo para escanear</h2>
            <p style={{color:'var(--gris-500)',marginBottom:24}}>Presiona el botón para activar la cámara y escanear el QR del alumno</p>
            <button onClick={startScanner} className="btn btn-primary btn-lg">
              <Camera size={20} /> Iniciar Escáner
            </button>
          </div>
        )}

        {scanning && (
          <div className="card" style={{padding:0, overflow:'hidden'}}>
            <div id="qr-reader" style={{width:'100%'}}></div>
            <div style={{padding:16, textAlign:'center'}}>
              <button onClick={stopScanner} className="btn btn-danger">
                <XCircle size={16} /> Detener
              </button>
            </div>
          </div>
        )}

        {error && (
          <div className="card" style={{textAlign:'center', padding:32, marginTop:16}}>
            <XCircle size={48} color="var(--danger)" style={{margin:'0 auto 12px'}} />
            <p style={{color:'var(--danger)', fontWeight:600, marginBottom:16}}>{error}</p>
            <button onClick={() => { setError(''); startScanner(); }} className="btn btn-primary">
              <RotateCcw size={16} /> Reintentar
            </button>
          </div>
        )}

        {result && (
          <div className={`scan-result ${result.type === 'entry' ? 'entry' : 'exit'}`} style={{marginTop:16}}>
            <CheckCircle size={56} color={result.type === 'entry' ? 'var(--success)' : 'var(--info)'} style={{margin:'0 auto 12px'}} />
            <h2 style={{fontSize:'1.5rem', fontWeight:800, marginBottom:4}}>
              {result.type === 'entry' ? '✅ Entrada Registrada' : result.type === 'exit' ? '🔵 Salida Registrada' : '⚠️ Ya Registrado'}
            </h2>
            <p style={{fontSize:'1.25rem', fontWeight:600, marginBottom:4}}>
              {result.student.name} {result.student.lastName}
            </p>
            <p style={{color:'var(--gris-500)'}}>
              {result.student.grade} {result.student.group} • {formatTime(result.time)}
            </p>
            <div style={{marginTop:24, display:'flex', gap:8, justifyContent:'center'}}>
              <button onClick={() => { setResult(null); startScanner(); }} className="btn btn-primary">
                <ScanLine size={16} /> Escanear Otro
              </button>
              <button onClick={() => setResult(null)} className="btn btn-secondary">
                Cerrar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
