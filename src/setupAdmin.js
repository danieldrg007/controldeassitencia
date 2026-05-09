// Run this script once to create the initial admin user
// Usage: Open browser console on localhost:5173 and paste this code
// Or import and call from a temporary component

import { auth, db } from './firebase.js';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';

export async function createAdminUser(email, password, displayName) {
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await setDoc(doc(db, 'users', cred.user.uid), {
      email,
      displayName,
      role: 'admin',
      createdAt: new Date().toISOString()
    });
    console.log('Admin created successfully:', cred.user.uid);
    return cred;
  } catch (err) {
    console.error('Error creating admin:', err);
    throw err;
  }
}
