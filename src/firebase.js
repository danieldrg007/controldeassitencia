import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { getMessaging, isSupported } from 'firebase/messaging';
import { getStorage } from 'firebase/storage';
import { getAnalytics } from 'firebase/analytics';

// Config desde variables de entorno (VITE_FIREBASE_*). Se mantienen los valores
// actuales como respaldo para no romper si el .env no está presente.
const env = import.meta.env;
const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY || "AIzaSyCnZByOl1iYLmrCR7bLGCHJr8utGNn8VT4",
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || "mi-app-oliverio.firebaseapp.com",
  projectId: env.VITE_FIREBASE_PROJECT_ID || "mi-app-oliverio",
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || "mi-app-oliverio.firebasestorage.app",
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || "914121903348",
  appId: env.VITE_FIREBASE_APP_ID || "1:914121903348:web:76fe263a57830914a1a2a1",
  measurementId: env.VITE_FIREBASE_MEASUREMENT_ID || "G-DTQ2VFT547"
};

const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
import { getFunctions } from 'firebase/functions';
const secondaryApp = initializeApp(firebaseConfig, "SecondaryApp");
export const db = getFirestore(app);
export const auth = getAuth(app);
export const secondaryAuth = getAuth(secondaryApp);
export const storage = getStorage(app);
export const functions = getFunctions(app);
export { analytics };

export const getMessagingInstance = async () => {
  const supported = await isSupported();
  if (supported) return getMessaging(app);
  return null;
};

export default app;
