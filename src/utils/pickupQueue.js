// Cola de entrega de alumnos ("pendientes por entregar").
//
// Flujo: el padre llega al filtro de salida y escanea su QR de recogida
// (pickupCode RC-... o un pase temporal autorizado). Sus hijos que están en el
// colegio se agregan a pickupQueue/{fecha}/items. El personal los manda llamar
// a su plantel y, al entregarlos, marca "Entregado" — lo que además registra la
// salida en attendance y notifica al tutor.
import { db } from '../firebase';
import {
  collection, query, where, getDocs, getDoc, doc, setDoc, updateDoc, addDoc,
} from 'firebase/firestore';

export const todayStr = () => new Date().toISOString().split('T')[0];

// Resuelve un código escaneado (pickupCode de padre o pase temporal) a la lista
// de alumnos que esa persona puede recoger HOY, con su estado de asistencia.
export async function resolvePickupCode(code) {
  const codeUp = (code || '').trim().toUpperCase();
  const today = todayStr();
  const studentIds = new Set();
  const authBy = {};
  let personName = '';
  let requesterUid = null;

  // 1) Autorizaciones temporales válidas hoy.
  const aSnap = await getDocs(query(collection(db, 'pickupAuthorizations'), where('pickupCode', '==', codeUp)));
  aSnap.forEach(d => {
    const a = d.data();
    if (a.validDate === today && a.status === 'active') {
      studentIds.add(a.studentId);
      authBy[a.studentId] = a.authorizedByName || 'Su tutor';
      if (!personName) personName = a.pickupName || '';
    }
  });

  // 2) Si el código es de un padre registrado: sus propios hijos.
  const uSnap = await getDocs(query(collection(db, 'users'), where('pickupCode', '==', codeUp)));
  if (!uSnap.empty) {
    const owner = uSnap.docs[0];
    requesterUid = owner.id;
    if (!personName) personName = owner.data().displayName || 'Padre/Tutor';
    const sSnap = await getDocs(query(collection(db, 'students'), where('parentIds', 'array-contains', owner.id)));
    sSnap.forEach(d => { studentIds.add(d.id); if (!authBy[d.id]) authBy[d.id] = 'Titular'; });
  }

  if (studentIds.size === 0) return { ok: false, error: 'Código sin recogidas autorizadas para hoy.' };

  const items = [];
  for (const sid of studentIds) {
    const sDoc = await getDoc(doc(db, 'students', sid));
    if (!sDoc.exists()) continue;
    const student = { id: sDoc.id, ...sDoc.data() };
    const rsnap = await getDocs(query(collection(db, 'attendance', today, 'records'), where('studentId', '==', sid)));
    const rec = rsnap.empty ? null : { id: rsnap.docs[0].id, ...rsnap.docs[0].data() };
    const inSchool = !student.suspended && !!(rec && rec.entryTime && !rec.exitTime);
    items.push({
      student,
      recordId: rec?.id || null,
      authorizedBy: authBy[sid],
      inSchool,
      alreadyOut: !!(rec && rec.exitTime),
      suspended: !!student.suspended,
    });
  }
  items.sort((a, b) => `${a.student.lastName}`.localeCompare(`${b.student.lastName}`));
  return { ok: true, person: personName || 'Persona con pase', code: codeUp, requesterUid, items };
}

// Agrega a la cola de entrega del día a los alumnos que SÍ están en el colegio.
// Devuelve { queued: n, skipped: n }.
export async function enqueuePickup({ person, code, requesterUid, items }) {
  const today = todayStr();
  let queued = 0, skipped = 0;
  const now = new Date().toISOString();
  for (const it of items) {
    if (!it.inSchool || !it.recordId) { skipped++; continue; }
    const s = it.student;
    // Doc id = studentId → escanear dos veces no duplica al niño en la lista.
    await setDoc(doc(db, 'pickupQueue', today, 'items', s.id), {
      studentId: s.id,
      studentName: `${s.name} ${s.lastName}`,
      classId: s.classId || '',
      plantel: s.plantel || '',
      nivel: s.nivel || '',
      grado: s.grado || '',
      grupo: s.grupo || '',
      parentIds: s.parentIds || [],
      attendanceRecordId: it.recordId,
      requestedByName: person,
      requestedByCode: code,
      requestedByUid: requesterUid || null,
      status: 'waiting', // waiting → called → delivered
      requestedAt: now,
    }, { merge: true });
    queued++;
  }
  return { queued, skipped };
}

// Manda a llamar al alumno a su plantel (y avisa al tutor).
export async function callStudent(item) {
  const today = todayStr();
  await updateDoc(doc(db, 'pickupQueue', today, 'items', item.studentId), {
    status: 'called',
    calledAt: new Date().toISOString(),
  });
  for (const parentId of (item.parentIds || [])) {
    await addDoc(collection(db, 'notifications'), {
      parentId,
      studentId: item.studentId,
      type: 'called',
      message: `📢 ${item.studentName} fue llamado(a) en el plantel ${item.plantel || ''}. Espera en la puerta de salida.`,
      time: new Date().toISOString(),
      read: false,
      createdAt: new Date().toISOString(),
    }).catch(() => {});
  }
}

// Marca la entrega: registra la salida en attendance, cierra el item y notifica.
export async function deliverStudent(item, { deliveredByUid, deliveredByName }) {
  const today = todayStr();
  const now = new Date().toISOString();
  const formattedTime = new Date(now).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });

  if (item.attendanceRecordId) {
    await updateDoc(doc(db, 'attendance', today, 'records', item.attendanceRecordId), {
      exitTime: now,
      exitMethod: 'entrega',
      pickedUpById: item.requestedByCode || null,
      pickedUpByName: item.requestedByName || 'No registrado',
      pickedUpByRelation: 'Entrega en puerta',
    });
  }

  await updateDoc(doc(db, 'pickupQueue', today, 'items', item.studentId), {
    status: 'delivered',
    deliveredAt: now,
    deliveredByUid: deliveredByUid || null,
    deliveredByName: deliveredByName || '',
  });

  for (const parentId of (item.parentIds || [])) {
    await addDoc(collection(db, 'notifications'), {
      parentId,
      studentId: item.studentId,
      type: 'exit',
      message: `${item.studentName} fue entregado(a) a ${item.requestedByName} a las ${formattedTime}.`,
      time: now,
      read: false,
      createdAt: now,
    }).catch(() => {});
  }
}
