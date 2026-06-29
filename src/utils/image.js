// Convierte un archivo de imagen a un dataURL JPEG redimensionado.
// Pensado para fotos tipo credencial que se guardan dentro de un documento de
// Firestore (no en Storage): a 320px y calidad 0.82 quedan en ~20-40KB, muy
// por debajo del límite de 1MB por documento.
export function fileToResizedDataURL(file, maxSize = 320, quality = 0.82) {
  return new Promise((resolve, reject) => {
    if (!file) { reject(new Error('No se recibió ningún archivo.')); return; }
    if (!file.type.startsWith('image/')) { reject(new Error('El archivo no es una imagen.')); return; }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('No se pudo leer el archivo.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('No se pudo cargar la imagen.'));
      img.onload = () => {
        let { width, height } = img;
        const scale = Math.min(1, maxSize / Math.max(width, height));
        width = Math.max(1, Math.round(width * scale));
        height = Math.max(1, Math.round(height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

// Igual que fileToResizedDataURL pero devuelve un Blob JPEG, pensado para subir
// a Firebase Storage (portadas de avisos): más grande (1200px por defecto) y
// sin el overhead de base64.
export function fileToResizedBlob(file, maxSize = 1200, quality = 0.82) {
  return new Promise((resolve, reject) => {
    if (!file) { reject(new Error('No se recibió ningún archivo.')); return; }
    if (!file.type.startsWith('image/')) { reject(new Error('El archivo no es una imagen.')); return; }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('No se pudo leer el archivo.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('No se pudo cargar la imagen.'));
      img.onload = () => {
        let { width, height } = img;
        const scale = Math.min(1, maxSize / Math.max(width, height));
        width = Math.max(1, Math.round(width * scale));
        height = Math.max(1, Math.round(height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => blob ? resolve(blob) : reject(new Error('No se pudo procesar la imagen.')),
          'image/jpeg',
          quality,
        );
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
