import { api } from './http';
import type { ChatMessage } from './integrationContext';
/** Crear el servicio no hace llamadas; cada envío explícito produce una sola solicitud. */
export const createChatService = (csrfToken: string) => async (message: string, history: ChatMessage[]) =>
  (await api<{ reply: string }>('/student/ai/chat', { method: 'POST', body: { message, history }, csrf: csrfToken, timeoutMs: 35000 })).reply;
