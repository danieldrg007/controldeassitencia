// Subida y borrado de adjuntos de avisos en Firebase Storage.
// Ruta: announcements/{announcementId}/{archivo}
import { ref, uploadBytes, getDownloadURL, deleteObject, listAll } from 'firebase/storage';
import { storage } from '../firebase';
import { fileToResizedBlob } from './image';

const sanitize = (name) => (name || 'archivo').replace(/[^\w.-]+/g, '_');

// Sube un archivo cualquiera (PDF, imagen, doc...) y devuelve su metadata.
export async function uploadAnnouncementFile(announcementId, file) {
  const path = `announcements/${announcementId}/${Date.now()}_${sanitize(file.name)}`;
  const r = ref(storage, path);
  await uploadBytes(r, file, { contentType: file.type || 'application/octet-stream' });
  const url = await getDownloadURL(r);
  return { name: file.name, url, path, type: file.type || '', size: file.size || 0 };
}

// Sube una imagen de portada (la redimensiona/comprime antes).
export async function uploadAnnouncementCover(announcementId, file) {
  const blob = await fileToResizedBlob(file, 1200, 0.82);
  const path = `announcements/${announcementId}/cover_${Date.now()}.jpg`;
  const r = ref(storage, path);
  await uploadBytes(r, blob, { contentType: 'image/jpeg' });
  const url = await getDownloadURL(r);
  return { url, path };
}

// Borra TODOS los archivos de un aviso (portada + adjuntos). Robusto: lista la
// carpeta completa para no dejar huérfanos aunque la metadata esté incompleta.
export async function deleteAnnouncementFiles(announcementId) {
  try {
    const folder = ref(storage, `announcements/${announcementId}`);
    const res = await listAll(folder);
    await Promise.all(res.items.map((item) => deleteObject(item).catch(() => {})));
  } catch (e) {
    console.warn('No se pudieron borrar los archivos del aviso', e);
  }
}

export const fileKind = (type = '', name = '') => {
  const t = type.toLowerCase();
  const n = name.toLowerCase();
  if (t.includes('pdf') || n.endsWith('.pdf')) return 'pdf';
  if (t.startsWith('image/')) return 'image';
  if (t.includes('word') || /\.docx?$/.test(n)) return 'word';
  if (t.includes('sheet') || t.includes('excel') || /\.xlsx?$/.test(n)) return 'excel';
  return 'file';
};

export const humanSize = (bytes = 0) => {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};
