export const previewLogoutKey = 'skillswap:frontend:logout-version';
const roleKey = 'skillswap:frontend:preview-role';
const epochKey = 'skillswap:frontend:preview-epoch';
const transientKeys = [roleKey, epochKey, 'skillswap:frontend:admin-access', 'skillswap:frontend:admin-section', 'skillswap:frontend:page', 'skillswap:frontend-demo:booking-route:v1'];
type StoragePort = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
/** Marca de salida de prueba, nunca una credencial. No elimina información de la cuenta. */
export function createPreviewAccess(storage: StoragePort, session: StoragePort) {
  const read = (): 'student' | 'admin' | 'public' => {
    const epoch = storage.getItem(previewLogoutKey);
    const role = session.getItem(roleKey);
    if (role === 'student' || role === 'admin') return session.getItem(epochKey) === (epoch ?? 'initial') ? role : 'public';
    return epoch === null ? 'student' : 'public';
  };
  const clear = () => { for (const key of transientKeys) session.removeItem(key); };
  return {
    read, clear,
    enter(role: 'student' | 'admin') { session.setItem(epochKey, storage.getItem(previewLogoutKey) ?? 'initial'); session.setItem(roleKey, role); },
    logout() { storage.setItem(previewLogoutKey, crypto.randomUUID()); clear(); },
  };
}
export const previewAccess = () => createPreviewAccess(localStorage, sessionStorage);
