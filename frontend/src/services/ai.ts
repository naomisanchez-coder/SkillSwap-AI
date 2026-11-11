import { api, ApiError } from './http';
import type { ChatMessage } from './integrationContext';
/** Crear el servicio no hace llamadas; cada envío explícito produce una sola solicitud. */
export const createChatService = (csrfToken: string) => async (message: string, history: ChatMessage[]) => {
  try {
    const result = await api<{ message?: { role?: string; content?: string } }>('/student/ai/chat', { method: 'POST', body: { message, history }, csrf: csrfToken, timeoutMs: 35000 });
    if (result.message?.role !== 'assistant' || typeof result.message.content !== 'string' || !result.message.content.trim()) throw new ApiError(200, 'INVALID_RESPONSE', 'No se recibió una respuesta válida del asistente.');
    return result.message.content;
  } catch (error) {
    if (error instanceof ApiError && error.code === 'AI_UNAVAILABLE') throw new ApiError(error.status, error.code, 'El servicio de IA está temporalmente indisponible. Espera y vuelve a intentarlo más tarde.');
    if (error instanceof ApiError && error.code === 'AI_PROVIDER_LIMITED') throw new ApiError(error.status, error.code, 'El servicio de IA alcanzó su límite temporal. Espera antes de volver a enviar tu consulta.');
    throw error;
  }
};
