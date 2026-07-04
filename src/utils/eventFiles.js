// Subida y borrado de adjuntos de eventos del calendario en Firebase Storage.
// Ruta: events/{eventId}/{archivo}  (misma política que los avisos)
import { ref, uploadBytes, getDownloadURL, deleteObject, listAll } from 'firebase/storage';
import { storage } from '../firebase';

const sanitize = (name) => (name || 'archivo').replace(/[^\w.-]+/g, '_');

export async function uploadEventFile(eventId, file) {
  const path = `events/${eventId}/${Date.now()}_${sanitize(file.name)}`;
  const r = ref(storage, path);
  await uploadBytes(r, file, { contentType: file.type || 'application/octet-stream' });
  const url = await getDownloadURL(r);
  return { name: file.name, url, path, type: file.type || '', size: file.size || 0 };
}

export async function deleteEventFiles(eventId) {
  try {
    const folder = ref(storage, `events/${eventId}`);
    const res = await listAll(folder);
    await Promise.all(res.items.map((item) => deleteObject(item).catch(() => {})));
  } catch (e) {
    console.warn('No se pudieron borrar los archivos del evento', e);
  }
}
