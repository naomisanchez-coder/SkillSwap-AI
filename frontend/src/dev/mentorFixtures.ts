import { academicSessionCost } from '../data/creditConfig';
import { demoMentorPhotos } from '../data/publicContent';
import { findSkillByName } from '../data/skillCatalog';

import type { Mentor, MentorOffer } from '../data/mentors';
export const DEMO_MENTOR_ID = 'carlos';
export const DEMO_MENTOR_EMAIL = 'mentor@demo.pe';
export const studentMentorId = (userId: string) => `student-mentor-${userId}`;
const offer = (
  skill: string,
  topic: string,
  level: string,
  description: string,
  availability: string,
): MentorOffer => ({
  skillId: findSkillByName(skill)?.id ?? '',
  topic,
  level,
  description,
  durations: [30, 60, 90],
  availability,
  costByDuration: {
    30: academicSessionCost(30),
    60: academicSessionCost(60),
    90: academicSessionCost(90),
  },
});

export const mentors: Mentor[] = [
  {
    id: 'carlos',
    name: 'Carlos Mendoza',
    skill: 'Python',
    level: 'Avanzado',
    rating: 0,
    sessions: 0,
    availability: 'Martes y jueves',
    modalities: ['Virtual'],
    skillValidated: true,
    image: demoMentorPhotos.carlos.src,
    bio: 'Estudiante de Ingeniería de Software con experiencia desarrollando proyectos en Python, automatización y análisis de datos.',
    slots: { Martes: ['7:00 PM', '8:00 PM'], Jueves: ['7:00 PM', '8:00 PM'] },
    topics: ['Fundamentos de Python', 'Automatización', 'Análisis de datos'],
    active: true,
    isDemo: true,
    offer: offer('Python', 'Fundamentos y automatización con Python', 'Avanzado', 'Acompañamiento práctico para resolver ejercicios y desarrollar proyectos académicos.', 'Martes y jueves'),
  },
  {
    id: 'andrea',
    name: 'Andrea Torres',
    skill: 'Python',
    level: 'Avanzado',
    rating: 0,
    sessions: 0,
    availability: 'Lunes y miércoles',
    modalities: ['Virtual'],
    skillValidated: true,
    image: demoMentorPhotos.andrea.src,
    bio: 'Estudiante de Ciencia de Datos. Disfruto convertir conceptos complejos de programación en ejercicios claros y prácticos.',
    slots: { Lunes: ['6:00 PM', '7:00 PM'], Miércoles: ['7:00 PM'] },
    topics: ['Python para datos', 'Lógica de programación', 'Proyectos académicos'],
    active: true,
    isDemo: true,
    offer: offer('Python', 'Python aplicado al análisis de datos', 'Avanzado', 'Sesiones prácticas de lógica, datos y resolución guiada de ejercicios.', 'Lunes y miércoles'),
  },
  {
    id: 'luis',
    name: 'Luis García',
    skill: 'Python',
    level: 'Intermedio',
    rating: 0,
    sessions: 0,
    availability: 'Viernes',
    modalities: ['Virtual'],
    skillValidated: true,
    image: demoMentorPhotos.luis.src,
    bio: 'Estudiante de Sistemas enfocado en desarrollo backend y proyectos académicos con Python.',
    slots: { Viernes: ['5:00 PM', '7:00 PM'] },
    topics: ['Python intermedio', 'Backend', 'Buenas prácticas'],
    active: true,
    isDemo: true,
    offer: offer('Python', 'Desarrollo backend con Python', 'Intermedio', 'Apoyo para estructurar proyectos y aplicar buenas prácticas de desarrollo.', 'Viernes'),
  },
];
