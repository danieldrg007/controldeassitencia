/* global __APP_VERSION__ */
// Versión de este build, inyectada por Vite (ver vite.config.js).
// En `vite dev` no existe define del build de producción, por eso el fallback.
export const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';

// Consulta la versión realmente desplegada (dist/version.json), siempre sin caché.
// Devuelve null si no se pudo leer (p. ej. en desarrollo no existe el archivo).
export async function fetchLatestVersion() {
  try {
    const res = await fetch('/version.json?_=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.version || null;
  } catch {
    return null;
  }
}

// Limpia service workers y la Cache Storage del navegador.
async function clearCachesAndSW() {
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r => r.unregister()));
    }
  } catch (e) { console.warn('No se pudo desregistrar el service worker:', e); }
  try {
    if (window.caches) {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    }
  } catch (e) { console.warn('No se pudo limpiar la caché:', e); }
}

// Fuerza traer la última versión: limpia caché + SW y recarga desde el servidor.
export async function forceUpdate() {
  await clearCachesAndSW();
  window.location.reload();
}
