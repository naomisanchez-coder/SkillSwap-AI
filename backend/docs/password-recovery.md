# Recuperación segura de contraseña — diseño 1.5B

**Estado:** diseño, migración 004 y pruebas sin DDL preparados. No se aplicó 004, no existen endpoints activos y no se envió correo.

## Evidencia visual y decisión pendiente

La referencia disponible de Figma confirma solamente la pantalla inicial con correo institucional y la acción “Comprobar correo”. No confirma una pantalla posterior de enlace, código ni nueva contraseña. El backend se prepara con el código numérico de seis dígitos propuesto, alineado con la infraestructura OTP existente, pero React debe confirmar las pantallas de introducción de código y nueva contraseña antes de integrar el flujo.

## Política propuesta para aprobación

- Código criptográfico de seis dígitos, vigente 600 segundos y máximo cinco intentos.
- Espera de 60 segundos entre solicitudes admitidas por correo.
- Ventana fija de una hora: máximo cinco admisiones por correo y veinte por IP.
- Límites persistentes para correos existentes e inexistentes mediante HMAC independientes.
- Las ventanas vencidas se reinician al volver a usarse. Las filas vencidas hace más de 24 horas
  se eliminan de forma oportunista en lotes máximos de 100 mediante el índice de expiración; un
  fallo de limpieza no amplía ni omite límites.
- Una solicitud admitida revoca desafíos `SENDING` o `PENDING` anteriores del usuario.
- Solo `PENDING` puede consumirse; `SENDING`, `CONSUMED`, `REVOKED`, `EXPIRED` y `EXHAUSTED` nunca verifican.
- El proveedor SMTP debe aceptar el mensaje antes de la transición `SENDING → PENDING`; aceptación no demuestra entrega al buzón.
- Cuentas elegibles: `ACTIVE`, verificadas y con rol `STUDENT` o `ADMIN`. La respuesta de solicitud no revela elegibilidad.

Estas cifras son una propuesta reutilizada de OTP, no una afirmación de que Figma las defina. Deben ratificarse antes de aplicar 004.

## Contratos preparados

### `POST /api/auth/password-recovery/request`

Entrada JSON exacta:

```json
{ "email": "cuenta@dominio-autorizado" }
```

Respuesta uniforme `202`:

```json
{
  "status": "accepted",
  "recoveryId": "<identificador-opaco>",
  "message": "Si corresponde, recibirás instrucciones para recuperar tu cuenta."
}
```

El mismo endpoint gestiona reenvíos. Una cuenta inexistente recibe un identificador indistinguible y consume los mismos límites, sin crear desafío vinculado a usuario ni intentar enviar a destinatarios arbitrarios.

### `POST /api/auth/password-recovery/reset`

Entrada JSON exacta:

```json
{
  "email": "cuenta@dominio-autorizado",
  "recoveryId": "<identificador-opaco>",
  "code": "000042",
  "newPassword": "<valor-introducido-localmente>"
}
```

Respuesta `200`:

```json
{ "status": "password_updated", "nextAction": "login" }
```

No se propone un endpoint separado para “validar código”: código y nueva contraseña se consumen atómicamente, reduciendo estados intermedios y oráculos. Los códigos incorrectos, vencidos, consumidos o ajenos responden con el futuro error público uniforme `RECOVERY_INVALID`.

## Transacción de cambio

El hash scrypt de la nueva contraseña se calcula antes de abrir la transacción. Dentro de una sola conexión se bloquea siempre usuario y después desafío; se valida propietario, estado, vigencia, intentos y HMAC; se consume el desafío, actualiza `users.password_hash`, revoca todos los demás desafíos activos del usuario y establece `revoked_at` en todas sus sesiones activas. No se modifican rol, perfil ni créditos y no se crea sesión automática.

La notificación de contraseña cambiada ocurre después del commit y no incluye contraseña, código ni identificadores. Un fallo SMTP no revierte el cambio ya confirmado; se registra únicamente un evento sanitizado.

## Claves privadas futuras

- `PASSWORD_RECOVERY_HMAC_KEY_HEX`
- `PASSWORD_RECOVERY_HMAC_KEY_VERSION`
- `PASSWORD_RECOVERY_RATE_HMAC_KEY_HEX`

Las dos claves deben tener 32 bytes, ser distintas entre sí y de OTP, login y CSRF, y permanecer estables. No se generaron ni escribieron claves reales en esta intervención.

## Permisos y aplicación futura

La cuenta de migraciones necesitará `SELECT`, `INSERT`, `CREATE` y `REFERENCES` sobre el esquema exacto. No necesita `ALTER`, `DROP` ni permisos globales para 004. La cuenta de aplicación necesitará su DML existente sobre las dos tablas nuevas y sobre `users`/`auth_sessions` para completar la transacción.

La validación real debe ejecutarse primero en `skillswap_ai_test_auth`. Esta documentación no autoriza `--apply` ni DDL.
