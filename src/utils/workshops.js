import { ref, uploadBytes, getDownloadURL, deleteObject, listAll } from 'firebase/storage';
import { storage } from '../firebase';
import { fileToResizedBlob } from './image';

const sanitize = (name) => (name || 'archivo').replace(/[^\w.-]+/g, '_');

// Sube un archivo cualquiera (PDF, imagen, doc...) al taller y devuelve su metadata.
export async function uploadWorkshopFile(workshopId, file) {
  const path = `workshops/${workshopId}/${Date.now()}_${sanitize(file.name)}`;
  const r = ref(storage, path);
  await uploadBytes(r, file, { contentType: file.type || 'application/octet-stream' });
  const url = await getDownloadURL(r);
  return { name: file.name, url, path, type: file.type || '', size: file.size || 0 };
}

// Sube una imagen de portada al taller (la redimensiona/comprime antes).
export async function uploadWorkshopCover(workshopId, file) {
  const blob = await fileToResizedBlob(file, 1200, 0.82);
  const path = `workshops/${workshopId}/cover_${Date.now()}.jpg`;
  const r = ref(storage, path);
  await uploadBytes(r, blob, { contentType: 'image/jpeg' });
  const url = await getDownloadURL(r);
  return { url, path };
}

// Borra TODOS los archivos de un taller (portada + adjuntos). Robusto: lista la
// carpeta completa para no dejar huérfanos aunque la metadata esté incompleta.
export async function deleteWorkshopFiles(workshopId) {
  try {
    const folder = ref(storage, `workshops/${workshopId}`);
    const res = await listAll(folder);
    await Promise.all(res.items.map((item) => deleteObject(item).catch(() => {})));
  } catch (e) {
    console.warn('No se pudieron borrar los archivos del taller', e);
  }
}
