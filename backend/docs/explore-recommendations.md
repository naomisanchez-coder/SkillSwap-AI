# Explorar y recomendaciones — incrementos 1.9 y 1.12

## Alcance confirmado

Las rutas son lecturas privadas para un `STUDENT` activo, verificado y autenticado. El propietario se obtiene de la sesión; no se aceptan identificadores de usuario del cliente. Un mentor público requiere simultáneamente solicitud `APPROVED`, oferta `ACTIVE`, habilidad activa y cuenta activa/verificada. Una solicitud pendiente/rechazada o una oferta pausada nunca se publica.

El catálogo de habilidades de la migración 006 está operativo, pero permanece vacío hasta aprobar una fuente real. No se atribuyen habilidades ni categorías a TECSUP y las pruebas utilizan fixtures sintéticas eliminadas al terminar.

## Endpoints

- `GET /api/student/explore/skills`: devuelve habilidades activas, categorías reales no nulas y paginación. Acepta `q`, `category`, `skillId`, `limit` y `cursor`.
- `GET /api/student/explore/mentors`: devuelve únicamente perfiles con al menos una habilidad aprobada y ofrecida activamente. Acepta los mismos filtros y orden estable por nombre e identificador.
- `GET /api/student/explore/mentors/:mentorId`: devuelve el detalle público mínimo y sus habilidades activas aprobadas/ofrecidas.
- `GET /api/student/recommendations`: devuelve recomendaciones para las habilidades que el estudiante declaró con intención `LEARN`. Acepta únicamente `limit`.

Los perfiles públicos contienen `id`, nombres, carrera, ciclo, biografía y habilidades aprobadas. No contienen correo, nivel/objetivos/horario privado, intereses, estados de cuenta, notas administrativas, certificados, portafolios, créditos ni sesiones.

La paginación usa cursores opacos y orden total estable. Búsqueda y filtros se parametrizan; los comodines aportados por el usuario se tratan como texto.

## Ranking determinista

Ponderaciones aprobadas:

- habilidad: 45 %;
- nivel: 20 %;
- disponibilidad: 25 %;
- calidad: 10 %.

La contribución de habilidad es `45 × (habilidades LEARN coincidentes / total de habilidades LEARN)` y solo considera ofertas activas con aprobación vigente.

La disponibilidad usa los bloques semanales activos de `mentor_availability`. Para cada bloque toma su siguiente ocurrencia en `America/Lima`, descuenta intervalos `UPCOMING`, `ACTIVE` o `AWAITING_VALIDATION` y cuenta únicamente fragmentos libres de al menos 30 minutos. Su puntuación es `minutos reservables / minutos configurados` y su contribución, `25 × puntuación`. Sin agenda configurada el componente queda no disponible; una agenda completamente ocupada es evidencia válida con puntuación cero.

La calidad usa exclusivamente valoraciones de sesiones `COMPLETED`. Con al menos una valoración válida, la puntuación es `promedio / 5` y la contribución, `10 × puntuación`; se informa el número de sesiones completadas/revisadas. Una sesión sin valoración no genera una puntuación ficticia y un mentor sin valoraciones conserva el componente no disponible.

Las contribuciones disponibles se suman sin renormalizar pesos. `evidenceCoverage` suma los pesos respaldados de cada mentor. Los empates se resuelven por coincidencias, nombre, apellido e identificador.

El texto libre `learning_level` describe al estudiante en general y no acredita dominio de una habilidad concreta. Por ello nivel conserva `available:false`, contribución cero y `DATA_NOT_MODELED`. La migración propuesta `008_mentor_skill_levels.sql` crea un catálogo administrable vacío y una asignación auditada por oferta; no incorpora etiquetas ni rangos inventados y no se ha aplicado a ninguna base. Hasta aprobar y cargar sus valores, todo ranking con resultados permanece `PARTIAL`. Sin habilidades `LEARN` o coincidencias activas, la respuesta es `INSUFFICIENT_DATA`.

No fue posible acceder desde este repositorio a una fuente Figma adicional con opciones literales de nivel. El flujo administrativo mínimo pendiente debe listar solicitudes, permitir que un ADMIN inspeccione documentos privados con autorización de servidor y decidir `APPROVED`/`REJECTED` registrando `decided_by`, fecha, notas y evento. No es necesario para calcular el ranking con fixtures aisladas y no se implementa como panel administrativo en 1.12.

## Catálogo de habilidades

No existe una lista aprobada de habilidades/categorías en el repositorio. `database/skill-catalog.js` y `scripts/skill-catalog.js` preparan una carga externa versionada, transaccional e idempotente: validan UUID, código, nombre, categoría y duplicados equivalentes; el modo `--check` no escribe; `--apply` exige autorización explícita; cualquier conflicto aborta sin sobrescribir, desactivar ni eliminar filas. No se incluye ningún seed.

Formato esperado: `{ "version":"1.0.0", "skills":[{"id":"uuid","code":"slug","name":"...","category":null}] }`. La categoría puede ser `null`; no debe atribuirse una taxonomía a TECSUP sin una fuente aprobada.
