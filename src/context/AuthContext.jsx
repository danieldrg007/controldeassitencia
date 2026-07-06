import { createContext, useContext, useState, useEffect } from 'react';
import { auth, db } from '../firebase';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut, createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';

const AuthContext = createContext();
// eslint-disable-next-line react-refresh/only-export-components -- el hook vive junto al provider a propósito; solo afecta el Fast Refresh en desarrollo.
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // El perfil se escucha en tiempo real: si la administración suspende el
    // acceso (o cambia el rol), la app reacciona sin necesidad de recargar.
    let unsubDoc = null;
    const unsub = onAuthStateChanged(auth, (firebaseUser) => {
      if (unsubDoc) { unsubDoc(); unsubDoc = null; }
      if (firebaseUser) {
        setUser(firebaseUser);
        unsubDoc = onSnapshot(doc(db, 'users', firebaseUser.uid), (snap) => {
          if (snap.exists()) setUserData(snap.data());
          setLoading(false);
        }, (e) => { console.error(e); setLoading(false); });
      } else {
        setUser(null);
        setUserData(null);
        setLoading(false);
      }
    });
    return () => { if (unsubDoc) unsubDoc(); unsub(); };
  }, []);

  const login = (email, password) => signInWithEmailAndPassword(auth, email, password);

  const register = async (email, password, data) => {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await setDoc(doc(db, 'users', cred.user.uid), {
      email, ...data, createdAt: new Date().toISOString()
    });
    return cred;
  };

  const logout = () => signOut(auth);

  return (
    <AuthContext.Provider value={{ user, userData, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
