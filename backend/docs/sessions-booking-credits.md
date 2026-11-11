# Reservas, sesiones y créditos — incremento 1.10

## Estado y decisiones confirmadas

La migración `007_sessions_booking_credits.sql` está aplicada y validada en `skillswap_ai_test_auth`; permanece pendiente en `skillswap_ai`. Mientras el esquema de ejecución no contenga `007_sessions_booking_credits`, el servidor no compone este módulo y sus rutas responden `503 SERVICE_UNAVAILABLE`; las rutas ya publicadas continúan funcionando.

El flujo funcional confirmado por Figma es:

`UPCOMING → ACTIVE → AWAITING_VALIDATION → COMPLETED`, seguido opcionalmente por el evento `REVIEWED` (la sesión permanece `COMPLETED`).

- El estudiante reserva una oferta activa vinculada a una habilidad aprobada del mentor.
- El mentor configura un enlace HTTPS admitido, inicia la sesión y la marca como realizada.
- El estudiante valida la sesión realizada; solo entonces la retención se liquida al mentor y la sesión queda completada.
- El estudiante puede registrar una única valoración de 1 a 5 después de completar la sesión.
- Duraciones y costos son inmutables desde el backend: 30 minutos/5 créditos, 60/10 y 90/15.
- No se permite reservar consigo mismo ni superponer sesiones activas de ninguno de los participantes.
- La agenda semanal usa `America/Lima`; cada sesión debe comenzar y terminar el mismo día local.

La política de cancelación permanece pendiente. Aunque el modelo reserva un estado económico para un futuro reembolso, el endpoint de cancelación responde `409 CANCELLATION_POLICY_PENDING` y no modifica datos. No se implementan penalizaciones, plazo de cancelación, ausencia, reprogramación, compra de créditos ni pagos monetarios.

## Modelo preparado

- `mentor_offers`: publica o pausa una habilidad que ya tiene una solicitud `APPROVED`.
- `mentor_availability`: bloques semanales no superpuestos, de lunes a domingo, en `America/Lima`.
- `mentoring_sessions`: propietario estudiante/mentor, oferta aprobada, intervalo, duración, costo y estado.
- `session_credit_holds`: relación uno a uno entre sesión y retención, con liquidación o reembolso mutuamente excluyentes.
- `mentoring_session_events`: historial mínimo e idempotente de transiciones.
- `session_reviews`: una valoración del estudiante por sesión completada.

Las restricciones únicas cubren la clave de reintento por estudiante y los inicios idénticos. Los solapamientos de intervalos se comprueban dentro de la transacción después de bloquear ambos usuarios en orden determinista; MySQL no ofrece una restricción de exclusión temporal nativa equivalente.

## Créditos y atomicidad

`credit_transactions` sigue siendo la única fuente contable. Al reservar se registra un movimiento negativo `SESSION_HOLD`; por ello:

- `available`: suma actual de movimientos del usuario;
- `held`: valor positivo de movimientos de retención cuyo estado continúa `HELD`;
- `total`: `available + held`.

Al validar una sesión, una única transacción inserta `SESSION_EARNING` para el mentor, cambia la retención a `SETTLED`, completa la sesión y registra el evento. Las claves únicas de operación y evento impiden dobles cargos o liquidaciones ante reintentos. Login, verificación de correo y reserva no vuelven a conceder créditos iniciales.

## Contratos HTTP preparados

Todas las rutas exigen una sesión `STUDENT`; las mutaciones además exigen origen permitido, JSON y CSRF vinculado a la sesión.

- `GET /api/student/explore/mentors/:mentorId/availability`
- `GET|PUT /api/student/mentor/availability`
- `GET /api/student/mentor/offers`
- `PUT /api/student/mentor/offers/:skillId`
- `POST /api/student/bookings`
- `GET /api/student/sessions`
- `GET /api/student/sessions/:sessionId`
- `PUT /api/student/sessions/:sessionId/meeting-link`
- `POST /api/student/sessions/:sessionId/start`
- `POST /api/student/sessions/:sessionId/performed`
- `POST /api/student/sessions/:sessionId/validate`
- `POST /api/student/sessions/:sessionId/cancel` (bloqueado hasta aprobar política)
- `POST /api/student/sessions/:sessionId/reviews`
- `GET /api/student/session-credits`

El cliente aporta una `requestId` UUID estable por intención de reserva. No aporta costo, estado económico, estudiante ni mentor. Las lecturas filtran siempre por el participante autenticado y no exponen certificados, notas administrativas o datos privados.

## Validación real con MySQL aislado

El checksum aplicado es `aafc96679930a69496175c1904e2a240e412c28e75181a1a4f558cd14bd1c6c6`. El postcheck confirmó seis tablas InnoDB, 15 claves foráneas, 18 restricciones CHECK habilitadas, índices, historial e idempotencia. Las integraciones usan `skillswap_test_app` y comprobaron tarifas, saldo insuficiente, intervalos solapados, reintento por clave, concurrencia con inicios idénticos, transiciones, permisos, liquidación única, valoración y limpieza selectiva. Ninguna prueba de escritura se ejecutó en `skillswap_ai`.

La propuesta de cancelar únicamente una sesión `UPCOMING`, con reembolso total y sin penalización, es compatible con el modelo: `CANCELLED`, `REFUNDED`, `refund_transaction_id` y el evento `CANCELLED` ya están definidos. Su operación deberá insertar un movimiento positivo único para el estudiante y actualizar retención, sesión y evento en una transacción. No se activa hasta aprobar expresamente esa regla.

La disponibilidad podrá alimentar el 25 % del ranking de recomendaciones después de aplicar 007 también en el entorno que sirve la aplicación y poblar datos reales. La calidad (10 %) requiere sesiones completadas y valoraciones reales. El nivel por habilidad continúa sin modelo confirmado; no debe inferirse del texto de onboarding.
