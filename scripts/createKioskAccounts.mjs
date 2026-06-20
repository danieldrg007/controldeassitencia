// Crea (o repara) las cuentas de kiosko, una por plantel.
// Uso: node scripts/createKioskAccounts.mjs
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { getFirestore, doc, setDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyCnZByOl1iYLmrCR7bLGCHJr8utGNn8VT4',
  authDomain: 'mi-app-oliverio.firebaseapp.com',
  projectId: 'mi-app-oliverio',
  storageBucket: 'mi-app-oliverio.firebasestorage.app',
  messagingSenderId: '914121903348',
  appId: '1:914121903348:web:76fe263a57830914a1a2a1',
};

// Cuenta administradora (escribe los documentos de usuario).
const ADMIN_EMAIL = 'ricfirebase@gmail.com';
const ADMIN_PASSWORD = 'oliverio123$';

// Contraseña común de las tablets (cámbiala luego si quieres).
const KIOSK_PASSWORD = 'Kiosko2026$';

const KIOSKS = [
  { plantel: 'Xochimilco', email: 'kiosko.xochimilco@oliverio.edu.mx', displayName: 'Kiosko Xochimilco' },
  { plantel: 'Aztecas',    email: 'kiosko.aztecas@oliverio.edu.mx',    displayName: 'Kiosko Aztecas' },
  { plantel: 'Coyoacán',   email: 'kiosko.coyoacan@oliverio.edu.mx',   displayName: 'Kiosko Coyoacán' },
  { plantel: 'Tlalpan',    email: 'kiosko.tlalpan@oliverio.edu.mx',    displayName: 'Kiosko Tlalpan' },
];

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const secondaryApp = initializeApp(firebaseConfig, 'secondary');
const secondaryAuth = getAuth(secondaryApp);

async function run() {
  await signInWithEmailAndPassword(auth, ADMIN_EMAIL, ADMIN_PASSWORD);
  console.log('Admin autenticado:', auth.currentUser.email);

  for (const k of KIOSKS) {
    let uid;
    try {
      const cred = await createUserWithEmailAndPassword(secondaryAuth, k.email, KIOSK_PASSWORD);
      uid = cred.user.uid;
      console.log(`✔ Creada cuenta Auth ${k.email}`);
    } catch (e) {
      if (e.code === 'auth/email-already-in-use') {
        const cred = await signInWithEmailAndPassword(secondaryAuth, k.email, KIOSK_PASSWORD);
        uid = cred.user.uid;
        console.log(`• Ya existía ${k.email}, se actualizará su perfil`);
      } else {
        console.error(`✘ Error con ${k.email}:`, e.code || e.message);
        continue;
      }
    }

    await setDoc(doc(db, 'users', uid), {
      email: k.email,
      displayName: k.displayName,
      role: 'kiosk',
      plantel: k.plantel,
      createdAt: new Date().toISOString(),
    }, { merge: true });
    console.log(`  → Perfil kiosk (${k.plantel}) guardado para uid ${uid}`);

    await signOut(secondaryAuth);
  }

  console.log('\nListo. Credenciales:');
  for (const k of KIOSKS) console.log(`  ${k.plantel}: ${k.email}  /  ${KIOSK_PASSWORD}`);
  process.exit(0);
}

run().catch(e => { console.error('Fallo general:', e); process.exit(1); });
