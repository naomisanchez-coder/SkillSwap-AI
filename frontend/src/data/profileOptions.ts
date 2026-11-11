import { ACTIVE_SKILLS } from './skillCatalog';

// Opciones referenciales de ProfileSetupPage.tsx / skillCatalog.ts de Figma Make.
export const profileSkills = ACTIVE_SKILLS.map(skill => skill.name);
export const profileLevels = [
  ['Principiante', 'Estoy empezando desde cero.'],
  ['Intermedio', 'Tengo conocimientos básicos y quiero mejorar.'],
  ['Avanzado', 'Ya tengo experiencia y quiero profundizar.'],
];
export const profileGoals = ['Aprender desde cero', 'Mejorar mis conocimientos', 'Desarrollar un proyecto', 'Prepararme para una evaluación', 'Prepararme para prácticas'];
export const profileDays = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
export const profileTimes = ['5:00 PM – 6:00 PM', '7:00 PM – 8:00 PM', '8:00 PM – 9:00 PM'];

export type OnboardingPreferences = {
  interests: string[];
  level: string;
  availability: string;
  goals: string;
  modality: 'Virtual';
};

export function emptyPreferences(): OnboardingPreferences {
  return { interests: [], level: '', availability: '', goals: '', modality: 'Virtual' };
}

export function validateProfileStep(value: OnboardingPreferences, step: number, skills = profileSkills): string | null {
  if (step === 1 && (!value.interests.length || value.interests.some(skill => !skills.includes(skill)))) return 'Selecciona al menos una habilidad.';
  if (step === 2 && !profileLevels.some(([level]) => level === value.level)) return 'Selecciona tu nivel.';
  if (step === 3 && !profileDays.some(day => profileTimes.some(time => `${day} · ${time}` === value.availability))) return 'Selecciona un horario disponible.';
  if (step === 4 && !profileGoals.includes(value.goals)) return 'Selecciona tu objetivo académico.';
  return null;
}
