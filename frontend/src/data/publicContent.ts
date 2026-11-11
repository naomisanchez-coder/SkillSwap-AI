const unsplash = (id: string, width: number, height?: number) =>
  `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${width}${height ? `&h=${height}` : ''}&q=75`;

export type PublicPhoto = {
  src: string;
  srcSet?: string;
  alt: string;
  credit: string;
  creditUrl: string;
};

const photo = (id: string, alt: string, credit: string, handle: string, width = 1200, height?: number): PublicPhoto => ({
  src: unsplash(id, width, height),
  srcSet: `${unsplash(id, 640, height ? Math.round(height * 640 / width) : undefined)} 640w, ${unsplash(id, width, height)} ${width}w`,
  alt,
  credit,
  creditUrl: `https://unsplash.com/@${handle}`,
});

// Máximo tres fotografías en el hero.
export const heroPhotos: PublicPhoto[] = [
  photo('1758270705290-62b6294dd044', 'Grupo diverso de estudiantes reunidos alrededor de una computadora portátil', 'Vitaly Gariev', 'silverkblack', 1400, 1050),
  photo('1531545514256-b1400bc00f31', 'Estudiantes mirando juntos una computadora sobre una mesa', 'Mimi Thian', 'mimithian', 1400, 1050),
  photo('1523240795612-9a054b0db644', 'Tres jóvenes riendo mientras miran una computadora portátil', 'Priscilla Du Preez', 'priscilladupreez', 1400, 1050),
];

export const homeSecondaryPhoto = photo('1758270704787-615782711641', 'Estudiantes conversando y estudiando juntos en un aula', 'Vitaly Gariev', 'silverkblack', 1200, 900);
export const howItWorksPhoto = photo('1758270704524-596810e891b5', 'Estudiantes sonriendo durante una actividad de aprendizaje', 'Vitaly Gariev', 'silverkblack', 1200, 900);
export const sharePhoto = photo('1758270705172-07b53627dfcb', 'Estudiantes compartiendo conocimientos frente a una computadora', 'Vitaly Gariev', 'silverkblack', 1200, 900);

// Retratos solo para los perfiles ficticios de demostración (por id de mentor del catálogo).
export const demoMentorPhotos: Record<string, PublicPhoto> = {
  carlos: photo('1525457136159-8878648a7ad0', 'Retrato de Carlos Mendoza, perfil de demostración', 'Gabriel Arancibia', 'gabrieeel', 640, 640),
  andrea: photo('1567052898066-4badc4b84734', 'Retrato de Andrea Torres, perfil de demostración', 'Ba Ba', 'baba1906', 640, 640),
  luis: photo('1613683746628-a54a60277611', 'Retrato de Luis García, perfil de demostración', 'Jacinto', 'longlivehaas', 640, 640),
};

export type PublicSkillCategory = {
  name: string;
  description: string;
  query: string;
  tone: string;
};

export const publicSkillCategories: PublicSkillCategory[] = [
  { name: 'Programación', description: 'Lógica, Python, Java y desarrollo web.', query: 'Python', tone: 'bg-[#DDF6ED]' },
  { name: 'Bases de datos', description: 'Modelado, SQL y gestión de información.', query: 'SQL', tone: 'bg-[#E8F4FF]' },
  { name: 'Matemáticas', description: 'Fundamentos, cálculo y resolución de problemas.', query: 'Matemáticas', tone: 'bg-[#FFF4D6]' },
  { name: 'Electrónica y automatización', description: 'Circuitos, control y sistemas automatizados.', query: 'Electrónica', tone: 'bg-[#FFE9DD]' },
  { name: 'Redes', description: 'Conectividad, configuración y fundamentos de redes.', query: 'Redes', tone: 'bg-[#E8F4FF]' },
  { name: 'Excel y herramientas digitales', description: 'Excel, Power BI y productividad digital.', query: 'Excel', tone: 'bg-[#DDF6ED]' },
  { name: 'Inglés', description: 'Comprensión, conversación y vocabulario técnico.', query: 'Inglés', tone: 'bg-[#FFF4D6]' },
  { name: 'Comunicación y técnicas de estudio', description: 'Presentaciones, organización y aprendizaje.', query: 'Presentaciones', tone: 'bg-[#FFE9DD]' },
];
