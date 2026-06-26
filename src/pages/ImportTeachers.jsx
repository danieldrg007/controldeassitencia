import { useState, useMemo, useRef } from 'react';
import { db, secondaryAuth } from '../firebase';
import { collection, getDocs, doc, setDoc } from 'firebase/firestore';
import { createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { useNavigate } from 'react-router-dom';
import { UploadCloud, FileSpreadsheet, ArrowLeft, Check, AlertTriangle, UserCheck, Download, Loader2 } from 'lucide-react';
import { NOMBRE_PLANTELES } from '../config/colegio';

/* ── Helpers ───────────────────────────────────────────────── */

// Normaliza texto para comparar encabezados sin acentos/mayúsculas/espacios.
const norm = (s) => (typeof s === 'string' ? s : String(s ?? ''))
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/\s+/g, ' ').trim();

// Mapa de plantel HRMS (MAYÚSCULAS) → nombre de entradasoliverio (capitalizado).
const PLANTEL_MAP = NOMBRE_PLANTELES.reduce((acc, p) => { acc[norm(p)] = p; return acc; }, {});
const normalizarPlantel = (raw) => {
  const key = norm(raw);
  if (!key || key === 'todos' || key.startsWith('multiplantel')) return '';
  return PLANTEL_MAP[key] || '';
};

const genPassword = () => Math.random().toString(36).slice(-8);
const isEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e || '');

// Encuentra, dentro de las claves de una fila, la que corresponde a cada campo.
const buildColumnMap = (sampleRow) => {
  const keys = Object.keys(sampleRow || {});
  const find = (...candidates) => {
    const cands = candidates.map(norm);
    return keys.find((k) => cands.includes(norm(k))) || null;
  };
  return {
    nombre: find('nombre'),
    apPat: find('apellido paterno'),
    apMat: find('apellido materno'),
    correoInst: find('correo institucional'),
    correoPers: find('correo personal'),
    puesto: find('puesto'),
    plantel: find('plantel'),
    estado: find('estado'),
    seccion: find('seccion'),
  };
};

const DEFAULT_TEACHER_RX = 'maestr|docente|profesor';

export default function ImportTeachers() {
  const navigate = useNavigate();
  const fileInput = useRef(null);

  const [step, setStep] = useState('upload'); // upload | review | done
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState([]);       // registros normalizados
  const [colMap, setColMap] = useState({});
  const [existing, setExisting] = useState(new Set());
  const [parseError, setParseError] = useState('');

  const [puestoRx, setPuestoRx] = useState(DEFAULT_TEACHER_RX);
  const [onlyTeachers, setOnlyTeachers] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(new Set());

  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [results, setResults] = useState([]);

  const teacherRe = useMemo(() => {
    try { return new RegExp(puestoRx, 'i'); } catch { return null; }
  }, [puestoRx]);

  /* ── Carga y parseo del archivo ──────────────────────────── */
  const handleFile = async (file) => {
    if (!file) return;
    setParseError('');
    setFileName(file.name);
    try {
      const XLSX = await import('xlsx');
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json(ws, { defval: '' });
      if (!raw.length) { setParseError('El archivo no tiene filas de datos.'); return; }

      const map = buildColumnMap(raw[0]);
      if (!map.correoInst && !map.correoPers) {
        setParseError('No se encontró ninguna columna de correo. Vuelve a exportar en HRMS incluyendo "Correo Institucional" (preset "Todos los campos" o un reporte personalizado).');
        return;
      }

      // Carga correos ya existentes en entradasoliverio para marcar duplicados.
      const snap = await getDocs(collection(db, 'users'));
      const emails = new Set();
      snap.forEach((d) => { const e = d.data().email; if (e) emails.add(norm(e)); });

      const records = raw.map((r) => {
        const nombre = map.nombre ? r[map.nombre] : '';
        const apPat = map.apPat ? r[map.apPat] : '';
        const apMat = map.apMat ? r[map.apMat] : '';
        const displayName = [nombre, apPat, apMat].map((x) => String(x ?? '').trim()).filter(Boolean).join(' ');
        const correo = (map.correoInst && r[map.correoInst]) || (map.correoPers && r[map.correoPers]) || '';
        const email = String(correo).trim().toLowerCase();
        const puesto = map.puesto ? String(r[map.puesto] ?? '').trim() : '';
        const plantelRaw = map.plantel ? String(r[map.plantel] ?? '').trim() : '';
        const estado = map.estado ? String(r[map.estado] ?? '').trim() : '';
        return {
          displayName, email, puesto, plantelRaw,
          plantel: normalizarPlantel(plantelRaw),
          estado,
        };
      }).filter((r) => r.displayName || r.email);

      setColMap(map);
      setExisting(emails);
      setRows(records);

      // Preselección: parece maestro + correo válido + no existe + activo.
      const re = (() => { try { return new RegExp(puestoRx, 'i'); } catch { return null; } })();
      const pre = new Set();
      records.forEach((r, i) => {
        const looksTeacher = !map.puesto || (re ? re.test(r.puesto) : true);
        const active = norm(r.estado) !== 'inactivo';
        if (looksTeacher && isEmail(r.email) && !emails.has(norm(r.email)) && active) pre.add(i);
      });
      setSelected(pre);
      setStep('review');
    } catch (err) {
      console.error(err);
      setParseError('No se pudo leer el archivo. Asegúrate de que sea el Excel (.xlsx) exportado por HRMS.');
    }
  };

  /* ── Estado por fila (para badges) ───────────────────────── */
  const rowStatus = (r) => {
    if (!isEmail(r.email)) return { kind: 'no-email', label: 'Sin correo válido', cls: 'badge-warning' };
    if (existing.has(norm(r.email))) return { kind: 'exists', label: 'Ya existe', cls: 'badge-info' };
    return { kind: 'ok', label: 'Listo para crear', cls: 'badge-success' };
  };

  const visibleRows = useMemo(() => {
    const q = norm(search);
    return rows
      .map((r, i) => ({ r, i }))
      .filter(({ r }) => {
        if (onlyTeachers && colMap.puesto && teacherRe && !teacherRe.test(r.puesto)) return false;
        if (!q) return true;
        return norm(r.displayName).includes(q) || norm(r.email).includes(q) || norm(r.puesto).includes(q);
      });
  }, [rows, search, onlyTeachers, teacherRe, colMap.puesto]);

  const selectableVisible = visibleRows.filter(({ r }) => rowStatus(r).kind === 'ok');
  const allVisibleSelected = selectableVisible.length > 0 && selectableVisible.every(({ i }) => selected.has(i));

  const toggle = (i) => setSelected((s) => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n; });
  const toggleAllVisible = () => setSelected((s) => {
    const n = new Set(s);
    if (allVisibleSelected) selectableVisible.forEach(({ i }) => n.delete(i));
    else selectableVisible.forEach(({ i }) => n.add(i));
    return n;
  });

  const selectedCount = selected.size;

  /* ── Creación en bloque ──────────────────────────────────── */
  const runImport = async () => {
    const targets = [...selected].map((i) => rows[i]).filter((r) => r && isEmail(r.email) && !existing.has(norm(r.email)));
    if (!targets.length) return;
    setRunning(true);
    setProgress({ done: 0, total: targets.length });
    const out = [];
    for (const r of targets) {
      const password = genPassword();
      try {
        const cred = await createUserWithEmailAndPassword(secondaryAuth, r.email, password);
        const payload = {
          email: r.email,
          displayName: r.displayName,
          role: 'teacher',
          classIds: [],
          createdAt: new Date().toISOString(),
          importedFrom: 'hrms',
        };
        if (r.plantel) payload.plantel = r.plantel;
        await setDoc(doc(db, 'users', cred.user.uid), payload);
        await signOut(secondaryAuth);
        out.push({ ...r, password, status: 'created' });
      } catch (err) {
        const code = err?.code || '';
        if (code === 'auth/email-already-in-use') out.push({ ...r, status: 'exists' });
        else out.push({ ...r, status: 'error', error: err?.message || code });
      }
      setProgress((p) => ({ ...p, done: p.done + 1 }));
    }
    setResults(out);
    setRunning(false);
    setStep('done');
  };

  const downloadCredentials = async () => {
    const created = results.filter((r) => r.status === 'created');
    if (!created.length) return;
    const XLSX = await import('xlsx');
    const data = created.map((r) => ({
      Nombre: r.displayName,
      Correo: r.email,
      'Contraseña': r.password,
      Plantel: r.plantel || '',
      Rol: 'Profesor',
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Credenciales');
    XLSX.writeFile(wb, `profesores_importados_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const resetAll = () => {
    setStep('upload'); setRows([]); setSelected(new Set()); setResults([]);
    setFileName(''); setParseError(''); setColMap({}); setExisting(new Set());
  };

  /* ── Render ──────────────────────────────────────────────── */
  return (
    <div className="page-container animate-in">
      <div className="page-header">
        <button onClick={() => navigate('/users')} className="btn btn-sm btn-secondary" style={{ marginBottom: 12 }}>
          <ArrowLeft size={15} /> Volver a Usuarios
        </button>
        <h1 className="page-title">Importar Profesores desde HRMS</h1>
        <p className="page-subtitle">Sube el Excel exportado en HRMS para crear las cuentas de profesor en bloque.</p>
      </div>

      {/* PASO 1 · Subir archivo */}
      {step === 'upload' && (
        <div className="card" style={{ maxWidth: 680, margin: '0 auto' }}>
          <div
            onClick={() => fileInput.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); handleFile(e.dataTransfer.files?.[0]); }}
            style={{
              border: '2px dashed var(--surface-border)', borderRadius: 'var(--radius-md)',
              padding: '48px 24px', textAlign: 'center', cursor: 'pointer',
              background: 'var(--surface-hover)', transition: 'border-color .2s',
            }}
          >
            <UploadCloud size={48} style={{ color: 'var(--brand)', margin: '0 auto 12px' }} />
            <p style={{ fontWeight: 700, color: 'var(--text-main)' }}>Arrastra el archivo aquí o haz clic para elegirlo</p>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: 4 }}>Excel (.xlsx) exportado desde HRMS</p>
            <input ref={fileInput} type="file" accept=".xlsx,.xls,.csv" hidden
              onChange={(e) => handleFile(e.target.files?.[0])} />
          </div>

          {parseError && (
            <div className="badge-warning" style={{ display: 'flex', gap: 8, padding: 12, borderRadius: 'var(--radius-sm)', marginTop: 16, alignItems: 'flex-start' }}>
              <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: 1 }} />
              <span style={{ fontSize: '0.85rem', fontWeight: 500 }}>{parseError}</span>
            </div>
          )}

          <div style={{ marginTop: 20, fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
            <p style={{ fontWeight: 700, color: 'var(--text-main)', marginBottom: 4 }}>💡 En HRMS, antes de exportar:</p>
            Usa <strong>"Todos los campos"</strong> o un reporte que incluya: Nombre, Apellidos, <strong>Correo Institucional</strong>, Puesto, Plantel y Estado.
          </div>
        </div>
      )}

      {/* PASO 2 · Revisar */}
      {step === 'review' && (
        <>
          <div className="card mb-4">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <FileSpreadsheet size={18} style={{ color: 'var(--brand)' }} />
              <strong>{fileName}</strong>
              <span className="badge badge-info">{rows.length} filas</span>
              <button onClick={resetAll} className="btn btn-sm btn-secondary" style={{ marginLeft: 'auto' }}>Cambiar archivo</button>
            </div>

            <div className="form-grid-auto" style={{ gridTemplateColumns: '2fr 1fr', alignItems: 'end' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Buscar</label>
                <input className="form-input" placeholder="Nombre, correo o puesto…" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Regla de "maestro" (puesto)</label>
                <input className="form-input" value={puestoRx} onChange={(e) => setPuestoRx(e.target.value)} disabled={!colMap.puesto} />
              </div>
            </div>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginTop: 12, fontSize: '0.85rem', cursor: colMap.puesto ? 'pointer' : 'not-allowed', opacity: colMap.puesto ? 1 : 0.5 }}>
              <input type="checkbox" checked={onlyTeachers} onChange={(e) => setOnlyTeachers(e.target.checked)} disabled={!colMap.puesto} />
              Mostrar solo posibles maestros
            </label>
            {!colMap.puesto && <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 6 }}>El Excel no trae columna "Puesto": se muestran todas las filas, revisa manualmente.</p>}
          </div>

          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div className="table-container" style={{ border: 'none', maxHeight: '55vh', overflowY: 'auto' }}>
              <table>
                <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                  <tr>
                    <th style={{ width: 44 }}>
                      <input type="checkbox" checked={allVisibleSelected} onChange={toggleAllVisible} title="Seleccionar visibles" />
                    </th>
                    <th>Nombre</th>
                    <th>Correo</th>
                    {colMap.puesto && <th>Puesto</th>}
                    <th>Plantel</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map(({ r, i }) => {
                    const st = rowStatus(r);
                    const disabled = st.kind !== 'ok';
                    return (
                      <tr key={i} style={{ opacity: disabled ? 0.6 : 1 }}>
                        <td>
                          <input type="checkbox" checked={selected.has(i)} disabled={disabled} onChange={() => toggle(i)} />
                        </td>
                        <td style={{ fontWeight: 600, whiteSpace: 'normal' }}>{r.displayName || '—'}</td>
                        <td style={{ whiteSpace: 'normal', wordBreak: 'break-all' }}>{r.email || '—'}</td>
                        {colMap.puesto && <td style={{ whiteSpace: 'normal' }}>{r.puesto || '—'}</td>}
                        <td>{r.plantel || (r.plantelRaw ? <span title="No coincide con un plantel del sistema" style={{ color: 'var(--warning)' }}>{r.plantelRaw}</span> : '—')}</td>
                        <td><span className={`badge ${st.cls}`}>{st.label}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ position: 'sticky', bottom: 0, marginTop: 16, padding: '14px 0' }}>
            <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
              <UserCheck size={20} style={{ color: 'var(--brand)' }} />
              <span><strong>{selectedCount}</strong> profesor(es) seleccionados para crear</span>
              <button onClick={runImport} className="btn btn-primary" disabled={running || selectedCount === 0} style={{ marginLeft: 'auto' }}>
                {running ? <><Loader2 size={16} className="spin" /> Creando {progress.done}/{progress.total}…</> : <>Crear {selectedCount} cuenta(s) de profesor</>}
              </button>
            </div>
          </div>
        </>
      )}

      {/* PASO 3 · Resultados */}
      {step === 'done' && (
        <div className="card" style={{ maxWidth: 820, margin: '0 auto' }}>
          {(() => {
            const created = results.filter((r) => r.status === 'created');
            const exists = results.filter((r) => r.status === 'exists');
            const errors = results.filter((r) => r.status === 'error');
            return (
              <>
                <div style={{ textAlign: 'center', marginBottom: 20 }}>
                  <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--success-bg)', color: 'var(--success)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                    <Check size={32} />
                  </div>
                  <h3 className="modal-title">Importación terminada</h3>
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 12, flexWrap: 'wrap' }}>
                    <span className="badge badge-success">{created.length} creados</span>
                    {exists.length > 0 && <span className="badge badge-info">{exists.length} ya existían</span>}
                    {errors.length > 0 && <span className="badge badge-danger">{errors.length} con error</span>}
                  </div>
                </div>

                {created.length > 0 && (
                  <button onClick={downloadCredentials} className="btn btn-gold w-full" style={{ marginBottom: 16 }}>
                    <Download size={16} /> Descargar credenciales (Excel)
                  </button>
                )}

                <div className="table-container">
                  <table>
                    <thead><tr><th>Nombre</th><th>Correo</th><th>Resultado</th></tr></thead>
                    <tbody>
                      {results.map((r, i) => (
                        <tr key={i}>
                          <td style={{ whiteSpace: 'normal' }}>{r.displayName}</td>
                          <td style={{ whiteSpace: 'normal', wordBreak: 'break-all' }}>{r.email}</td>
                          <td>
                            {r.status === 'created' && <span className="badge badge-success">Creado</span>}
                            {r.status === 'exists' && <span className="badge badge-info">Ya existía</span>}
                            {r.status === 'error' && <span className="badge badge-danger" title={r.error}>Error</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: 16 }}>
                  Los profesores se crearon <strong>sin grupos asignados</strong>. Asígnalos en <strong>Usuarios → Profesores → Editar</strong>.
                </p>

                <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
                  <button onClick={resetAll} className="btn btn-secondary" style={{ flex: 1 }}>Importar otro archivo</button>
                  <button onClick={() => navigate('/users')} className="btn btn-primary" style={{ flex: 1 }}>Ir a Usuarios</button>
                </div>
              </>
            );
          })()}
        </div>
      )}

      <style>{`.spin{animation:spin 0.8s linear infinite}`}</style>
    </div>
  );
}
