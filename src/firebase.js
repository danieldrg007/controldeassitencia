import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { getMessaging, isSupported } from 'firebase/messaging';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: "AIzaSyBY4P5PbO0-AMLmvv91S32uwqVK3PDUbQE",
  authDomain: "registrodeentradas-6b134.firebaseapp.com",
  projectId: "registrodeentradas-6b134",
  storageBucket: "registrodeentradas-6b134.firebasestorage.app",
  messagingSenderId: "574168721122",
  appId: "1:574168721122:web:3a2da33348c620fc48a0bb",
  measurementId: "G-5Q956D2P6T"
};

const app = initializeApp(firebaseConfig);
const secondaryApp = initializeApp(firebaseConfig, "SecondaryApp");
export const db = getFirestore(app);
export const auth = getAuth(app);
export const secondaryAuth = getAuth(secondaryApp);
export const storage = getStorage(app);

export const getMessagingInstance = async () => {
  const supported = await isSupported();
  if (supported) return getMessaging(app);
  return null;
};

export default app;
