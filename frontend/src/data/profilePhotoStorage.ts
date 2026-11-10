const DB_NAME = 'skillswap_prototype_files';
const DB_VERSION = 3;
const STORE_NAME = 'profile_photos';

/** Solo se usa para compensar un archivo nuevo cuyo enlace de metadatos no se pudo guardar. */
export async function removeProfilePhoto(id: string): Promise<void> {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(new Error('No se pudo retirar el archivo sin enlazar.'));
      transaction.onabort = () => reject(new Error('Se interrumpió la limpieza del archivo sin enlazar.'));
      transaction.objectStore(STORE_NAME).delete(id);
    });
  } finally { database.close(); }
}

export const MAX_PROFILE_PHOTO_SIZE = 2 * 1024 * 1024;
export const ACCEPTED_PROFILE_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

type StoredProfilePhoto = {
  id: string;
  userId: string;
  blob: Blob;
  type: string;
  size: number;
  updatedAt: string;
};

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('IndexedDB no está disponible.'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    let blocked = false;
    request.onblocked = () => { blocked = true; reject(new Error('Cierra otras pestañas y vuelve a intentar guardar la fotografía.')); };
    request.onsuccess = () => { const db = request.result; if (blocked) { db.close(); return; } db.onversionchange = () => db.close(); resolve(db); };
    request.onerror = () => reject(request.error ?? new Error('No se pudo abrir el almacenamiento local.'));
  });
}

export function validateProfilePhoto(file: File): string | null {
  if (!ACCEPTED_PROFILE_PHOTO_TYPES.includes(file.type)) {
    return 'Selecciona una imagen JPG, PNG o WebP.';
  }
  if (file.size === 0) return 'La fotografía está vacía.';
  if (file.size > MAX_PROFILE_PHOTO_SIZE) {
    return 'La fotografía no debe superar 2 MB.';
  }
  return null;
}

export async function saveProfilePhoto(userId: string, file: File): Promise<string> {
  const error = validateProfilePhoto(file);
  if (error) throw new Error(error);
  const bitmap = await createImageBitmap(file).catch(() => { throw new Error('El contenido del archivo no es una imagen válida.'); });
  bitmap.close();
  const database = await openDatabase();
  const id = `profile-photo-${userId}-${crypto.randomUUID()}`;
  const value: StoredProfilePhoto = {
    id,
    userId,
    blob: file,
    type: file.type,
    size: file.size,
    updatedAt: new Date().toISOString(),
  };
  try { await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).put(value);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(new Error('No se pudo guardar la fotografía en este navegador.'));
    transaction.onabort = () => reject(new Error('Se interrumpió el guardado de la fotografía.'));
  }); } finally { database.close(); }
  return id;
}

export async function getProfilePhoto(id: string): Promise<Blob | null> {
  if (!id) return null;
  const database = await openDatabase();
  try {
  const result = await new Promise<StoredProfilePhoto | null>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readonly');
    const request = transaction.objectStore(STORE_NAME).get(id);
    transaction.oncomplete = () => resolve((request.result as StoredProfilePhoto | undefined) ?? null);
    transaction.onerror = () => reject(new Error('No se pudo recuperar la fotografía de este navegador.'));
    transaction.onabort = () => reject(new Error('Se interrumpió la recuperación de la fotografía.'));
  });
  if (!result) return null;
  if (!(result.blob instanceof Blob) || !result.blob.size || result.blob.size > MAX_PROFILE_PHOTO_SIZE || !ACCEPTED_PROFILE_PHOTO_TYPES.includes(result.blob.type)) throw new Error('La fotografía guardada no se puede abrir.');
  const bitmap = await createImageBitmap(result.blob).catch(() => { throw new Error('La fotografía guardada no se puede abrir.'); });
  bitmap.close();
  return result.blob;
  } finally { database.close(); }
}
