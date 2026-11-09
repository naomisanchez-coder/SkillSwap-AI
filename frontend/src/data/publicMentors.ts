import { demoMentorPhotos } from './publicContent';

// Datos públicos extraídos del catálogo original de Figma Make.
// Las ofertas, créditos, reservas y perfiles privados se incorporarán en sus etapas.
export type PublicMentor = {
  id: string;
  name: string;
  skill: string;
  level: string;
  availability: string;
  skillValidated: boolean;
  bio: string;
  active?: boolean;
  image: string;
};

export const publicMentors: PublicMentor[] = [
  {
    id: 'carlos',
    name: 'Carlos Mendoza',
    skill: 'Python',
    level: 'Avanzado',
    availability: 'Martes y jueves',
    skillValidated: true,
    bio: 'Estudiante de Ingeniería de Software con experiencia desarrollando proyectos en Python, automatización y análisis de datos.',
    active: true,
    image: demoMentorPhotos['carlos'].src,
  },
  {
    id: 'andrea',
    name: 'Andrea Torres',
    skill: 'Python',
    level: 'Avanzado',
    availability: 'Lunes y miércoles',
    skillValidated: true,
    bio: 'Estudiante de Ciencia de Datos. Disfruto convertir conceptos complejos de programación en ejercicios claros y prácticos.',
    active: true,
    image: demoMentorPhotos['andrea'].src,
  },
  {
    id: 'luis',
    name: 'Luis García',
    skill: 'Python',
    level: 'Intermedio',
    availability: 'Viernes',
    skillValidated: true,
    bio: 'Estudiante de Sistemas enfocado en desarrollo backend y proyectos académicos con Python.',
    active: true,
    image: demoMentorPhotos['luis'].src,
  },
];
