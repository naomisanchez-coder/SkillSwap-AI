# Habilidades, solicitudes de mentor y archivos privados — incremento 1.8

## Estado

La migración `006_mentor_skills_files` y la API están preparadas, pero 006 no fue aplicada a ninguna base. Las rutas de archivos fallan de forma cerrada con 503 mientras no se configure `PRIVATE_STORAGE_ROOT`; configurarlo no sustituye la aplicación y validación previa de la migración en `skillswap_ai_test_auth`.

Checksum SHA-256 de la propuesta 006:

```text
8494f88eec39e615ec44b14e2970f6c017479ab00d2e6769d4a2e39fda8aede3
```

## Evidencia de Figma y límites

El prototipo confirma Mis habilidades, solicitud para enseñar una habilidad, evidencia PDF, portafolio opcional, estados pendiente/aprobado/rechazado y activación del modo mentor sobre la misma cuenta únicamente después de aprobación. La fotografía existía solo en IndexedDB y el PDF conservaba únicamente su nombre.

No se verificaron localmente los valores exactos del catálogo, sus categorías ni si React representa el portafolio como URL o PDF. Por ello 006 crea un catálogo vacío, sin atribuirlo a TECSUP, y el backend admite como compatibilidad un enlace HTTPS o un PDF opcional, nunca ambos. Esta decisión debe cotejarse con React antes de integrar en `develop`.

## Modelo propuesto

- `skill_catalog`: habilidades normalizadas, activas y sin seeds inventados.
- `student_skills`: declaraciones independientes `LEARN` y `TEACH`; no conceden aprobación.
- `mentor_applications`: una solicitud durable por estudiante y habilidad, con `PENDING`, `APPROVED` o `REJECTED`.
- `private_files`: metadatos, hash y clave opaca; nunca BLOB ni ruta pública.
- `mentor_application_documents`: certificado obligatorio y portafolio PDF opcional.
- `student_profile_photos`: fotografía actual del propietario.
- `mentor_application_events`: auditoría mínima de presentación, reenvío, sustitución y futuras decisiones.

Una solicitud aprobada es la fuente futura para habilitar mentorías en esa habilidad. No cambia `users.role`, no crea otra cuenta y no convierte intereses libres del onboarding en habilidades.

## Estados y operaciones del estudiante

- Una solicitud nueva se crea como `PENDING` y exige certificado.
- `PENDING` o `REJECTED` permiten sustituir el certificado.
- Solo `REJECTED` permite reenvío explícito a `PENDING`.
- `APPROVED` no puede ser editada o reenviada por el estudiante.
- El estudiante nunca envía un estado, decisión, rol o permiso.
- Las decisiones `APPROVED`/`REJECTED`, el revisor y las notas quedan reservadas al módulo administrativo posterior.

## Archivos

### Fotografía

- JPG, PNG o WebP coherente con la firma del contenido.
- Máximo 2 MiB.
- Opcional, sustituible y eliminable por el propietario.
- Descarga autenticada con `nosniff`, política same-origin y sin caché.

### Certificado y portafolio

- Certificado PDF obligatorio, máximo 5 MiB.
- Portafolio opcional como URL HTTPS sin credenciales/fragmento o PDF de hasta 5 MiB.
- Cabecera PDF, marcador EOF y MIME coherentes.
- Se rechazan marcadores de JavaScript, acciones automáticas, lanzamientos, adjuntos, RichMedia, XFA y AcroForm.
- La descarga actual es exclusivamente del propietario. La lectura administrativa deberá usar autorización ADMIN independiente, no reutilizar rutas estudiantiles.
- El análisis antimalware profundo queda pendiente de integrar un servicio especializado antes de exposición pública.

Los archivos se guardan bajo nombres aleatorios de 256 bits, permisos `0600`, directorios `0700` y rutas no públicas. La interfaz local expone `store/read/remove`, por lo que puede sustituirse por un adaptador de nube sin cambiar el dominio. Ante fallo de base se elimina el archivo nuevo; un fallo de limpieza posterior emite únicamente `PRIVATE_FILE_CLEANUP_REQUIRED`, sin ruta ni secreto.

## Configuración

`PRIVATE_STORAGE_ROOT` debe ser una ruta absoluta privada, distinta de `/` y preferentemente fuera del repositorio. `.private-storage/` está ignorado como defensa adicional para desarrollo. No debe apuntar a `public`, al frontend ni a un directorio servido por Express.

## Endpoints preparados

Todos exigen STUDENT activo, verificado y sesión propia. Las mutaciones requieren origen permitido y CSRF.

- `GET /api/student/skills/catalog`
- `GET /api/student/skills`
- `PUT /api/student/skills/:skillId`
- `GET /api/student/mentor-application/requirements`
- `GET /api/student/mentor-applications`
- `POST /api/student/mentor-applications` — multipart `skillId`, `certificate`, y opcionalmente `portfolioUrl` o `portfolio`.
- `PUT /api/student/mentor-applications/:applicationId/certificate`
- `POST /api/student/mentor-applications/:applicationId/resubmit`
- `GET /api/student/mentor-applications/:applicationId/documents/:type`
- `GET /api/student/profile/photo`
- `PUT /api/student/profile/photo`
- `DELETE /api/student/profile/photo`

No existen endpoints estudiantiles para aprobar, rechazar, alterar auditoría o activar permisos de mentor.

## Validación pendiente

Primero se debe autorizar 006 en `skillswap_ai_test_auth`, validar metadatos MySQL 8.4, concurrencia, compensación de archivos y descargas con `skillswap_test_app`, y limpiar fixtures. Solo después podrá considerarse su aplicación en `skillswap_ai`.
