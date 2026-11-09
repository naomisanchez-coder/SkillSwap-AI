import { validateProfileStep, type OnboardingPreferences } from '../data/profileOptions';
import type { ProfileService } from '../services/profile';

export const fictitiousStudent = { id: 'frontend-demo-student', name: 'Estudiante de prueba', career: 'Diseño y Desarrollo de Software', cycle: 3 };
export const mockProfileStorageKey = 'skillswap:frontend-demo:profile:v1';

function assertDevelopment() {
  if (!import.meta.env.DEV || import.meta.env.VITE_ENABLE_FRONTEND_PREVIEW !== 'true') throw new Error('La simulación solo está disponible en desarrollo con configuración explícita.');
}

function parsePreferences(value: unknown): OnboardingPreferences {
  if (!value || typeof value !== 'object') throw new Error('Las preferencias simuladas no son válidas. Reinicia los datos.');
  const candidate = value as Partial<OnboardingPreferences>;
  if (!Array.isArray(candidate.interests) || candidate.interests.some(skill => typeof skill !== 'string') ||
    typeof candidate.level !== 'string' || typeof candidate.availability !== 'string' || typeof candidate.goals !== 'string' || candidate.modality !== 'Virtual') {
    throw new Error('Las preferencias simuladas no son válidas. Reinicia los datos.');
  }
  const preferences: OnboardingPreferences = { interests: [...new Set(candidate.interests)], level: candidate.level, availability: candidate.availability, goals: candidate.goals, modality: 'Virtual' };
  for (let step = 1; step <= 4; step++) {
    const error = validateProfileStep(preferences, step);
    if (error) throw new Error('Las preferencias simuladas no son válidas. Reinicia los datos.');
  }
  return preferences;
}

// Nunca guarda credenciales, cookies, tokens ni datos de la cuenta real.
export const mockProfileService: ProfileService = {
  async getPreferences() {
    assertDevelopment();
    const stored = localStorage.getItem(mockProfileStorageKey);
    return stored === null ? null : parsePreferences(JSON.parse(stored));
  },
  async savePreferences(preferences) {
    assertDevelopment();
    const safePreferences = parsePreferences(preferences);
    localStorage.setItem(mockProfileStorageKey, JSON.stringify(safePreferences));
    return safePreferences;
  },
  async resetPreferences() {
    assertDevelopment();
    localStorage.removeItem(mockProfileStorageKey);
  },
};
