const DB_NAME = 'skillswap_mentor_evidence';
const DB_VERSION = 1;
const STORE_NAME = 'pdf_documents';

/** Solo se usa para compensar un archivo nuevo cuyo enlace de metadatos no se pudo guardar. */
export async function removeEvidencePdf(id: string): Promise<void> {
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

export const MAX_EVIDENCE_PDF_SIZE = 5 * 1024 * 1024;

type EvidenceDocument = {
  id: string;
  name: string;
  blob: Blob;
  createdAt: string;
};

// Los documentos pertenecen a este navegador y origen. No hay almacenamiento en servidor.
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('Este navegador no permite guardar la evidencia PDF.'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    let blocked = false;
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onerror = () => reject(new Error('No se pudo acceder al almacenamiento local de documentos.'));
    request.onblocked = () => {
      blocked = true;
      reject(new Error('Cierra otras pestañas de SkillSwap y vuelve a intentar adjuntar el PDF.'));
    };
    request.onsuccess = () => {
      const database = request.result;
      if (blocked) {
        database.close();
        return;
      }
      database.onversionchange = () => database.close();
      resolve(database);
    };
  });
}

export async function validateEvidencePdf(file: File): Promise<string | null> {
  if (!file.name.toLowerCase().endsWith('.pdf')) {
    return 'Adjunta un documento con extensión .pdf.';
  }
  if (file.type && file.type !== 'application/pdf' && file.type !== 'application/octet-stream') {
    return 'El archivo seleccionado no tiene un formato PDF compatible.';
  }
  if (file.size === 0) return 'El documento PDF está vacío.';
  if (file.size > MAX_EVIDENCE_PDF_SIZE) return 'El PDF debe pesar como máximo 5 MB.';
  try {
    const header = new TextDecoder().decode(await file.slice(0, 8).arrayBuffer());
    // Comprueba la firma del formato. La visualización puede detectar daños adicionales.
    if (!/^%PDF-[12]\.\d/.test(header)) {
      return 'El contenido del archivo no corresponde a un documento PDF.';
    }
  } catch {
    return 'No se pudo leer el PDF. Selecciónalo nuevamente.';
  }
  return null;
}

export async function saveEvidencePdf(file: File): Promise<string> {
  const validationError = await validateEvidencePdf(file);
  if (validationError) throw new Error(validationError);
  const id = 'evidence-' + crypto.randomUUID();
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(new Error('No se pudo guardar el PDF. Comprueba el espacio disponible en este navegador.'));
      transaction.onabort = () => reject(new Error('Se interrumpió el guardado del PDF. Vuelve a adjuntarlo.'));
      const document: EvidenceDocument = {
        id,
        name: file.name,
        blob: file.slice(0, file.size, 'application/pdf'),
        createdAt: new Date().toISOString(),
      };
      transaction.objectStore(STORE_NAME).add(document);
    });
    return id;
  } finally {
    database.close();
  }
}

export async function getEvidencePdf(id: string): Promise<Blob | null> {
  if (!id) return null;
  const database = await openDatabase();
  try {
    const blob = await new Promise<Blob | null>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readonly');
      const request = transaction.objectStore(STORE_NAME).get(id);
      transaction.onerror = () => reject(new Error('No se pudo recuperar el PDF de este navegador.'));
      transaction.onabort = () => reject(new Error('Se interrumpió la recuperación del PDF. Inténtalo nuevamente.'));
      transaction.oncomplete = () => {
        const document = request.result as EvidenceDocument | undefined;
        if (!document) {
          resolve(null);
          return;
        }
        if (!(document.blob instanceof Blob) || document.blob.size === 0) {
          reject(new Error('La evidencia guardada no se puede abrir. Solicita que se adjunte nuevamente.'));
          return;
        }
        resolve(document.blob);
      };
    });
    if (blob && (blob.size > MAX_EVIDENCE_PDF_SIZE || !/^%PDF-[12]\.\d/.test(new TextDecoder().decode(await blob.slice(0, 8).arrayBuffer())))) throw new Error('El PDF guardado está dañado y no se puede abrir. Adjunta nuevamente el documento.');
    return blob;
  } finally {
    database.close();
  }
}
