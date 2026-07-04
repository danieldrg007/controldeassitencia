import { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase';
import { collection, getDocs } from 'firebase/firestore';
import { Users, UserCheck, UserX, Download, Filter, FileText, Clock, ClipboardCheck } from 'lucide-react';
import { NOMBRE_PLANTELES, GRUPOS, nivelesDePlantel, gradosDeNivel, adminScope, studentInScope } from '../config/colegio';
import { useAuth } from '../context/AuthContext';

export default function Dashboard() {
  const { userData } = useAuth();
  // Admin de plantel/sección: sus datos quedan acotados a su alcance.
  const scope = useMemo(() => adminScope(userData), [userData]);
  const [students, setStudents] = useState([]);
  const [dailyRecords, setDailyRecords] = useState({});
  const [monthlyRecords, setMonthlyRecords] = useState({});
  const [classRecords, setClassRecords] = useState({}); // studentId -> { status, takenByName }
  
  const todayDate = new Date().toLocaleDateString('en-CA');
  const currentMonth = todayDate.substring(0, 7);

  const [viewMode, setViewMode] = useState('daily');
  const [selectedDate, setSelectedDate] = useState(todayDate);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);

  const [filterPlantel, setFilterPlantel] = useState('');
  const [filterNivel, setFilterNivel] = useState('');
  const [filterGrado, setFilterGrado] = useState('');
  const [filterGrupo, setFilterGrupo] = useState('');

  const [loading, setLoading] = useState(true);

  // Load basic student directory
  useEffect(() => {
    const fetchStudents = async () => {
      setLoading(true);
      try {
        const snap = await getDocs(collection(db, 'students'));
        const list = [];
        snap.forEach(d => list.push({ id: d.id, ...d.data() }));
        list.sort((a, b) => `${a.lastName} ${a.name}`.localeCompare(`${b.lastName} ${b.name}`));
        setStudents(list);
        if (list.length === 0) setLoading(false);
      } catch (err) {
        console.error('Error fetching students', err);
        setLoading(false);
      }
    };
    fetchStudents();
  }, []);

  // Fetch Daily Records
  useEffect(() => {
    if (viewMode !== 'daily') return;
    if (students.length === 0) {
      setDailyRecords({});
      setLoading(false);
      return;
    }
    const fetchDaily = async () => {
      setLoading(true);
      try {
        const snap = await getDocs(collection(db, 'attendance', selectedDate, 'records'));
        const recs = {};
        snap.forEach(d => {
          const data = d.data();
          recs[data.studentId] = data;
        });
        setDailyRecords(recs);
      } catch (err) {
        console.error('Error fetching daily records', err);
      }
      setLoading(false);
    };
    fetchDaily();
  }, [viewMode, selectedDate, students]);

  // Fetch Class Attendance Records (asistencia a clase tomada por profesores)
  useEffect(() => {
    if (viewMode !== 'class') return;
    if (students.length === 0) {
      setClassRecords({});
      setLoading(false);
      return;
    }
    const fetchClass = async () => {
      setLoading(true);
      try {
        const snap = await getDocs(collection(db, 'classAttendance', selectedDate, 'records'));
        const recs = {};
        snap.forEach(d => {
          const data = d.data();
          recs[data.studentId] = data;
        });
        setClassRecords(recs);
      } catch (err) {
        console.error('Error fetching class attendance', err);
      }
      setLoading(false);
    };
    fetchClass();
  }, [viewMode, selectedDate, students]);

  // Fetch Monthly Records
  useEffect(() => {
    if (viewMode !== 'monthly') return;
    if (students.length === 0) {
      setMonthlyRecords({});
      setLoading(false);
      return;
    }
    const fetchMonthly = async () => {
      setLoading(true);
      try {
        const [year, month] = selectedMonth.split('-');
        const daysInMonth = new Date(year, month, 0).getDate();
        
        // Build array of YYYY-MM-DD for the month
        const daysToFetch = [];
        const now = new Date();
        const maxDay = (parseInt(year) === now.getFullYear() && parseInt(month) === now.getMonth() + 1) ? now.getDate() : daysInMonth;

        for (let i = 1; i <= maxDay; i++) {
          const dayStr = String(i).padStart(2, '0');
          daysToFetch.push(`${selectedMonth}-${dayStr}`);
        }

        const monthAgg = {};
        students.forEach(s => {
          monthAgg[s.id] = { daysPresent: 0, totalDaysEvaluated: daysToFetch.length, details: {} };
        });

        // Parallel fetch for all days in month
        const snaps = await Promise.all(
          daysToFetch.map(date => getDocs(collection(db, 'attendance', date, 'records')).catch(() => null))
        );

        snaps.forEach((snap, idx) => {
          if (!snap) return;
          const dateStr = daysToFetch[idx];
          snap.forEach(doc => {
            const data = doc.data();
            if (monthAgg[data.studentId]) {
              monthAgg[data.studentId].daysPresent += 1;
              monthAgg[data.studentId].details[dateStr] = data;
            }
          });
        });

        setMonthlyRecords(monthAgg);
      } catch (err) {
        console.error('Error fetching monthly records', err);
      }
      setLoading(false);
    };
    fetchMonthly();
  }, [viewMode, selectedMonth, students]);

  // Apply Filters to Students
  const filteredStudents = useMemo(() => {
    return students.filter(s => {
      if (!studentInScope(s, scope)) return false;
      if (filterPlantel && s.plantel !== filterPlantel) return false;
      if (filterNivel && s.nivel !== filterNivel) return false;
      if (filterGrado && s.grado !== filterGrado) return false;
      if (filterGrupo && s.grupo !== filterGrupo) return false;
      return true;
    });
  }, [students, filterPlantel, filterNivel, filterGrado, filterGrupo, scope]);

  // Daily Stats Calculation
  const dailyStats = useMemo(() => {
    if (viewMode !== 'daily') return null;
    let present = 0;
    filteredStudents.forEach(s => {
      if (dailyRecords[s.id]) present++;
    });
    return {
      total: filteredStudents.length,
      present,
      absent: filteredStudents.length - present
    };
  }, [filteredStudents, dailyRecords, viewMode]);

  // Class Attendance Stats
  const classStats = useMemo(() => {
    if (viewMode !== 'class') return null;
    let present = 0, late = 0, absent = 0, pending = 0;
    filteredStudents.forEach(s => {
      const st = classRecords[s.id]?.status;
      if (st === 'present') present++;
      else if (st === 'late') late++;
      else if (st === 'absent') absent++;
      else pending++;
    });
    return { total: filteredStudents.length, present, late, absent, pending };
  }, [filteredStudents, classRecords, viewMode]);

  // Monthly Stats Calculation
  const monthlyStats = useMemo(() => {
    if (viewMode !== 'monthly') return null;
    let totalPresentDays = 0;
    let totalEvaluatedDays = 0;
    filteredStudents.forEach(s => {
      if (monthlyRecords[s.id]) {
        totalPresentDays += monthlyRecords[s.id].daysPresent;
        totalEvaluatedDays += monthlyRecords[s.id].totalDaysEvaluated;
      }
    });
    const avg = totalEvaluatedDays > 0 ? ((totalPresentDays / totalEvaluatedDays) * 100).toFixed(1) : 0;
    return {
      avgAttendance: avg,
      totalStudents: filteredStudents.length
    };
  }, [filteredStudents, monthlyRecords, viewMode]);

  const planteles = scope ? [scope.plantel] : NOMBRE_PLANTELES;
  const availableNiveles = filterPlantel ? nivelesDePlantel(filterPlantel) : [];
  const availableGrados = filterNivel ? gradosDeNivel(filterNivel) : [];

  return (
    <div className="page-container animate-in">
      <div className="page-header" style={{display:'flex', flexWrap:'wrap', justifyContent:'space-between', alignItems:'center', gap:'16px'}}>
        <div>
          <h1 className="page-title">Dashboard Analítico</h1>
          <p className="page-subtitle">Estadísticas y reportes de asistencia</p>
        </div>
        <div className="seg" style={{flexWrap:'wrap'}}>
          <button type="button" className={viewMode === 'daily' ? 'active' : ''} onClick={() => setViewMode('daily')}>Vista Diaria</button>
          <button type="button" className={viewMode === 'class' ? 'active' : ''} onClick={() => setViewMode('class')}>Asistencia a Clase</button>
          <button type="button" className={viewMode === 'monthly' ? 'active' : ''} onClick={() => setViewMode('monthly')}>Reporte Mensual</button>
        </div>
      </div>

      {/* Filters Card */}
      <div className="card" style={{marginBottom: '24px'}}>
        <div style={{display:'flex', alignItems:'center', gap:'8px', marginBottom:'16px'}}>
          <Filter size={18} color="var(--gris-500)"/>
          <h3 style={{fontWeight: 600, margin: 0, color: 'var(--gris-700)'}}>Filtros de Búsqueda</h3>
        </div>
        
        <div style={{
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
          gap: '16px'
        }}>
          <div className="form-group" style={{marginBottom: 0}}>
            <label className="form-label">{viewMode === 'monthly' ? 'Mes del Reporte' : 'Fecha Exacta'}</label>
            {viewMode === 'monthly' ? (
              <input type="month" className="form-input" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} max={currentMonth} />
            ) : (
              <input type="date" className="form-input" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} max={todayDate} />
            )}
          </div>

          <div className="form-group" style={{marginBottom: 0}}>
            <label className="form-label">Plantel</label>
            <select className="form-select" value={filterPlantel} onChange={e => {setFilterPlantel(e.target.value); setFilterNivel(''); setFilterGrado('');}}>
              <option value="">Todos los Planteles</option>
              {planteles.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>

          <div className="form-group" style={{marginBottom: 0}}>
            <label className="form-label">Nivel</label>
            <select className="form-select" value={filterNivel} onChange={e => {setFilterNivel(e.target.value); setFilterGrado('');}} disabled={!filterPlantel}>
              <option value="">Todos los Niveles</option>
              {availableNiveles.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>

          <div className="form-group" style={{marginBottom: 0}}>
            <label className="form-label">Grado</label>
            <select className="form-select" value={filterGrado} onChange={e => setFilterGrado(e.target.value)} disabled={!filterNivel}>
              <option value="">Todos los Grados</option>
              {availableGrados.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>

          <div className="form-group" style={{marginBottom: 0}}>
            <label className="form-label">Grupo</label>
            <select className="form-select" value={filterGrupo} onChange={e => setFilterGrupo(e.target.value)}>
              <option value="">Todos los Grupos</option>
              {GRUPOS.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
        </div>
      </div>

      {loading ? (
        <div style={{display:'flex', justifyContent:'center', padding:'40px'}}>
          <div style={{width:'40px', height:'40px', border:'3px solid var(--gris-200)', borderTopColor:'var(--guinda)', borderRadius:'50%', animation:'spin 1s linear infinite'}}></div>
        </div>
      ) : (
        <>
          {/* Stats Overview */}
          <div className="stats-grid" style={{marginBottom: '24px'}}>
            {viewMode === 'daily' && dailyStats && (
              <>
                <div className="stat-card">
                  <div className="stat-icon" style={{background: 'var(--info-bg)'}}>
                    <Users size={24} color="var(--info)" />
                  </div>
                  <div>
                    <div className="stat-label">Población (Filtro)</div>
                    <div className="stat-value">{dailyStats.total}</div>
                  </div>
                </div>
                <div className="stat-card">
                  <div className="stat-icon" style={{background: 'var(--success-bg)'}}>
                    <UserCheck size={24} color="var(--success)" />
                  </div>
                  <div>
                    <div className="stat-label">Asistieron Hoy</div>
                    <div className="stat-value">{dailyStats.present}</div>
                  </div>
                </div>
                <div className="stat-card">
                  <div className="stat-icon" style={{background: 'var(--danger-bg)'}}>
                    <UserX size={24} color="var(--danger)" />
                  </div>
                  <div>
                    <div className="stat-label">Ausencias</div>
                    <div className="stat-value">{dailyStats.absent}</div>
                  </div>
                </div>
              </>
            )}

            {viewMode === 'class' && classStats && (
              <>
                <div className="stat-card">
                  <div className="stat-icon" style={{background: 'var(--success-bg)'}}>
                    <UserCheck size={24} color="var(--success)" />
                  </div>
                  <div>
                    <div className="stat-label">Presentes en Clase</div>
                    <div className="stat-value">{classStats.present}</div>
                  </div>
                </div>
                <div className="stat-card">
                  <div className="stat-icon" style={{background: 'var(--warning-bg)'}}>
                    <Clock size={24} color="var(--warning)" />
                  </div>
                  <div>
                    <div className="stat-label">Tarde</div>
                    <div className="stat-value">{classStats.late}</div>
                  </div>
                </div>
                <div className="stat-card">
                  <div className="stat-icon" style={{background: 'var(--danger-bg)'}}>
                    <UserX size={24} color="var(--danger)" />
                  </div>
                  <div>
                    <div className="stat-label">Ausentes</div>
                    <div className="stat-value">{classStats.absent}</div>
                  </div>
                </div>
                <div className="stat-card">
                  <div className="stat-icon" style={{background: 'var(--gris-100)'}}>
                    <ClipboardCheck size={24} color="var(--gris-500)" />
                  </div>
                  <div>
                    <div className="stat-label">Sin Pasar Lista</div>
                    <div className="stat-value">{classStats.pending}</div>
                  </div>
                </div>
              </>
            )}

            {viewMode === 'monthly' && monthlyStats && (
              <>
                <div className="stat-card">
                  <div className="stat-icon" style={{background: 'var(--info-bg)'}}>
                    <Users size={24} color="var(--info)" />
                  </div>
                  <div>
                    <div className="stat-label">Alumnos Evaluados</div>
                    <div className="stat-value">{monthlyStats.totalStudents}</div>
                  </div>
                </div>
                <div className="stat-card">
                  <div className="stat-icon" style={{background: 'var(--success-bg)'}}>
                    <FileText size={24} color="var(--success)" />
                  </div>
                  <div>
                    <div className="stat-label">Promedio de Asistencia</div>
                    <div className="stat-value">{monthlyStats.avgAttendance}%</div>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Details Table */}
          <div className="card">
            <div style={{display:'flex', flexWrap:'wrap', justifyContent:'space-between', alignItems:'center', gap:'16px', marginBottom:'16px'}}>
              <h2 className="card-title" style={{margin: 0}}>
                {viewMode === 'monthly'
                  ? `Resumen de ${new Date(selectedMonth + '-01T12:00:00').toLocaleDateString('es-MX', {month:'long', year:'numeric'}).toUpperCase()}`
                  : viewMode === 'class'
                    ? `Asistencia a clase del ${new Date(selectedDate + 'T12:00:00').toLocaleDateString('es-MX')}`
                    : `Registros del ${new Date(selectedDate + 'T12:00:00').toLocaleDateString('es-MX')}`}
              </h2>
              <button className="btn btn-secondary btn-sm" onClick={() => window.print()}>
                <Download size={14} /> Exportar Reporte
              </button>
            </div>

            {filteredStudents.length === 0 ? (
              <div className="empty-state">
                <p className="empty-state-text">No hay alumnos que coincidan con los filtros seleccionados.</p>
              </div>
            ) : (
              <div className="table-container">
                {viewMode === 'daily' ? (
                  <table className="table-cards">
                    <thead>
                      <tr>
                        <th>Alumno</th>
                        <th>Grado / Grupo</th>
                        <th>Plantel</th>
                        <th>Estado</th>
                        <th>Entrada</th>
                        <th>Salida</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredStudents.map(s => {
                        const rec = dailyRecords[s.id];
                        return (
                          <tr key={s.id}>
                            <td style={{fontWeight: 500}}>{s.lastName} {s.name}</td>
                            <td data-label="Grado / Grupo">{s.grado} {s.nivel} {s.grupo}</td>
                            <td data-label="Plantel" style={{fontSize:'0.85rem', color:'var(--gris-500)'}}>{s.plantel || '—'}</td>
                            <td data-label="Estado">
                              <span className={`badge ${rec ? 'badge-success' : 'badge-danger'}`}>
                                {rec ? 'Presente' : 'Ausente'}
                              </span>
                            </td>
                            <td data-label="Entrada">{rec?.entryTime ? new Date(rec.entryTime).toLocaleTimeString('es-MX', {hour:'2-digit', minute:'2-digit'}) : '—'}</td>
                            <td data-label="Salida">{rec?.exitTime ? new Date(rec.exitTime).toLocaleTimeString('es-MX', {hour:'2-digit', minute:'2-digit'}) : '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                ) : viewMode === 'class' ? (
                  <table className="table-cards">
                    <thead>
                      <tr>
                        <th>Alumno</th>
                        <th>Grado / Grupo</th>
                        <th>Plantel</th>
                        <th>Estado en Clase</th>
                        <th>Registrada por</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredStudents.map(s => {
                        const rec = classRecords[s.id];
                        const st = rec?.status;
                        const cfg = st === 'present' ? { label: 'Presente', badge: 'badge-success' }
                          : st === 'late' ? { label: 'Tarde', badge: 'badge-warning' }
                          : st === 'absent' ? { label: 'Ausente', badge: 'badge-danger' }
                          : { label: 'Sin pasar lista', badge: 'badge-info' };
                        return (
                          <tr key={s.id}>
                            <td style={{fontWeight: 500}}>{s.lastName} {s.name}</td>
                            <td data-label="Grado / Grupo">{s.grado} {s.nivel} {s.grupo}</td>
                            <td data-label="Plantel" style={{fontSize:'0.85rem', color:'var(--gris-500)'}}>{s.plantel || '—'}</td>
                            <td data-label="Estado en Clase"><span className={`badge ${cfg.badge}`}>{cfg.label}</span></td>
                            <td data-label="Registrada por" style={{fontSize:'0.85rem', color:'var(--gris-500)'}}>{rec?.takenByName || '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                ) : (
                  <table className="table-cards">
                    <thead>
                      <tr>
                        <th>Alumno</th>
                        <th>Grado / Grupo</th>
                        <th>Plantel</th>
                        <th style={{textAlign: 'center'}}>Días Presente</th>
                        <th style={{textAlign: 'center'}}>Días Totales Eval.</th>
                        <th style={{textAlign: 'right'}}>% Asistencia</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredStudents.map(s => {
                        const rec = monthlyRecords[s.id] || { daysPresent: 0, totalDaysEvaluated: 0 };
                        const pct = rec.totalDaysEvaluated > 0 ? Math.round((rec.daysPresent / rec.totalDaysEvaluated) * 100) : 0;
                        return (
                          <tr key={s.id}>
                            <td style={{fontWeight: 500}}>{s.lastName} {s.name}</td>
                            <td data-label="Grado / Grupo">{s.grado} {s.nivel} {s.grupo}</td>
                            <td data-label="Plantel" style={{fontSize:'0.85rem', color:'var(--gris-500)'}}>{s.plantel || '—'}</td>
                            <td data-label="Días Presente" style={{textAlign: 'center'}}>{rec.daysPresent}</td>
                            <td data-label="Días Totales Eval." style={{textAlign: 'center'}}>{rec.totalDaysEvaluated}</td>
                            <td data-label="% Asistencia" style={{textAlign: 'right'}}>
                              <span className={`badge ${pct >= 80 ? 'badge-success' : (pct >= 60 ? 'badge-warning' : 'badge-danger')}`}>
                                {pct}%
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
