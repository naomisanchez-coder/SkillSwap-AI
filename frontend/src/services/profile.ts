import type { OnboardingPreferences } from '../data/profileOptions';

/** Frontera para sustituir la simulación por la API sin cambiar la pantalla. */
export interface ProfileService {
  getPreferences(): Promise<OnboardingPreferences | null>;
  savePreferences(preferences: OnboardingPreferences): Promise<OnboardingPreferences>;
  resetPreferences(): Promise<void>;
}
