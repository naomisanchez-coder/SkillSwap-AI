export type SkillCategory =
  | 'Programación'
  | 'Bases de datos'
  | 'Matemáticas'
  | 'Electrónica y automatización'
  | 'Redes'
  | 'Herramientas digitales'
  | 'Idiomas'
  | 'Comunicación y estudio'
  | 'Diseño'
  | 'Gestión';

export type SkillCatalogItem = {
  id: string;
  category: SkillCategory;
  name: string;
  description: string;
  active: boolean;
};

export const SKILL_CATALOG: readonly SkillCatalogItem[] = [
  { id: 'python', category: 'Programación', name: 'Python', description: 'Fundamentos, automatización y desarrollo con Python.', active: true },
  { id: 'java', category: 'Programación', name: 'Java', description: 'Programación orientada a objetos y aplicaciones con Java.', active: true },
  { id: 'react', category: 'Programación', name: 'React', description: 'Desarrollo de interfaces web con React.', active: true },
  { id: 'sql', category: 'Bases de datos', name: 'SQL', description: 'Consultas, modelado y gestión de bases de datos.', active: true },
  { id: 'matematicas', category: 'Matemáticas', name: 'Matemáticas', description: 'Resolución de problemas y fundamentos matemáticos.', active: true },
  { id: 'electronica', category: 'Electrónica y automatización', name: 'Electrónica', description: 'Circuitos, medición y fundamentos electrónicos.', active: true },
  { id: 'automatizacion', category: 'Electrónica y automatización', name: 'Automatización', description: 'Control y automatización de procesos.', active: true },
  { id: 'redes', category: 'Redes', name: 'Redes', description: 'Conectividad, configuración y fundamentos de redes.', active: true },
  { id: 'excel', category: 'Herramientas digitales', name: 'Excel', description: 'Hojas de cálculo, fórmulas y análisis de datos.', active: true },
  { id: 'power-bi', category: 'Herramientas digitales', name: 'Power BI', description: 'Visualización y análisis de información.', active: true },
  { id: 'ingles', category: 'Idiomas', name: 'Inglés', description: 'Comunicación y vocabulario técnico en inglés.', active: true },
  { id: 'presentaciones', category: 'Comunicación y estudio', name: 'Presentaciones', description: 'Comunicación oral y diseño de exposiciones.', active: true },
  { id: 'investigacion', category: 'Comunicación y estudio', name: 'Investigación', description: 'Búsqueda, organización y comunicación de información.', active: true },
  { id: 'figma', category: 'Diseño', name: 'Figma', description: 'Diseño de interfaces y prototipado colaborativo.', active: true },
  { id: 'ux-ui', category: 'Diseño', name: 'UX/UI', description: 'Experiencia de usuario y diseño de interfaces.', active: true },
  { id: 'canva', category: 'Diseño', name: 'Canva', description: 'Diseño visual para materiales académicos.', active: true },
  { id: 'marketing', category: 'Gestión', name: 'Marketing', description: 'Fundamentos de comunicación y marketing.', active: false },
] as const;

export const ACTIVE_SKILLS = SKILL_CATALOG.filter(skill => skill.active);

export function findSkillByName(name: string): SkillCatalogItem | undefined {
  const normalized = name.trim().toLocaleLowerCase('es-PE');
  return SKILL_CATALOG.find(skill => skill.name.toLocaleLowerCase('es-PE') === normalized);
}
