# Aprobación mínima de mentores — cierre 1.12

Este módulo ofrece servicios reutilizables para un panel administrativo posterior. No crea administradores, no cambia permisos de estudiantes y no constituye un panel visual.

Todas las rutas exigen una sesión `ADMIN` activa y verificada. Las mutaciones exigen origen permitido, cookie de sesión, CSRF vinculado a la sesión y JSON. Los documentos se leen desde almacenamiento privado, se verifica tamaño y SHA-256 antes de responder, y se entregan como adjuntos con `no-store`, `nosniff`, política same-origin y CSP `sandbox`. Ninguna lista devuelve correo, URL interna, clave de almacenamiento, certificado o notas privadas.

## Contratos HTTP

- `GET /api/admin/mentor-applications?limit=20`: lista de 1 a 50 solicitudes `PENDING`, ordenadas por fecha e identificador. Devuelve identidad pública/académica mínima, habilidad y presencia de certificado/portafolio.
- `GET /api/admin/mentor-applications/:applicationId/documents/certificate`
- `GET /api/admin/mentor-applications/:applicationId/documents/portfolio`

Las dos rutas de documento son exclusivamente ADMIN. Un documento ausente, ajeno o no `READY` falla cerrado.

- `POST /api/admin/mentor-applications/:applicationId/decision`

```json
{ "decision": "APPROVED", "reason": "Evidencia revisada." }
```

Solo acepta `APPROVED` o `REJECTED` y motivo de 2 a 1000 caracteres. La transacción bloquea la solicitud; solo `PENDING` puede decidirse. Aprobar exige certificado privado `READY`. Se registran `decided_by`, `decided_at`, notas y un evento de auditoría. Se rechaza la autoaprobación y una segunda decisión concurrente recibe conflicto.

- `PUT /api/admin/mentor-offers/:offerId/level`

```json
{ "levelCode": "codigo-administrado" }
```

La oferta debe corresponder a una solicitud aprobada. El nivel debe existir y estar activo en `skill_level_catalog`. La asignación guarda administrador y fecha. Repetir exactamente la misma asignación es idempotente; cambiarla silenciosamente se rechaza para conservar trazabilidad. Una futura política de reclasificación deberá definir un historial explícito antes de permitir cambios.

## Migración y compatibilidad

`008_mentor_skill_levels.sql` añade `skill_level_catalog` y `mentor_skill_levels`; no contiene semillas. El servidor detecta el historial de 008: sin ella, Explorar continúa operativo con nivel no disponible y las rutas ADMIN quedan cerradas con `503`. Con 008, el ranking usa `rank_value / 100` para el 20 % de nivel solo cuando todas las habilidades coincidentes tienen asignación auditada. Los componentes faltantes siguen en cero y nunca se renormalizan.
