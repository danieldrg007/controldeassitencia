import { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase';
import { collection, getDocs } from 'firebase/firestore';
import { Users, UserCheck, UserX, Calendar as CalendarIcon, Download, Filter, FileText } from 'lucide-react';

const plantelesConfig = {
  'Tlalpan': ['Maternal', 'Kinder 1', 'Kinder 2', 'Kinder 3', 'Preprimaria', '1° Primaria', '2° Primaria', '3° Primaria', '4° Primaria', '5° Primaria', '6° Primaria', '1° Secundaria', '2° Secundaria', '3° Secundaria'],
  'Coyoacán': ['Maternal', 'Kinder 1', 'Kinder 2', 'Kinder 3', 'Preprimaria', '1° Primaria', '2° Primaria', '3° Primaria', '4° Primaria', '5° Primaria', '6° Primaria'],
  'Aztecas': ['1° Secundaria', '2° Secundaria', '3° Secundaria', '1° Bachillerato', '3° Bachillerato', '5° Bachillerato'],
  'Xochimilco': ['1° Primaria', '2° Primaria', '3° Primaria', '4° Primaria', '5° Primaria', '6° Primaria', '1° Secundaria', '2° Secundaria', '3° Secundaria']
};
const allGrades = [...new Set(Object.values(plantelesConfig).flat())];

export default function Dashboard() {
  const [students, setStudents] = useState([]);
  const [dailyRecords, setDailyRecords] = useState({});
  const [monthlyRecords, setMonthlyRecords] = useState({});
  
  const todayDate = new Date().toLocaleDateString('en-CA');
  const currentMonth = todayDate.substring(0, 7);

  const [viewMode, setViewMode] = useState('daily');
  const [selectedDate, setSelectedDate] = useState(todayDate);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);

  const [filterPlantel, setFilterPlantel] = useState('');
  const [filterGrade, setFilterGrade] = useState('');
  const [filterGroup, setFilterGroup] = useState('');

  const [loading, setLoading] = useState(true);

  // Load basic student directory
  useEffect(() => {
    const fetchStudents = async () => {
      const snap = await getDocs(collection(db, 'students'));
      const list = [];
      snap.forEach(d => list.push({ id: d.id, ...d.data() }));
      list.sort((a, b) => `${a.lastName} ${a.name}`.localeCompare(`${b.lastName} ${b.name}`));
      setStudents(list);
    };
    fetchStudents();
  }, []);

  // Fetch Daily Records
  useEffect(() => {
    if (viewMode !== 'daily' || students.length === 0) return;
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

  // Fetch Monthly Records
  useEffect(() => {
    if (viewMode !== 'monthly' || students.length === 0) return;
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
      if (filterPlantel && s.plantel !== filterPlantel) return false;
      if (filterGrade && s.grade !== filterGrade) return false;
      if (filterGroup && s.group !== filterGroup) return false;
      return true;
    });
  }, [students, filterPlantel, filterGrade, filterGroup]);

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

  const planteles = Object.keys(plantelesConfig);
  const availableGrades = filterPlantel ? plantelesConfig[filterPlantel] : allGrades;

  return (
    <div className="page-container animate-in">
      <div className="page-header" style={{display:'flex', flexWrap:'wrap', justifyContent:'space-between', alignItems:'center', gap:'16px'}}>
        <div>
          <h1 className="page-title">Dashboard Analítico</h1>
          <p className="page-subtitle">Estadísticas y reportes de asistencia</p>
        </div>
        <div style={{display:'flex', gap:'8px', background:'white', padding:'4px', borderRadius:'var(--radius-md)', border:'1px solid var(--gris-200)', flexWrap:'wrap'}}>
          <button 
            className="btn"
            style={{
              background: viewMode === 'daily' ? 'var(--guinda)' : 'transparent', 
              color: viewMode === 'daily' ? 'white' : 'var(--gris-600)',
              border: 'none',
              boxShadow: 'none'
            }}
            onClick={() => setViewMode('daily')}
          >
            Vista Diaria
          </button>
          <button 
            className="btn"
            style={{
              background: viewMode === 'monthly' ? 'var(--guinda)' : 'transparent', 
              color: viewMode === 'monthly' ? 'white' : 'var(--gris-600)',
              border: 'none',
              boxShadow: 'none'
            }}
            onClick={() => setViewMode('monthly')}
          >
            Reporte Mensual
          </button>
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
            <label className="form-label">{viewMode === 'daily' ? 'Fecha Exacta' : 'Mes del Reporte'}</label>
            {viewMode === 'daily' ? (
              <input type="date" className="form-input" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} max={todayDate} />
            ) : (
              <input type="month" className="form-input" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} max={currentMonth} />
            )}
          </div>

          <div className="form-group" style={{marginBottom: 0}}>
            <label className="form-label">Plantel</label>
            <select className="form-select" value={filterPlantel} onChange={e => {setFilterPlantel(e.target.value); setFilterGrade('');}}>
              <option value="">Todos los Planteles</option>
              {planteles.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          
          <div className="form-group" style={{marginBottom: 0}}>
            <label className="form-label">Grado Escolar</label>
            <select className="form-select" value={filterGrade} onChange={e => setFilterGrade(e.target.value)}>
              <option value="">Todos los Grados</option>
              {availableGrades.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>

          <div className="form-group" style={{marginBottom: 0}}>
            <label className="form-label">Grupo</label>
            <select className="form-select" value={filterGroup} onChange={e => setFilterGroup(e.target.value)}>
              <option value="">Todos los Grupos</option>
              {['A', 'B', 'C'].map(g => <option key={g} value={g}>{g}</option>)}
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
                {viewMode === 'daily' ? `Registros del ${new Date(selectedDate + 'T12:00:00').toLocaleDateString('es-MX')}` : `Resumen de ${new Date(selectedMonth + '-01T12:00:00').toLocaleDateString('es-MX', {month:'long', year:'numeric'}).toUpperCase()}`}
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
                  <table>
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
                            <td>{s.grade} {s.group}</td>
                            <td style={{fontSize:'0.85rem', color:'var(--gris-500)'}}>{s.plantel || '—'}</td>
                            <td>
                              <span className={`badge ${rec ? 'badge-success' : 'badge-danger'}`}>
                                {rec ? 'Presente' : 'Ausente'}
                              </span>
                            </td>
                            <td>{rec?.entryTime ? new Date(rec.entryTime).toLocaleTimeString('es-MX', {hour:'2-digit', minute:'2-digit'}) : '—'}</td>
                            <td>{rec?.exitTime ? new Date(rec.exitTime).toLocaleTimeString('es-MX', {hour:'2-digit', minute:'2-digit'}) : '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                ) : (
                  <table>
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
                            <td>{s.grade} {s.group}</td>
                            <td style={{fontSize:'0.85rem', color:'var(--gris-500)'}}>{s.plantel || '—'}</td>
                            <td style={{textAlign: 'center'}}>{rec.daysPresent}</td>
                            <td style={{textAlign: 'center'}}>{rec.totalDaysEvaluated}</td>
                            <td style={{textAlign: 'right'}}>
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
