# Perfil y onboarding estudiantil — incremento 1.6

## Estado

La migración `005_student_profile` fue aplicada en ambas bases y validada funcionalmente en `skillswap_ai_test_auth`. Los historiales conservan 001–005 y las segundas ejecuciones confirmaron idempotencia. Las pruebas de escritura permanecen limitadas al esquema aislado; autenticación y salud no cambian.

La validación aislada ejecutó las cinco rutas mediante Express, sesiones persistidas y `skillswap_test_app`. Comprobó propiedad derivada de sesión, rechazo de ADMIN, CSRF, campos privilegiados, persistencia, dos actualizaciones concurrentes coherentes y rollback real ante un conflicto de unicidad. Las fixtures identificadas se eliminaron sin limpiezas generales.

## Fuente funcional y límites

La documentación disponible del Figma Make confirma nombre, biografía, intereses, nivel, objetivos, horario, carrera y ciclo. La pantalla `setup` confirma específicamente intereses, nivel y horario. El prototipo conserva la fotografía en IndexedDB; no existe almacenamiento de archivos aprobado para el backend, por lo que 1.6 no incorpora foto.

No fue posible inspeccionar localmente el código React terminado. Las opciones literales de nivel, el formato visual del horario y el catálogo futuro de habilidades no son verificables desde este repositorio. El backend conserva textos acotados y no inventa enumeraciones. Estos valores deberán compararse con React antes de integrar en `develop`.

## Modelo

- Se reutilizan `users` para nombres/correo/rol/estado, `student_profiles` para carrera/ciclo/onboarding y `careers`/`career_cycles` como catálogo autorizado.
- `student_profile_details` añade, en relación uno a uno, biografía, nivel, objetivos y horario preferido.
- `student_interests` conserva hasta diez intereses ordenados y únicos por estudiante.
- `onboarding_complete` continúa en `student_profiles`; el cliente no puede escribirlo. El servidor lo deriva de al menos un interés, nivel y horario válidos.
- No se duplican correo, rol, carrera, ciclo, verificación, contraseña ni créditos.

## Autorización

Todas las rutas exigen cookie de sesión válida, cuenta `ACTIVE`, correo verificado y rol público `student`. El propietario siempre proviene de la sesión. Un administrador recibe `403 FORBIDDEN`; no se acepta `userId` ni identificador de propietario en parámetros o JSON.

Las mutaciones requieren JSON, origen aprobado cuando se envía `Origin` y `X-CSRF-Token` vinculado a la sesión. La lectura no requiere CSRF. Todas las respuestas usan `Cache-Control: no-store`.

## Contratos preparados

### `GET /api/student/profile`

Devuelve exclusivamente el perfil propio con `id`, `firstName`, `lastName`, `email`, institución fija, rol público, verificación, carrera/código, ciclo, biografía, intereses, nivel, objetivos, horario y `onboardingComplete`.

### `PATCH /api/student/profile`

Acepta una selección no vacía de `firstName`, `lastName`, `bio`, `career`, `cycle`, `interests`, `level`, `goals` y `schedule`. Carrera y ciclo se actualizan juntos y deben existir como combinación activa. Se rechazan campos desconocidos o internos, incluidos `userId`, `role`, `email`, `emailVerified`, `onboardingComplete`, créditos, hashes y estados.

Límites técnicos: nombres 2–100, biografía 500, objetivos 1000, nivel 2–30, horario 2–500 y hasta diez intereses únicos de 2–100 caracteres. Biografía, objetivos, nivel y horario admiten cadena vacía como eliminación (`null`). Estos límites protegen almacenamiento; no sustituyen las opciones visuales pendientes de contrastar con React.

### `GET /api/student/onboarding`

Devuelve `interests`, `level`, `schedule` y `complete` del estudiante autenticado.

### `PUT /api/student/onboarding`

Exige exactamente `interests`, `level` y `schedule`, con al menos un interés. El servidor persiste los tres campos en una transacción y deriva `complete`; no acepta una bandera enviada por React.

### `GET /api/student/catalog`

Devuelve carreras activas como `{code,name,cycles}` reutilizando el catálogo MySQL; no añade áreas formativas.

## Dependencias siguientes

El dashboard puede reutilizar identidad, carrera, ciclo y onboarding. Las recomendaciones 1.7 necesitarán un catálogo de habilidades estable y una representación de disponibilidad aprobada; no deben basarse permanentemente en coincidencias de texto libre. La fotografía requiere una decisión de almacenamiento, validación de contenido, tamaño y autorización antes de crear endpoint.
