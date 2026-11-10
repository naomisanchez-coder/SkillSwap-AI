import type { Mentor } from './mentors';
/** Proyección pública del catálogo compartido; no mantiene una lista independiente. */
export type PublicMentor = Pick<Mentor, 'id' | 'name' | 'skill' | 'level' | 'availability' | 'skillValidated' | 'bio' | 'active' | 'image'>;
