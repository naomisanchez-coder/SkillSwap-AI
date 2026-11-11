import { createHash, timingSafeEqual } from 'node:crypto';
import { PublicError } from '../../errors/PublicError.js';

function verified(value, buffer) {
  const expected = Buffer.isBuffer(value.sha256) ? value.sha256 : Buffer.from(value.sha256);
  const actual = createHash('sha256').update(buffer).digest();
  return buffer.length === Number(value.size_bytes) && expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function createPrivateFileReader(storage) {
  if (!storage) throw new Error('Private storage required');
  return async metadata => {
    let buffer;
    try { buffer = await storage.read(metadata.storage_key, Number(metadata.size_bytes)); }
    catch { throw new PublicError('SERVICE_UNAVAILABLE'); }
    if (!verified(metadata, buffer)) throw new PublicError('SERVICE_UNAVAILABLE');
    return { buffer, mediaType: metadata.media_type };
  };
}
