export class ApiError extends Error {
  readonly status: number; readonly code: string; readonly fields?: Record<string, string>;
  constructor(status: number, code: string, message: string, fields?: Record<string, string>) { super(message); this.status = status; this.code = code; this.fields = fields; }
}
export async function api<T>(path: string, options: { method?: string; body?: unknown; csrf?: string; signal?: AbortSignal; binary?: boolean; timeoutMs?: number } = {}): Promise<T> {
  const base = (import.meta.env?.VITE_API_URL || 'http://localhost:4000/api').replace(/\/+$/, '');
  const headers: Record<string, string> = {};
  const multipart = options.body instanceof FormData;
  if (options.body !== undefined && !multipart) headers['Content-Type'] = 'application/json';
  if (options.csrf) headers['X-CSRF-Token'] = options.csrf;
  else if (options.method && options.method !== 'GET') headers['X-CSRF-Protection'] = '1';
  let response: Response;
  try { response = await fetch(`${base}${path}`, { method: options.method ?? 'GET', credentials: 'include', cache: 'no-store', headers,
    body: options.body === undefined ? undefined : multipart ? options.body as FormData : JSON.stringify(options.body),
    signal: options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(options.timeoutMs ?? 20000)]) : AbortSignal.timeout(options.timeoutMs ?? 20000) }); }
  catch { throw new ApiError(0, 'NETWORK_ERROR', 'No se pudo conectar con la API. Comprueba el servidor local.'); }
  if (response.ok && options.binary) return await response.blob() as T;
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(response.status, data?.error?.code ?? 'API_ERROR', `${data?.error?.message ?? 'No se pudo completar la operación.'} (${data?.error?.code ?? 'API_ERROR'})${data?.error?.fields ? ' ' + Object.values(data.error.fields).join(' ') : ''}`, data?.error?.fields);
  if (!data) throw new ApiError(response.status, 'INVALID_RESPONSE', 'La API devolvió una respuesta inválida.');
  return data as T;
}
