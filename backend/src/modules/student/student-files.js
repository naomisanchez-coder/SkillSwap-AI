import { createHash } from 'node:crypto';
import { PublicError } from '../../errors/PublicError.js';

const activePdf = /\/(?:JavaScript|JS|OpenAction|AA|Launch|EmbeddedFile|RichMedia|XFA|AcroForm)\b/i;

function file(value, field, maximum) {
  if (!value || !Buffer.isBuffer(value.buffer) || value.buffer.length === 0 || value.buffer.length > maximum) {
    throw new PublicError('VALIDATION_ERROR', { [field]: `El archivo debe ocupar entre 1 byte y ${maximum / 1024 / 1024} MB.` });
  }
  return value;
}

function metadata(value, mediaType) {
  return { buffer: value.buffer, mediaType, size: value.buffer.length,
    sha256: createHash('sha256').update(value.buffer).digest() };
}

function jpegDimensions(data) {
  let offset = 2;
  while (offset + 4 < data.length) {
    if (data[offset] !== 0xff) return null;
    const marker = data[offset + 1];
    offset += 2;
    if (marker === 0xd9 || marker === 0xda) break;
    const size = data.readUInt16BE(offset);
    if (size < 2 || offset + size > data.length) return null;
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker) && size >= 7) {
      return { height: data.readUInt16BE(offset + 3), width: data.readUInt16BE(offset + 5) };
    }
    offset += size;
  }
  return null;
}

function pngDimensions(data) {
  if (data.length < 45 || data.readUInt32BE(8) !== 13 || data.subarray(12, 16).toString('ascii') !== 'IHDR' ||
      data.readUInt32BE(data.length - 12) !== 0 || data.subarray(data.length - 8, data.length - 4).toString('ascii') !== 'IEND') return null;
  return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
}

function webpDimensions(data) {
  if (data.length < 30 || data.subarray(0, 4).toString('ascii') !== 'RIFF' ||
      data.subarray(8, 12).toString('ascii') !== 'WEBP' || data.readUInt32LE(4) + 8 !== data.length ||
      data.subarray(12, 16).toString('ascii') !== 'VP8X') return null;
  const width = data.readUIntLE(24, 3) + 1, height = data.readUIntLE(27, 3) + 1;
  return { width, height };
}

function validDimensions(value) {
  return value && value.width >= 1 && value.height >= 1 && value.width <= 10000 && value.height <= 10000;
}

export function validatePhoto(value) {
  const input = file(value, 'photo', 2 * 1024 * 1024);
  const data = input.buffer;
  const jpeg = data.length >= 12 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff &&
    data.at(-2) === 0xff && data.at(-1) === 0xd9 ? jpegDimensions(data) : null;
  const png = data.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')) ? pngDimensions(data) : null;
  const webp = webpDimensions(data);
  const detected = validDimensions(jpeg) ? 'image/jpeg' : validDimensions(png) ? 'image/png' :
    validDimensions(webp) ? 'image/webp' : null;
  if (!detected || input.mediaType !== detected) {
    throw new PublicError('VALIDATION_ERROR', { photo: 'Usa una imagen JPG, PNG o WebP válida.' });
  }
  return metadata(input, detected);
}

export function validatePdf(value, field = 'certificate') {
  const input = file(value, field, 5 * 1024 * 1024);
  const data = input.buffer;
  const header = data.subarray(0, 8).toString('ascii');
  const tail = data.subarray(Math.max(0, data.length - 2048)).toString('latin1');
  const text = data.toString('latin1');
  if (input.mediaType !== 'application/pdf' || !/^%PDF-1\.[0-7]/.test(header) ||
      !/\d+\s+\d+\s+obj\b/.test(text) || !/\bendobj\b/.test(text) || !/%%EOF\s*$/.test(tail) || activePdf.test(text)) {
    throw new PublicError('VALIDATION_ERROR', { [field]: 'Usa un PDF válido y sin contenido activo.' });
  }
  return metadata(input, 'application/pdf');
}

export function validatePortfolioUrl(value) {
  if (value === undefined || value === '') return null;
  if (typeof value !== 'string' || value.length > 2048) {
    throw new PublicError('VALIDATION_ERROR', { portfolioUrl: 'Usa una URL HTTPS válida.' });
  }
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || !url.hostname || url.hash) throw new Error();
    return url.href;
  } catch { throw new PublicError('VALIDATION_ERROR', { portfolioUrl: 'Usa una URL HTTPS válida.' }); }
}
