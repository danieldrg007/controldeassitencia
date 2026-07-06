import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { db } from '../firebase';
import { collection, getDocs, doc, updateDoc } from 'firebase/firestore';
import { GraduationCap, Search, Building2, Users2, BookOpen, Check, Save, RotateCcw, School, AlertTriangle } from 'lucide-react';
import { NOMBRE_PLANTELES, nivelesDePlantel, gradosDeNivel, GRUPOS, makeClassId, parseClassId } from '../config/colegio';
import Avatar from '../components/Avatar';

const arrEq = (a = [], b = []) => a.length === b.length && [...a].sort().join('|') === [...b].sort().join('|');

// Planteles que un profesor ya "tiene" implícitos por sus grupos (para inferir
// cuando un profesor antiguo no tiene el campo planteles todavía).
const plantelesDeClassIds = (classIds = []) =>
  [...new Set(classIds.map(c => parseClassId(c).plantel).filter(Boolean))];

export default function TeacherAssign() {
  const [params, setParams] = useSearchParams();
  const [teachers, setTeachers] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState(params.get('uid') || null);
  const [draft, setDraft] = useState({ planteles: [], classIds: [], subjectIds: [] });
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState(false);

  const load = async () => {
    const [uSnap, sSnap] = await Promise.all([
      getDocs(collection(db, 'users')),
      getDocs(collection(db, 'subjects')),
    ]);
    const ts = [];
    uSnap.forEach(d => { const u = { id: d.id, ...d.data() }; if ((u.role || '').toLowerCase() === 'teacher') ts.push(u); });
    ts.sort((a, b) => (a.displayName || '').localeCompare(b.displayName || ''));
    setTeachers(ts);
    const ss = [];
    sSnap.forEach(d => ss.push({ id: d.id, ...d.data() }));
    ss.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    setSubjects(ss);
  };
  useEffect(() => { load(); }, []);

  const selected = useMemo(() => teachers.find(t => t.id === selectedId) || null, [teachers, selectedId]);

  // Carga el borrador cuando cambia el profesor seleccionado.
  useEffect(() => {
    if (!selected) return;
    const classIds = Array.isArray(selected.classIds) ? selected.classIds : [];
    const planteles = Array.isArray(selected.planteles) && selected.planteles.length
      ? selected.planteles
      : plantelesDeClassIds(classIds);
    setDraft({
      planteles: [...new Set(planteles)],
      classIds: [...classIds],
      subjectIds: Array.isArray(selected.subjectIds) ? [...selected.subjectIds] : [],
    });
  }, [selected]);

  const subById = useMemo(() => Object.fromEntries(subjects.map(s => [s.id, s])), [subjects]);

  const filteredTeachers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return teachers;
    return teachers.filter(t => (t.displayName || '').toLowerCase().includes(q) || (t.email || '').toLowerCase().includes(q));
  }, [teachers, search]);

  // Cambios sin guardar respecto al documento actual.
  const dirty = useMemo(() => {
    if (!selected) return false;
    const cur = {
      planteles: Array.isArray(selected.planteles) && selected.planteles.length ? selected.planteles : plantelesDeClassIds(selected.classIds || []),
      classIds: selected.classIds || [],
      subjectIds: selected.subjectIds || [],
    };
    return !arrEq(cur.planteles, draft.planteles) || !arrEq(cur.classIds, draft.classIds) || !arrEq(cur.subjectIds, draft.subjectIds);
  }, [selected, draft]);

  // --- Toggles ---
  const togglePlantel = (p) => setDraft(d => {
    const has = d.planteles.includes(p);
    return {
      ...d,
      planteles: has ? d.planteles.filter(x => x !== p) : [...d.planteles, p],
      // Al quitar un plantel, se descartan sus grupos asignados.
      classIds: has ? d.classIds.filter(cid => parseClassId(cid).plantel !== p) : d.classIds,
    };
  });

  const toggleClass = (id) => setDraft(d => ({
    ...d,
    classIds: d.classIds.includes(id) ? d.classIds.filter(x => x !== id) : [...d.classIds, id],
  }));

  const toggleSubject = (id) => setDraft(d => ({
    ...d,
    subjectIds: d.subjectIds.includes(id) ? d.subjectIds.filter(x => x !== id) : [...d.subjectIds, id],
  }));

  const setMany = (ids, on) => setDraft(d => {
    const set = new Set(d.classIds);
    ids.forEach(id => { if (on) set.add(id); else set.delete(id); });
    return { ...d, classIds: [...set] };
  });

  const classIdsForNivel = (plantel, nivel) =>
    gradosDeNivel(nivel).flatMap(grado => GRUPOS.map(grupo => makeClassId({ plantel, nivel, grado, grupo })));

  const save = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, 'users', selected.id), {
        planteles: draft.planteles,
        classIds: draft.classIds,
        subjectIds: draft.subjectIds,
        subjectNames: draft.subjectIds.map(id => subById[id]?.name).filter(Boolean),
      });
      // Refresca en memoria sin recargar todo.
      setTeachers(ts => ts.map(t => t.id === selected.id ? { ...t, ...draft, subjectNames: draft.subjectIds.map(id => subById[id]?.name).filter(Boolean) } : t));
      setSavedMsg(true);
      setTimeout(() => setSavedMsg(false), 2500);
    } catch (e) { alert('Error al guardar: ' + e.message); }
    setSaving(false);
  };

  const discard = () => {
    if (!selected) return;
    const classIds = selected.classIds || [];
    const planteles = Array.isArray(selected.planteles) && selected.planteles.length ? selected.planteles : plantelesDeClassIds(classIds);
    setDraft({ planteles: [...new Set(planteles)], classIds: [...classIds], subjectIds: selected.subjectIds || [] });
  };

  const pickTeacher = (t) => {
    setSelectedId(t.id);
    setParams(prev => { const p = new URLSearchParams(prev); p.set('uid', t.id); return p; }, { replace: true });
  };

  const teacherMeta = (t) => {
    const nP = (Array.isArray(t.planteles) && t.planteles.length ? t.planteles : plantelesDeClassIds(t.classIds || [])).length;
    const nG = (t.classIds || []).length;
    const nM = (t.subjectIds || []).length;
    return `${nP} plantel${nP === 1 ? '' : 'es'} · ${nG} grupo${nG === 1 ? '' : 's'} · ${nM} materia${nM === 1 ? '' : 's'}`;
  };

  return (
    <div className="page-container animate-in">
      <div className="page-header">
        <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}><GraduationCap size={24} /> Asignar materias y planteles</h1>
        <p className="page-subtitle">Define planteles, grupos y materias de cada profesor. Multiplantel soportado.</p>
      </div>

      <div className="assign-layout">
        {/* Lista de profesores */}
        <div className="card" style={{ padding: 14 }}>
          <div style={{ position: 'relative', marginBottom: 12 }}>
            <Search size={18} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--gris-500)' }} />
            <input className="form-input" placeholder="Buscar profesor..." value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: 40 }} />
          </div>
          <p style={{ fontSize: '0.76rem', color: 'var(--gris-500)', margin: '0 2px 10px' }}>{filteredTeachers.length} profesor(es)</p>
          <div style={{ maxHeight: 620, overflowY: 'auto', paddingRight: 2 }}>
            {filteredTeachers.length === 0 ? (
              <div className="empty-state" style={{ padding: 24 }}><div className="empty-state-icon">🧑‍🏫</div><p className="empty-state-text">No hay profesores.</p></div>
            ) : filteredTeachers.map(t => (
              <button key={t.id} className={`assign-teacher ${selectedId === t.id ? 'active' : ''}`} onClick={() => pickTeacher(t)}>
                <Avatar src={t.photo} name={t.displayName} size={40} />
                <div className="assign-teacher-info">
                  <div className="assign-teacher-name">{t.displayName || 'Sin nombre'}</div>
                  <div className="assign-teacher-meta">{teacherMeta(t)}</div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Editor de asignación */}
        {!selected ? (
          <div className="card">
            <div className="empty-state" style={{ padding: 48 }}>
              <div className="empty-state-icon">👈</div>
              <p className="empty-state-text">Elige un profesor de la lista para asignar sus planteles, grupos y materias.</p>
            </div>
          </div>
        ) : (
          <div>
            {/* Encabezado del profesor */}
            <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
              <Avatar src={selected.photo} name={selected.displayName} size={54} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: '1.1rem', fontFamily: 'var(--font-display)' }}>{selected.displayName || 'Sin nombre'}</div>
                <div style={{ fontSize: '0.82rem', color: 'var(--gris-500)' }}>{selected.email}</div>
              </div>
            </div>

            {/* 1. Planteles */}
            <div className="card" style={{ marginBottom: 16 }}>
              <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}><Building2 size={18} color="var(--guinda)" /> Planteles</h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--gris-500)', marginBottom: 12 }}>Selecciona uno o varios (multiplantel). Los grupos se desbloquean según los planteles elegidos.</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {NOMBRE_PLANTELES.map(p => {
                  const on = draft.planteles.includes(p);
                  return (
                    <button key={p} type="button" className={`pick ${on ? 'on' : ''}`} onClick={() => togglePlantel(p)}>
                      {on ? <Check size={15} /> : <School size={15} />} {p}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 2. Grupos (dinámico según planteles) */}
            <div className="card" style={{ marginBottom: 16 }}>
              <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <Users2 size={18} color="var(--guinda)" /> Grupos
                <span className="badge badge-gold" style={{ marginLeft: 'auto' }}>{draft.classIds.length}</span>
              </h3>
              {draft.planteles.length === 0 ? (
                <div className="notice notice-warning" style={{ marginTop: 10 }}>
                  <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: 2 }} />
                  <p style={{ fontSize: '0.82rem' }}>Primero selecciona al menos un plantel para poder asignar grupos.</p>
                </div>
              ) : (
                draft.planteles.slice().sort((a, b) => NOMBRE_PLANTELES.indexOf(a) - NOMBRE_PLANTELES.indexOf(b)).map(plantel => (
                  <div key={plantel} className="assign-plantel">
                    <div className="assign-plantel-head"><Building2 size={16} color="var(--guinda)" /> {plantel}</div>
                    <div className="assign-plantel-body">
                      {nivelesDePlantel(plantel).map(nivel => {
                        const nivelIds = classIdsForNivel(plantel, nivel);
                        const allOn = nivelIds.every(id => draft.classIds.includes(id));
                        const someOn = nivelIds.some(id => draft.classIds.includes(id));
                        return (
                          <div key={nivel}>
                            <div className="assign-nivel-head">
                              <span className="assign-nivel-title">{nivel}</span>
                              <button type="button" className="btn btn-sm btn-secondary" onClick={() => setMany(nivelIds, !allOn)}>
                                {allOn ? 'Quitar todos' : someOn ? 'Completar nivel' : 'Todo el nivel'}
                              </button>
                            </div>
                            {gradosDeNivel(nivel).map(grado => {
                              const gradoIds = GRUPOS.map(grupo => makeClassId({ plantel, nivel, grado, grupo }));
                              const allGrado = gradoIds.every(id => draft.classIds.includes(id));
                              return (
                                <div key={grado} className="assign-grado-row">
                                  <span className="assign-grado-label">{grado}</span>
                                  {GRUPOS.map(grupo => {
                                    const id = makeClassId({ plantel, nivel, grado, grupo });
                                    const on = draft.classIds.includes(id);
                                    return (
                                      <button key={grupo} type="button" className={`pick ${on ? 'on' : ''}`} onClick={() => toggleClass(id)}>
                                        {on && <Check size={13} />} {grupo}
                                      </button>
                                    );
                                  })}
                                  <button type="button" className="btn btn-sm btn-gold" style={{ marginLeft: 'auto' }} onClick={() => setMany(gradoIds, !allGrado)}>
                                    {allGrado ? 'Quitar' : 'A y B'}
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* 3. Materias */}
            <div className="card" style={{ marginBottom: 16 }}>
              <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <BookOpen size={18} color="var(--guinda)" /> Materias que imparte
                <span className="badge badge-gold" style={{ marginLeft: 'auto' }}>{draft.subjectIds.length}</span>
              </h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--gris-500)', marginBottom: 12 }}>Se usan para acotar la captura de calificaciones del profesor.</p>
              {subjects.length === 0 ? (
                <div className="notice notice-info" style={{ marginTop: 6 }}>
                  <BookOpen size={18} style={{ flexShrink: 0, marginTop: 2 }} />
                  <p style={{ fontSize: '0.82rem' }}>No hay materias en el catálogo. Agrégalas en la sección <strong>Materias</strong>.</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {subjects.map(s => {
                    const on = draft.subjectIds.includes(s.id);
                    return (
                      <button key={s.id} type="button" className={`pick gold ${on ? 'on' : ''}`} onClick={() => toggleSubject(s.id)}>
                        {on ? <Check size={14} /> : <BookOpen size={14} />} {s.name}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Barra de guardado */}
            <div className="assign-bar">
              <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--gris-600)' }}>
                {draft.planteles.length} plantel(es) · {draft.classIds.length} grupo(s) · {draft.subjectIds.length} materia(s)
              </div>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                {savedMsg && <span style={{ color: 'var(--success)', fontWeight: 700, fontSize: '0.85rem', display: 'inline-flex', alignItems: 'center', gap: 4 }}><Check size={16} /> Guardado</span>}
                {dirty && <button className="btn btn-secondary" onClick={discard}><RotateCcw size={15} /> Descartar</button>}
                <button className="btn btn-primary" onClick={save} disabled={saving || !dirty}>
                  <Save size={16} /> {saving ? 'Guardando...' : 'Guardar asignación'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
