import { isAbsolute, parse } from 'node:path';

export function readPrivateStorageConfig(source) {
  const root = source.PRIVATE_STORAGE_ROOT;
  if (!root) return undefined;
  if (typeof root !== 'string' || !isAbsolute(root) || parse(root).root === root || root.includes('\0')) {
    throw new Error('Invalid private storage configuration');
  }
  return Object.freeze({ root });
}
