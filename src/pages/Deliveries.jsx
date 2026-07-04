import { useState, useEffect, useMemo, useRef } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { Html5Qrcode } from 'html5-qrcode';
import { PackageCheck, Megaphone, CheckCircle2, Camera, XCircle, Ban, Clock, KeyRound } from 'lucide-react';
import { NOMBRE_PLANTELES, adminScope } from '../config/colegio';
import { resolvePickupCode, enqueuePickup, callStudent, deliverStudent, todayStr } from '../utils/pickupQueue';
import Avatar from '../components/Avatar';

const STATUS = {
  waiting:   { label: 'En espera',  badge: 'badge-warning' },
  called:    { label: 'Llamado',    badge: 'badge-info' },
  delivered: { label: 'Entregado',  badge: 'badge-success' },
};

// Panel de entregas: cola en tiempo real de alumnos por entregar a sus padres.
// El padre escanea su QR de recogida aquí (o en el kiosko) → sus hijos aparecen
// como "pendientes"; el personal los manda llamar y marca la entrega.
export default function Deliveries() {
  const { user, userData } = useAuth();
  const today = todayStr();

  const scope = adminScope(userData); // admin de plantel → cola acotada a su plantel
  const [items, setItems] = useState([]);
  const [plantelFilter, setPlantelFilter] = useState(scope?.plantel || '');
  const [scanning, setScanning] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(null); // { type: 'ok'|'error', text }
  const html5QrRef = useRef(null);

  // Cola del día en tiempo real.
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'pickupQueue', today, 'items'), (snap) => {
      const list = [];
      snap.forEach(d => list.push({ id: d.id, ...d.data() }));
      list.sort((a, b) => (a.requestedAt || '').localeCompare(b.requestedAt || ''));
      setItems(list);
    }, (err) => console.error('pickupQueue snapshot', err));
    return unsub;
  }, [today]);

  const flash = (type, text, ms = 5000) => {
    setFeedback({ type, text });
    setTimeout(() => setFeedback(null), ms);
  };

  const processCode = async (code) => {
    setBusy(true);
    try {
      const res = await resolvePickupCode(code);
      if (!res.ok) { flash('error', res.error); setBusy(false); return; }
      const { queued, skipped } = await enqueuePickup(res);
      if (queued === 0) {
        const suspendidos = res.items.some(i => i.suspended);
        flash('error', suspendidos
          ? 'Alumno(s) con cuenta suspendida: el tutor debe pasar a administración.'
          : 'Ninguno de los alumnos de este código está en el colegio ahora.');
      } else {
        flash('ok', `${queued} alumno(s) de ${res.person} agregado(s) a la cola.${skipped ? ` (${skipped} omitidos)` : ''}`);
      }
    } catch (e) { flash('error', 'Error: ' + e.message); }
    setBusy(false);
  };

  // Escáner de códigos de recogida.
  useEffect(() => {
    if (!scanning) return;
    let scanner = null;
    let mounted = true;
    (async () => {
      try {
        await new Promise(r => setTimeout(r, 100));
        if (!mounted) return;
        scanner = new Html5Qrcode('delivery-reader');
        html5QrRef.current = scanner;
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: (vw, vh) => { const s = Math.floor(Math.min(vw, vh) * 0.75); return { width: s, height: s }; } },
          async (decoded) => {
            await scanner.stop().catch(() => {});
            scanner.clear();
            html5QrRef.current = null;
            setScanning(false);
            processCode(decoded);
          },
          () => {}
        );
      } catch (err) {
        console.error('Camera error', err);
        flash('error', 'No se pudo activar la cámara. Verifica permisos.');
        setScanning(false);
      }
    })();
    return () => {
      mounted = false;
      if (html5QrRef.current) {
        html5QrRef.current.stop().then(() => html5QrRef.current?.clear()).catch(() => {});
        html5QrRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanning]);

  const submitManual = (e) => {
    e.preventDefault();
    if (!manualCode.trim()) return;
    processCode(manualCode);
    setManualCode('');
  };

  const handleCall = async (item) => {
    try { await callStudent(item); } catch (e) { flash('error', 'Error al llamar: ' + e.message); }
  };

  const handleDeliver = async (item) => {
    if (!window.confirm(`¿Confirmar entrega de ${item.studentName} a ${item.requestedByName}?\n\nSe registrará su salida.`)) return;
    try {
      await deliverStudent(item, { deliveredByUid: user.uid, deliveredByName: userData?.displayName || '' });
    } catch (e) { flash('error', 'Error al entregar: ' + e.message); }
  };

  const filtered = useMemo(
    () => plantelFilter ? items.filter(i => i.plantel === plantelFilter) : items,
    [items, plantelFilter]
  );
  const pending = filtered.filter(i => i.status !== 'delivered');
  const delivered = filtered.filter(i => i.status === 'delivered');

  const fmtTime = (iso) => iso ? new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) : '';

  const Row = ({ it }) => {
    const st = STATUS[it.status] || STATUS.waiting;
    return (
      <div style={{display:'flex', alignItems:'center', gap:12, padding:'14px 0', borderBottom:'1px solid var(--surface-border)', flexWrap:'wrap'}}>
        <Avatar name={it.studentName} size={40} />
        <div style={{flex:1, minWidth:180}}>
          <div style={{fontWeight:700}}>{it.studentName}</div>
          <div style={{fontSize:'0.8rem', color:'var(--gris-500)'}}>
            {it.grado} {it.nivel} {it.grupo} · <strong>{it.plantel || 'sin plantel'}</strong>
          </div>
          <div style={{fontSize:'0.78rem', color:'var(--gris-500)', marginTop:2, display:'flex', alignItems:'center', gap:4, flexWrap:'wrap'}}>
            <KeyRound size={12}/> Recoge: <strong>{it.requestedByName}</strong> · llegó {fmtTime(it.requestedAt)}
            {it.calledAt && <span>· llamado {fmtTime(it.calledAt)}</span>}
            {it.deliveredAt && <span>· entregado {fmtTime(it.deliveredAt)}</span>}
          </div>
        </div>
        <span className={`badge ${st.badge}`}>{st.label}</span>
        {it.status !== 'delivered' && (
          <div style={{display:'flex', gap:8}}>
            {it.status === 'waiting' && (
              <button onClick={() => handleCall(it)} className="btn btn-sm btn-gold" title="Mandar a llamar al plantel">
                <Megaphone size={14}/> Llamar
              </button>
            )}
            <button onClick={() => handleDeliver(it)} className="btn btn-sm btn-success" title="Marcar como entregado (registra la salida)">
              <CheckCircle2 size={14}/> Entregado
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="page-container animate-in">
      <div className="page-header">
        <h1 className="page-title" style={{display:'flex', alignItems:'center', gap:8}}><PackageCheck size={26}/> Entregas</h1>
        <p className="page-subtitle">El padre escanea su código de recogida al llegar; entrega a cada alumno y márcalo aquí</p>
      </div>

      <div className="pp-grid" style={{marginBottom:16}}>
        {/* Registrar llegada del padre */}
        <div className="card">
          <h3 className="card-title" style={{marginBottom:12}}>Registrar llegada</h3>
          {scanning ? (
            <div style={{borderRadius:'var(--radius-md)', overflow:'hidden', background:'#000'}}>
              <div id="delivery-reader" style={{width:'100%'}}></div>
              <div style={{padding:12, textAlign:'center'}}>
                <button onClick={() => setScanning(false)} className="btn btn-danger btn-sm"><XCircle size={14}/> Detener</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setScanning(true)} className="btn btn-primary w-full" disabled={busy}>
              <Camera size={16}/> Escanear código de recogida
            </button>
          )}
          <form onSubmit={submitManual} style={{display:'flex', gap:8, marginTop:10}}>
            <input className="form-input" placeholder="O escribe el código (RC-XXXXXX)" value={manualCode}
              onChange={e => setManualCode(e.target.value)} style={{textTransform:'uppercase', flex:1}} />
            <button type="submit" className="btn btn-secondary" disabled={busy || !manualCode.trim()}>Agregar</button>
          </form>
          {feedback && (
            <div className={`notice ${feedback.type === 'ok' ? 'notice-info' : 'notice-danger'}`} style={{marginTop:10}}>
              {feedback.type === 'ok' ? <CheckCircle2 size={18}/> : <Ban size={18}/>}
              <p style={{fontSize:'0.85rem'}}>{feedback.text}</p>
            </div>
          )}
        </div>

        {/* Resumen del día */}
        <div className="card">
          <h3 className="card-title" style={{marginBottom:12}}>Hoy</h3>
          <div className="stats-grid" style={{marginBottom:0}}>
            <div className="stat-card" style={{padding:14}}>
              <div className="stat-icon warning"><Clock size={20}/></div>
              <div><div className="stat-value">{items.filter(i => i.status === 'waiting').length}</div><div className="stat-label">En espera</div></div>
            </div>
            <div className="stat-card" style={{padding:14}}>
              <div className="stat-icon guinda"><Megaphone size={20}/></div>
              <div><div className="stat-value">{items.filter(i => i.status === 'called').length}</div><div className="stat-label">Llamados</div></div>
            </div>
            <div className="stat-card" style={{padding:14}}>
              <div className="stat-icon success"><CheckCircle2 size={20}/></div>
              <div><div className="stat-value">{delivered.length}</div><div className="stat-label">Entregados</div></div>
            </div>
          </div>
          <div className="form-group" style={{marginTop:14, marginBottom:0}}>
            <label className="form-label">Filtrar por plantel</label>
            <select className="form-select" value={plantelFilter} onChange={e => setPlantelFilter(e.target.value)} disabled={!!scope}>
              {!scope && <option value="">Todos los planteles</option>}
              {(scope ? [scope.plantel] : NOMBRE_PLANTELES).map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className="card">
        <h3 className="card-title" style={{marginBottom:8}}>Pendientes por entregar ({pending.length})</h3>
        {pending.length === 0 ? (
          <div className="empty-state" style={{padding:28}}>
            <div className="empty-state-icon">🎒</div>
            <p className="empty-state-text">No hay alumnos en la cola de entrega.</p>
          </div>
        ) : pending.map(it => <Row key={it.id} it={it} />)}
      </div>

      {delivered.length > 0 && (
        <div className="card" style={{marginTop:16}}>
          <h3 className="card-title" style={{marginBottom:8}}>Entregados hoy ({delivered.length})</h3>
          {delivered.map(it => <Row key={it.id} it={it} />)}
        </div>
      )}
    </div>
  );
}
