/* Service Worker de Firebase Cloud Messaging.
   Recibe notificaciones push cuando la app está en segundo plano o cerrada. */
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyCnZByOl1iYLmrCR7bLGCHJr8utGNn8VT4',
  authDomain: 'mi-app-oliverio.firebaseapp.com',
  projectId: 'mi-app-oliverio',
  storageBucket: 'mi-app-oliverio.firebasestorage.app',
  messagingSenderId: '914121903348',
  appId: '1:914121903348:web:76fe263a57830914a1a2a1',
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const { title, body } = payload.notification || {};
  self.registration.showNotification(title || 'Colegio Oliverio Cromwell', {
    body: body || '',
    icon: '/favicon.svg',
    badge: '/favicon.svg',
    data: payload.data || {},
  });
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow('/'));
});
