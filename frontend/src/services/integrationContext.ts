import { createContext } from 'react';
import type { MentorRecommendation } from '../data/recommendations';
export type ChatMessage = { role: 'user' | 'assistant'; content: string };
export const IntegrationContext = createContext<null | {
  recommendations: () => Promise<MentorRecommendation[]>;
  chat: (message: string, history: ChatMessage[]) => Promise<string>;
}>(null);
