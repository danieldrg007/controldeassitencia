// Registro de notificaciones push (Firebase Cloud Messaging) para la web.
import { getToken, onMessage } from 'firebase/messaging';
import { doc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { db, getMessagingInstance } from './firebase';

// Clave VAPID del proyecto: Firebase Console → Configuración del proyecto →
// Cloud Messaging → "Certificados push web". Ponla en .env como VITE_FCM_VAPID_KEY.
const VAPID_KEY = import.meta.env.VITE_FCM_VAPID_KEY || '';

// Registra el service worker de FCM y ESPERA a que esté activo.
// pushManager.subscribe() (dentro de getToken) falla con AbortError
// "no active Service Worker" si se llama antes de que el SW se active.
async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return null;
  const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
  // navigator.serviceWorker.ready resuelve cuando hay un SW activo en el scope.
  await navigator.serviceWorker.ready;
  // Si por carrera 'ready' resolvió con otro registro, devolvemos el activo correcto.
  return registration.active ? registration : (await navigator.serviceWorker.ready);
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
    // Errores del servicio de push del navegador (no de la app): suelen ocurrir en
    // escritorios sin servicios de Google, navegadores/redes que bloquean el push,
    // modo incógnito o iOS sin la app instalada en la pantalla de inicio.
    const isPushServiceError = e?.name === 'AbortError' || /push service|Registration failed|no active Service Worker/i.test(e?.message || '');
    if (isPushServiceError) {
      console.warn('Push no disponible en este navegador/dispositivo:', e?.message || e);
      return { ok: false, error: 'Tu navegador o dispositivo no permitió activar las notificaciones push. Prueba en otro navegador o, en iPhone, agrega la app a la pantalla de inicio.' };
    }
    console.warn('enablePushNotifications:', e?.message || e);
    return { ok: false, error: e?.message || 'No se pudieron activar las notificaciones.' };
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
