// Valida qué profesores del Excel FALTAN por crear (no están en Firestore users).
// Uso: ADMIN_EMAIL=... ADMIN_PASS=... FILE="ruta.xlsx" node scripts/validateMissing.mjs
import { readFileSync } from 'node:fs';
import * as XLSXns from 'xlsx';
const XLSX = XLSXns.read ? XLSXns : XLSXns.default;
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

const cfg = { apiKey: 'AIzaSyCnZByOl1iYLmrCR7bLGCHJr8utGNn8VT4', authDomain: 'mi-app-oliverio.firebaseapp.com', projectId: 'mi-app-oliverio', storageBucket: 'mi-app-oliverio.firebasestorage.app', messagingSenderId: '914121903348', appId: '1:914121903348:web:76fe263a57830914a1a2a1' };

const norm = (s) => (typeof s === 'string' ? s : String(s ?? '')).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const isEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e || '');
const TEACHER_RX = /maestr|docente|profesor/i;

// ── Parsear Excel ──
const wb = XLSX.read(readFileSync(process.env.FILE), { type: 'buffer' });
const ws = wb.Sheets[wb.SheetNames[0]];
const raw = XLSX.utils.sheet_to_json(ws, { defval: '' });
const keys = Object.keys(raw[0] || {});
const find = (...c) => { const cands = c.map(norm); return keys.find((k) => cands.includes(norm(k))) || null; };
const map = {
  nombre: find('nombre'), apPat: find('apellido paterno'), apMat: find('apellido materno'),
  correoInst: find('correo institucional'), correoPers: find('correo personal'),
  puesto: find('puesto'), plantel: find('plantel'), estado: find('estado'),
};

const records = raw.map((r) => {
  const displayName = [map.nombre && r[map.nombre], map.apPat && r[map.apPat], map.apMat && r[map.apMat]].map((x) => String(x ?? '').trim()).filter(Boolean).join(' ');
  const correo = (map.correoInst && r[map.correoInst]) || (map.correoPers && r[map.correoPers]) || '';
  const email = String(correo).trim().toLowerCase();
  const puesto = map.puesto ? String(r[map.puesto] ?? '').trim() : '';
  const estado = map.estado ? String(r[map.estado] ?? '').trim() : '';
  return { displayName, email, puesto, estado };
}).filter((r) => r.email || r.displayName);

// Candidatos a profesor: correo válido + (sin columna puesto o puesto de maestro) + no inactivo.
const candidates = records.filter((r) => isEmail(r.email) && (!map.puesto || TEACHER_RX.test(r.puesto)) && norm(r.estado) !== 'inactivo');
const noEmail = records.filter((r) => !isEmail(r.email));

// ── Existentes en Firestore ──
const app = initializeApp(cfg);
await signInWithEmailAndPassword(getAuth(app), process.env.ADMIN_EMAIL, process.env.ADMIN_PASS);
const snap = await getDocs(collection(getFirestore(app), 'users'));
const existing = new Set();
snap.forEach((d) => { const e = d.data().email; if (e) existing.add(norm(e)); });

// ── Comparar ──
const missing = candidates.filter((r) => !existing.has(norm(r.email)));
const already = candidates.filter((r) => existing.has(norm(r.email)));

console.log(`\nFilas en Excel: ${records.length}`);
console.log(`Candidatos a profesor (correo válido): ${candidates.length}`);
console.log(`  · Ya existen en el sistema: ${already.length}`);
console.log(`  · FALTAN por crear:        ${missing.length}`);
if (noEmail.length) console.log(`Filas sin correo válido (se ignoran): ${noEmail.length}`);
console.log(`\n=== FALTANTES (${missing.length}) ===`);
missing.forEach((r, i) => console.log(`${String(i + 1).padStart(3)}. ${r.email}  —  ${r.displayName}`));
process.exit(0);
