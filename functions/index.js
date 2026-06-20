import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';

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
