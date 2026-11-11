import { PublicError } from '../errors/PublicError.js';

const parserErrors = Object.freeze({
  'entity.parse.failed': [400, 'INVALID_JSON', 'El JSON enviado no es válido.'],
  'entity.too.large': [413, 'PAYLOAD_TOO_LARGE', 'El cuerpo enviado supera el límite permitido.'],
  'charset.unsupported': [415, 'UNSUPPORTED_MEDIA_TYPE', 'El formato enviado no está admitido.'],
  'encoding.unsupported': [415, 'UNSUPPORTED_MEDIA_TYPE', 'El formato enviado no está admitido.'],
});

export function errorHandler(error, request, response, next) {
  if (response.headersSent) return next(error);
  if (error instanceof PublicError) {
    const body = { code: error.code, message: error.publicMessage };
    if (error.fields !== undefined) body.fields = error.fields;
    return response.status(error.status).json({ error: body });
  }
  const parserError = typeof error?.type === 'string' && Object.hasOwn(parserErrors, error.type)
    ? parserErrors[error.type] : undefined;
  const [status, code, message] = parserError ??
    [500, 'INTERNAL_SERVER_ERROR', 'Error interno del servidor.'];
  return response.status(status).json({ error: { code, message } });
}
