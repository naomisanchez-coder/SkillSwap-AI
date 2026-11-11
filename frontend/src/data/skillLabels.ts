/** Solo presentación: conservar nombres originales e identificadores en las solicitudes a la API. */
export function skillLabel(name: string): string {
  return name.replace(/ \(demostración\)$/u, '');
}
