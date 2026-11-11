import Busboy from 'busboy';
import { PublicError } from '../errors/PublicError.js';

export function parseMultipart({ fileFields, fieldNames = [], maximumBytes = 5 * 1024 * 1024 }) {
  const allowedFiles = new Set(fileFields);
  const allowedFields = new Set(fieldNames);
  return (request, response, next) => {
    if (!request.is('multipart/form-data')) return next(new PublicError('UNSUPPORTED_MEDIA_TYPE'));
    let parser;
    try {
      // Busboy announces a limit when the configured count is reached. Allow
      // one sentinel part so exact valid forms complete; the explicit allowlists
      // reject that extra part without retaining it.
      parser = Busboy({ headers: request.headers, limits: { fileSize: maximumBytes, fieldSize: 4096,
        files: fileFields.length + 1, fields: fieldNames.length + 1,
        parts: fileFields.length + fieldNames.length + 1 } });
    } catch { return next(new PublicError('VALIDATION_ERROR', { file: 'El formulario de archivo no es válido.' })); }
    const files = Object.create(null), fields = Object.create(null), seenFiles = new Set();
    let failed;
    const reject = (field, message) => { failed ??= new PublicError('VALIDATION_ERROR', { [field]: message }); };
    parser.on('field', (name, value, info) => {
      if (!allowedFields.has(name) || Object.hasOwn(fields, name) || info.valueTruncated) {
        reject('form', 'El formulario contiene campos no permitidos.');
      } else fields[name] = value;
    });
    parser.on('file', (name, stream, info) => {
      if (!allowedFiles.has(name) || seenFiles.has(name)) reject('file', 'El formulario contiene archivos no permitidos.');
      seenFiles.add(name);
      const chunks = [];
      stream.on('limit', () => reject(name, 'El archivo supera el tamaño permitido.'));
      stream.on('data', chunk => { if (!failed) chunks.push(chunk); });
      stream.on('end', () => {
        if (!failed && allowedFiles.has(name)) files[name] = {
          buffer: Buffer.concat(chunks), mediaType: info.mimeType,
        };
      });
    });
    parser.once('filesLimit', () => reject('file', 'Se enviaron demasiados archivos.'));
    parser.once('fieldsLimit', () => reject('form', 'Se enviaron demasiados campos.'));
    parser.once('partsLimit', () => reject('form', 'Se enviaron demasiadas partes.'));
    parser.once('error', () => reject('file', 'No se pudo procesar el archivo.'));
    parser.once('close', () => {
      if (failed) next(failed);
      else { request.multipart = { files, fields }; next(); }
    });
    request.pipe(parser);
  };
}
