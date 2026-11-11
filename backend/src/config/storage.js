import { isAbsolute, parse } from 'node:path';

export function readPrivateStorageConfig(source) {
  const root = source.PRIVATE_STORAGE_ROOT;
  if (!root) return undefined;
  if (typeof root !== 'string' || !isAbsolute(root) || parse(root).root === root || root.includes('\0')) {
    throw new Error('Invalid private storage configuration');
  }
  const readOnlyRoot = source.PRIVATE_STORAGE_READ_ONLY_ROOT;
  if (readOnlyRoot !== undefined && (typeof readOnlyRoot !== 'string' || !isAbsolute(readOnlyRoot) || parse(readOnlyRoot).root === readOnlyRoot || readOnlyRoot.includes('\0') || readOnlyRoot === root)) throw new Error('Invalid read-only private storage configuration');
  return Object.freeze({ root, ...(readOnlyRoot ? { readOnlyRoot } : {}) });
}
