// Registro de notificaciones push (Firebase Cloud Messaging) para la web.
import { getToken, onMessage } from 'firebase/messaging';
import { doc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { db, getMessagingInstance } from './firebase';

// Clave VAPID del proyecto: Firebase Console → Configuración del proyecto →
// Cloud Messaging → "Certificados push web". Ponla en .env como VITE_FCM_VAPID_KEY.
const VAPID_KEY = import.meta.env.VITE_FCM_VAPID_KEY || '';

let swRegistration = null;
async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return null;
  if (swRegistration) return swRegistration;
  swRegistration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
  return swRegistration;
}

// Pide permiso, obtiene el token FCM y lo guarda en users/{uid}.fcmTokens.
// Devuelve { ok, token, error }.
export async function enablePushNotifications(uid) {
  try {
    if (!VAPID_KEY) return { ok: false, error: 'Falta configurar VITE_FCM_VAPID_KEY.' };
    const messaging = await getMessagingInstance();
    if (!messaging) return { ok: false, error: 'Este navegador no soporta notificaciones push.' };

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return { ok: false, error: 'Permiso de notificaciones denegado.' };

    const registration = await registerServiceWorker();
    const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: registration });
    if (!token) return { ok: false, error: 'No se pudo obtener el token de notificaciones.' };

    await updateDoc(doc(db, 'users', uid), { fcmTokens: arrayUnion(token) });
    return { ok: true, token };
  } catch (e) {
    console.error('enablePushNotifications', e);
    return { ok: false, error: e.message };
  }
}

// Quita el token actual (al cerrar sesión o desactivar).
export async function disablePushNotifications(uid) {
  try {
    const messaging = await getMessagingInstance();
    if (!messaging || !VAPID_KEY) return;
    const registration = await registerServiceWorker();
    const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: registration });
    if (token) await updateDoc(doc(db, 'users', uid), { fcmTokens: arrayRemove(token) });
  } catch (e) { console.error('disablePushNotifications', e); }
}

// Escucha mensajes en primer plano (app abierta). Devuelve la función de desuscripción.
export async function listenForegroundMessages(handler) {
  const messaging = await getMessagingInstance();
  if (!messaging) return () => {};
  return onMessage(messaging, handler);
}
