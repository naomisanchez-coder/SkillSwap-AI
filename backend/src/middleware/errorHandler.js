export function errorHandler(error, request, response, next) {
  if (response.headersSent) return next(error);
  const status = error.type === 'entity.parse.failed' ? 400
    : error.type === 'entity.too.large' ? 413 : 500;
  response.status(status).json({ status: 'error', message:
    status === 400 ? 'Invalid JSON' : status === 413 ? 'Payload too large' : 'Internal server error' });
}
