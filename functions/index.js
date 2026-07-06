/* global process */
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { onRequest, onCall, HttpsError } from 'firebase-functions/v2/https';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { MercadoPagoConfig, Preference, Payment } from 'mercadopago';
initializeApp();
const db = getFirestore();

// Envía un push a la lista de tokens y limpia los inválidos del usuario indicado.
async function sendToTokens(tokensByUser, notification, data = {}, link = '/') {
  const allTokens = [];
  for (const tokens of Object.values(tokensByUser)) allTokens.push(...tokens);
  const unique = [...new Set(allTokens)];
  if (unique.length === 0) return;

  const res = await getMessaging().sendEachForMulticast({
    tokens: unique,
    notification,
    data,
    webpush: { fcmOptions: { link } },
  });

  // Limpia tokens que ya no son válidos.
  const invalid = new Set();
  res.responses.forEach((r, i) => {
    if (!r.success) {
      const code = r.error?.code || '';
      if (code.includes('registration-token-not-registered') || code.includes('invalid-argument')) {
        invalid.add(unique[i]);
      }
    }
  });
  if (invalid.size === 0) return;

  await Promise.all(Object.entries(tokensByUser).map(async ([uid, tokens]) => {
    const toRemove = tokens.filter(t => invalid.has(t));
    if (toRemove.length === 0) return;
    const remaining = tokens.filter(t => !invalid.has(t));
    await db.doc(`users/${uid}`).update({ fcmTokens: remaining });
  }));
}

async function tokensForUser(uid) {
  const snap = await db.doc(`users/${uid}`).get();
  return Array.isArray(snap.data()?.fcmTokens) ? snap.data().fcmTokens : [];
}

// 1) Notificación individual al padre (entrada / salida / recogida).
export const onNotificationCreated = onDocumentCreated('notifications/{id}', async (event) => {
  const data = event.data?.data();
  if (!data?.parentId) return;
  const tokens = await tokensForUser(data.parentId);
  if (tokens.length === 0) return;

  await sendToTokens(
    { [data.parentId]: tokens },
    { title: 'Colegio Oliverio Cromwell', body: data.message || 'Tienes una nueva notificación.' },
    { type: data.type || 'info', studentId: data.studentId || '' }
  );
});

// 2) Aviso / anuncio: notifica a los padres según el alcance (todos / plantel / grupo).
export const onAnnouncementCreated = onDocumentCreated('announcements/{id}', async (event) => {
  const ann = event.data?.data();
  if (!ann?.scope) return;

  // Determina los padres destinatarios.
  const parentIds = new Set();
  if (ann.scope.type === 'all') {
    const snap = await db.collection('users').where('role', '==', 'parent').get();
    snap.forEach(d => parentIds.add(d.id));
  } else {
    const field = ann.scope.type === 'plantel' ? 'plantel' : 'classId';
    const snap = await db.collection('students').where(field, '==', ann.scope.value).get();
    snap.forEach(d => (d.data().parentIds || []).forEach(pid => parentIds.add(pid)));
  }
  if (parentIds.size === 0) return;

  // Junta los tokens de cada padre.
  const tokensByUser = {};
  await Promise.all([...parentIds].map(async (uid) => {
    const tokens = await tokensForUser(uid);
    if (tokens.length) tokensByUser[uid] = tokens;
  }));

  await sendToTokens(
    tokensByUser,
    { title: ann.title || 'Nuevo aviso', body: ann.body || '' },
    { type: 'announcement', scope: ann.scope.type }
  );
});

// 3) Mensaje de chat nuevo: notifica a los participantes (menos al remitente).
export const onChatMessageCreated = onDocumentCreated('conversations/{convId}/messages/{messageId}', async (event) => {
  const msg = event.data?.data();
  if (!msg?.senderId) return;

  const convId = event.params.convId;
  const convSnap = await db.doc(`conversations/${convId}`).get();
  const conv = convSnap.data();
  if (!conv?.participants?.length) return;

  const recipients = conv.participants.filter(uid => uid !== msg.senderId);
  if (recipients.length === 0) return;

  const tokensByUser = {};
  await Promise.all(recipients.map(async (uid) => {
    const tokens = await tokensForUser(uid);
    if (tokens.length) tokensByUser[uid] = tokens;
  }));

  const senderName = msg.senderName || 'Nuevo mensaje';
  const isGroup = conv.type === 'group';
  const title = isGroup ? (conv.title || 'Grupo') : senderName;
  const body = isGroup ? `${senderName}: ${msg.text || ''}` : (msg.text || '');

  await sendToTokens(
    tokensByUser,
    { title, body },
    { type: 'chat', conversationId: convId },
    '/messages'
  );
});

// 4) Notificación push en tiempo real cuando se crea un evento de calendario.
export const onEventCreated = onDocumentCreated('events/{id}', async (event) => {
  const ev = event.data?.data();
  if (!ev?.scope || !ev?.audiences) return;

  const targetUsers = new Set();
  const auds = ev.audiences;
  const isGeneral = auds.includes('general');
  const forParents = isGeneral || auds.includes('parent') || auds.includes('student');
  const forTeachers = isGeneral || auds.includes('teacher');

  const scopeType = ev.scope.type;
  const scopeValue = ev.scope.value;

  // Padres
  if (forParents) {
    if (scopeType === 'all') {
      const snap = await db.collection('users').where('role', '==', 'parent').get();
      snap.forEach(d => targetUsers.add(d.id));
    } else if (scopeType === 'plantel') {
      const snap = await db.collection('students').where('plantel', '==', scopeValue).get();
      snap.forEach(d => (d.data().parentIds || []).forEach(pid => targetUsers.add(pid)));
    } else if (scopeType === 'class') {
      const snap = await db.collection('students').where('classId', '==', scopeValue).get();
      snap.forEach(d => (d.data().parentIds || []).forEach(pid => targetUsers.add(pid)));
    }
  }

  // Maestros
  if (forTeachers) {
    if (scopeType === 'all') {
      const snap = await db.collection('users').where('role', '==', 'teacher').get();
      snap.forEach(d => targetUsers.add(d.id));
    } else if (scopeType === 'plantel') {
      const snap = await db.collection('users').where('role', '==', 'teacher').get();
      snap.forEach(d => {
        const u = d.data();
        const classIds = u.classIds || [];
        const hasPlantel = classIds.some(cid => cid.split('|')[0] === scopeValue);
        if (hasPlantel) targetUsers.add(d.id);
      });
    } else if (scopeType === 'class') {
      const snap = await db.collection('users').where('role', '==', 'teacher').where('classIds', 'array-contains', scopeValue).get();
      snap.forEach(d => targetUsers.add(d.id));
    }
  }

  // No notificar al autor
  if (ev.authorId) {
    targetUsers.delete(ev.authorId);
  }

  if (targetUsers.size === 0) return;

  const tokensByUser = {};
  await Promise.all([...targetUsers].map(async (uid) => {
    const tokens = await tokensForUser(uid);
    if (tokens.length) tokensByUser[uid] = tokens;
  }));

  const timeStr = ev.time ? ` a las ${ev.time}` : '';
  const body = `Fecha: ${ev.date}${timeStr}. ${ev.description || ''}`.trim();

  await sendToTokens(
    tokensByUser,
    { title: `Nuevo Evento: ${ev.title}`, body },
    { type: 'event', eventId: event.params.id },
    '/calendar'
  );
});

// Helper de visibilidad de eventos en backend
function canSeeEvent(ev, viewer) {
  const { role } = viewer;
  if (role === 'admin' || role === 'superadmin') return true;

  const auds = ev.audiences || [];
  let audienceOk = auds.length === 0 || auds.includes('general');
  if (!audienceOk) {
    if (role === 'parent') audienceOk = auds.includes('parent') || auds.includes('student');
    else if (role === 'teacher') audienceOk = auds.includes('teacher');
  }
  if (!audienceOk) return false;

  const sc = ev.scope || { type: 'all' };
  if (sc.type === 'all') return true;
  if (sc.type === 'plantel') return (viewer.planteles || []).includes(sc.value);
  if (sc.type === 'class') return (viewer.classIds || []).includes(sc.value);
  return false;
}

// Helpers para escape y formato iCalendar
function escapeIcsText(str) {
  if (!str) return '';
  return str
    .replace(/\\/g, '\\\\')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '');
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function generateIcs(events) {
  let ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Colegio Oliverio//NONSGML Calendar//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Calendario Oliverio',
    'X-WR-TIMEZONE:America/Mexico_City'
  ];

  for (const ev of events) {
    const dateClean = ev.date.replace(/-/g, '');
    let dtStart;
    let dtEnd;

    if (ev.time) {
      const [hours, minutes] = ev.time.split(':').map(Number);
      dtStart = `DTSTART;TZID=America/Mexico_City:${dateClean}T${pad2(hours)}${pad2(minutes)}00`;

      let endHours = hours + 1;
      let endDateClean = dateClean;
      if (endHours >= 24) {
        endHours = endHours - 24;
        const [y, m, d] = ev.date.split('-').map(Number);
        const dateObj = new Date(y, m - 1, d);
        dateObj.setDate(dateObj.getDate() + 1);
        endDateClean = `${dateObj.getFullYear()}${pad2(dateObj.getMonth() + 1)}${pad2(dateObj.getDate())}`;
      }
      dtEnd = `DTEND;TZID=America/Mexico_City:${endDateClean}T${pad2(endHours)}${pad2(minutes)}00`;
    } else {
      dtStart = `DTSTART;VALUE=DATE:${dateClean}`;
      const [y, m, d] = ev.date.split('-').map(Number);
      const dateObj = new Date(y, m - 1, d);
      dateObj.setDate(dateObj.getDate() + 1);
      const nextDateClean = `${dateObj.getFullYear()}${pad2(dateObj.getMonth() + 1)}${pad2(dateObj.getDate())}`;
      dtEnd = `DTEND;VALUE=DATE:${nextDateClean}`;
    }

    const stamp = ev.createdAt ? ev.createdAt.replace(/[-:]/g, '').split('.')[0] + 'Z' : '20260101T000000Z';

    ics.push('BEGIN:VEVENT');
    ics.push(`UID:${ev.id}@oliverio.edu.mx`);
    ics.push(`DTSTAMP:${stamp}`);
    ics.push(dtStart);
    ics.push(dtEnd);
    ics.push(`SUMMARY:${escapeIcsText(ev.title)}`);
    if (ev.description) {
      ics.push(`DESCRIPTION:${escapeIcsText(ev.description)}`);
    }
    if (ev.scopeLabel) {
      ics.push(`LOCATION:${escapeIcsText(ev.scopeLabel)}`);
    }
    ics.push('END:VEVENT');
  }

  ics.push('END:VCALENDAR');
  return ics.join('\r\n');
}

// 5) Endpoint HTTP para descargar el iCalendar feed personalizado (.ics)
export const calendarFeed = onRequest(async (req, res) => {
  try {
    const uid = req.query.uid;
    if (!uid) {
      res.status(400).send('Falta UID de usuario.');
      return;
    }

    const userSnap = await db.doc(`users/${uid}`).get();
    if (!userSnap.exists) {
      res.status(404).send('Usuario no encontrado.');
      return;
    }
    const userData = userSnap.data();
    const role = typeof userData.role === 'string' ? userData.role.trim().toLowerCase() : '';

    let viewer = { role, planteles: [], classIds: [] };

    if (role === 'teacher') {
      const classIds = Array.isArray(userData.classIds) ? userData.classIds : [];
      const planteles = [...new Set(classIds.map(c => c.split('|')[0]).filter(Boolean))];
      viewer.classIds = classIds;
      viewer.planteles = planteles;
    } else if (role === 'parent') {
      const studentsSnap = await db.collection('students').where('parentIds', 'array-contains', uid).get();
      const planteles = new Set();
      const classIds = new Set();
      studentsSnap.forEach(d => {
        const s = d.data();
        if (s.plantel) planteles.add(s.plantel);
        if (s.classId) classIds.add(s.classId);
      });
      viewer.planteles = [...planteles];
      viewer.classIds = [...classIds];
    }

    const eventsSnap = await db.collection('events').get();
    const allEvents = [];
    eventsSnap.forEach(d => {
      allEvents.push({ id: d.id, ...d.data() });
    });

    const visibleEvents = allEvents.filter(e => canSeeEvent(e, viewer));

    const icsContent = generateIcs(visibleEvents);

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="calendar.ics"');
    res.send(icsContent);
  } catch (err) {
    console.error('Error generating calendar feed:', err);
    res.status(500).send('Error interno del servidor.');
  }
});

// 6) Endpoint para crear preferencia de pago de Mercado Pago
export const createWorkshopPreference = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
  }

  const { enrollmentId } = request.data;
  if (!enrollmentId) {
    throw new HttpsError('invalid-argument', 'Falta el enrollmentId.');
  }

  try {
    const snap = await db.doc(`workshopEnrollments/${enrollmentId}`).get();
    if (!snap.exists) {
      throw new HttpsError('not-found', 'Inscripción no encontrada.');
    }
    const enr = snap.data();
    if (enr.paymentStatus === 'paid') {
      throw new HttpsError('failed-precondition', 'Esta inscripción ya está pagada.');
    }

    const token = process.env.MERCADOPAGO_ACCESS_TOKEN || 'TEST-TOKEN-PENDIENTE';
    const baseUrl = 'https://mi-app-oliverio.web.app';

    // MODO SIMULADOR: Si aún no tenemos el token real, redirigir al simulador visual
    if (token === 'TEST-TOKEN-PENDIENTE' || token === 'SIMULACION') {
      const simUrl = `${baseUrl}/payment-simulator?eid=${enrollmentId}&name=${encodeURIComponent(enr.workshopName || '')}&student=${encodeURIComponent(enr.studentName || '')}&amount=${enr.cost || 0}`;
      return { init_point: simUrl };
    }

    const client = new MercadoPagoConfig({ accessToken: token });
    const preference = new Preference(client);

    const body = {
      items: [
        {
          id: enr.workshopId,
          title: `Taller: ${enr.workshopName} (${enr.studentName})`,
          quantity: 1,
          unit_price: Number(enr.cost) || 0,
          currency_id: 'MXN'
        }
      ],
      back_urls: {
        success: `${baseUrl}/workshops`,
        failure: `${baseUrl}/workshops`,
        pending: `${baseUrl}/workshops`
      },
      auto_return: 'approved',
      external_reference: enrollmentId
      // notification_url se puede configurar en el dashboard de MP o definir mediante: process.env.MP_WEBHOOK_URL
    };
    if (process.env.MP_WEBHOOK_URL) {
      body.notification_url = process.env.MP_WEBHOOK_URL;
    }

    const response = await preference.create({ body });
    return { init_point: response.init_point };

  } catch (error) {
    console.error('Error creating MP preference:', error);
    throw new HttpsError('internal', 'Error al crear el pago.');
  }
});

// 6b) Confirmar pago simulado (llamado por el simulador visual del frontend)
export const confirmSimulatedPayment = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
  }

  const { enrollmentId, method } = request.data;
  if (!enrollmentId) {
    throw new HttpsError('invalid-argument', 'Falta el enrollmentId.');
  }

  try {
    const snap = await db.doc(`workshopEnrollments/${enrollmentId}`).get();
    if (!snap.exists) {
      throw new HttpsError('not-found', 'Inscripción no encontrada.');
    }
    const enr = snap.data();
    if (enr.paymentStatus === 'paid') {
      throw new HttpsError('failed-precondition', 'Esta inscripción ya está pagada.');
    }
    // Verificar que el usuario es el dueño de la inscripción
    if (enr.parentId !== request.auth.uid) {
      throw new HttpsError('permission-denied', 'No tienes permiso para confirmar este pago.');
    }

    await db.doc(`workshopEnrollments/${enrollmentId}`).update({
      paymentStatus: 'paid',
      paymentMethod: `mercadopago (simulado - ${method || 'tarjeta'})`,
      paidAt: new Date().toISOString(),
      paidRegisteredBy: 'Simulador Mercado Pago',
    });

    return { success: true };
  } catch (error) {
    if (error.code) throw error; // Re-throw HttpsError
    console.error('Error confirming simulated payment:', error);
    throw new HttpsError('internal', 'Error al confirmar el pago.');
  }
});

// 7) Webhook de Mercado Pago para procesar notificaciones
export const mercadoPagoWebhook = onRequest(async (req, res) => {
  try {
    const topic = req.query.topic || req.body?.type;
    const id = req.query['data.id'] || req.body?.data?.id;

    if ((topic === 'payment' || topic === 'payment.created' || topic === 'payment.updated') && id) {
      const token = process.env.MERCADOPAGO_ACCESS_TOKEN || 'TEST-TOKEN-PENDIENTE';
      const client = new MercadoPagoConfig({ accessToken: token });
      const paymentClient = new Payment(client);

      const p = await paymentClient.get({ id });
      
      if (p.status === 'approved' && p.external_reference) {
        const enrollmentId = p.external_reference;
        
        await db.doc(`workshopEnrollments/${enrollmentId}`).update({
          paymentStatus: 'paid',
          paymentMethod: 'mercadopago',
          paidAt: new Date().toISOString(),
          paymentId: String(id),
          paidRegisteredBy: 'Mercado Pago Webhook'
        });
      }
    }
    
    // MP requiere un HTTP 200 OK rápido
    res.status(200).send('OK');
  } catch (err) {
    console.error('Error in MP webhook:', err);
    res.status(500).send('Error interno.');
  }
});
