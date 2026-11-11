# Explorar y recomendaciones — incremento 1.9

## Alcance confirmado

Las rutas de este incremento son lecturas privadas para un `STUDENT` activo, verificado y autenticado. El propietario se obtiene de la sesión; no se aceptan identificadores de usuario del cliente. La fuente de mentores es exclusivamente una solicitud de habilidad con estado `APPROVED`. Las solicitudes `PENDING` y `REJECTED` nunca publican al estudiante como mentor.

El catálogo de habilidades de la migración 006 está operativo, pero permanece vacío hasta aprobar una fuente real. No se atribuyen habilidades ni categorías a TECSUP y las pruebas utilizan fixtures sintéticas eliminadas al terminar.

## Endpoints

- `GET /api/student/explore/skills`: devuelve habilidades activas, categorías reales no nulas y paginación. Acepta `q`, `category`, `skillId`, `limit` y `cursor`.
- `GET /api/student/explore/mentors`: devuelve únicamente perfiles con al menos una habilidad aprobada. Acepta los mismos filtros y orden estable por nombre e identificador.
- `GET /api/student/explore/mentors/:mentorId`: devuelve el detalle público mínimo y todas las habilidades activas aprobadas del mentor.
- `GET /api/student/recommendations`: devuelve recomendaciones para las habilidades que el estudiante declaró con intención `LEARN`. Acepta únicamente `limit`.

Los perfiles públicos contienen `id`, nombres, carrera, ciclo, biografía y habilidades aprobadas. No contienen correo, nivel/objetivos/horario privado, intereses, estados de cuenta, notas administrativas, certificados, portafolios, créditos ni sesiones.

La paginación usa cursores opacos y orden total estable. Búsqueda y filtros se parametrizan; los comodines aportados por el usuario se tratan como texto.

## Ranking determinista provisional

Ponderaciones aprobadas:

- habilidad: 45 %;
- nivel: 20 %;
- disponibilidad: 25 %;
- calidad: 10 %.

La contribución de habilidad es `45 × (habilidades LEARN coincidentes / total de habilidades LEARN)`. Los empates se resuelven por cantidad de coincidencias, nombre, apellido e identificador.

No existe todavía nivel de dominio por habilidad, disponibilidad estructurada ni calidad basada en sesiones/calificaciones. El texto libre `learning_level` no acredita nivel para enseñar y `preferred_schedule` no es una agenda comparable. Por ello esos componentes se devuelven con `available:false`, `score:null`, contribución cero y motivo `DATA_NOT_MODELED`. `evidenceCoverage` es 45 y `rankingStatus` es `PARTIAL`; no se renormalizan los pesos ni se inventan valores. Sin habilidades `LEARN` o coincidencias aprobadas, la respuesta es vacía con `INSUFFICIENT_DATA`.

El ranking definitivo requiere modelos aprobados de nivel por habilidad, disponibilidad y calidad, además del flujo administrativo que produzca aprobaciones reales. No fue necesaria una migración 007 para este alcance.
