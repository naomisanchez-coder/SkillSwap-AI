import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePdf, validatePhoto, validatePortfolioUrl } from '../src/modules/student/student-files.js';

const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<<>>\n%%EOF');
const png = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.from('0000000d49484452', 'hex'),
  Buffer.alloc(17), Buffer.from('0000000049454e4400000000', 'hex')]);
png.writeUInt32BE(1, 16); png.writeUInt32BE(1, 20);

test('PDF validation checks content, MIME, size and rejects active structures', () => {
  const result = validatePdf({ buffer: pdf, mediaType: 'application/pdf' });
  assert.equal(result.size, pdf.length); assert.equal(result.mediaType, 'application/pdf'); assert.equal(result.sha256.length, 32);
  for (const value of [
    { buffer: pdf, mediaType: 'text/plain' },
    { buffer: Buffer.from('not a pdf'), mediaType: 'application/pdf' },
    { buffer: Buffer.from('%PDF-1.4\n/OpenAction 1 0 R\n%%EOF'), mediaType: 'application/pdf' },
    { buffer: Buffer.alloc(5 * 1024 * 1024 + 1), mediaType: 'application/pdf' },
  ]) assert.throws(() => validatePdf(value), error => error.code === 'VALIDATION_ERROR');
});

test('photo validation matches declared MIME to JPG, PNG or WebP signatures', () => {
  assert.equal(validatePhoto({ buffer: png, mediaType: 'image/png' }).mediaType, 'image/png');
  const jpeg = Buffer.concat([Buffer.from('ffd8ffe00010', 'hex'), Buffer.alloc(14),
    Buffer.from('ffc00011080001000103011100021100031100ffd9', 'hex')]);
  assert.equal(validatePhoto({ buffer: jpeg, mediaType: 'image/jpeg' }).mediaType, 'image/jpeg');
  const webp = Buffer.alloc(30); webp.write('RIFF'); webp.write('WEBP', 8); webp.write('VP8X', 12);
  webp.writeUInt32LE(10, 16);
  webp.writeUInt32LE(webp.length - 8, 4);
  assert.equal(validatePhoto({ buffer: webp, mediaType: 'image/webp' }).mediaType, 'image/webp');
  for (const value of [{ buffer: png, mediaType: 'image/jpeg' },
    { buffer: Buffer.from('<svg/>'), mediaType: 'image/png' },
    { buffer: Buffer.alloc(2 * 1024 * 1024 + 1), mediaType: 'image/png' }]) {
    assert.throws(() => validatePhoto(value), error => error.code === 'VALIDATION_ERROR');
  }
});

test('portfolio URL is optional, HTTPS-only and contains no credentials or fragment', () => {
  assert.equal(validatePortfolioUrl(undefined), null);
  assert.equal(validatePortfolioUrl('https://portfolio.example/ada'), 'https://portfolio.example/ada');
  for (const value of ['http://portfolio.example', 'https://user:pass@example.test',
    'https://example.test/path#token', 'not-a-url']) {
    assert.throws(() => validatePortfolioUrl(value), error => error.code === 'VALIDATION_ERROR');
  }
});
