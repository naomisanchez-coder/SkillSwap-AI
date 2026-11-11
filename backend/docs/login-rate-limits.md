# Límites persistentes de login — migración 003

**Estado:** migración y componentes preparados; no aplicados en MySQL. Login, sesiones, logout y `/me` continúan sin implementación hasta validar 003 en el esquema aislado.

## Semántica aprobada

La admisión reserva **todos** los intentos de login antes de consultar si la cuenta existe o comprobar la contraseña. Esta decisión evita enumeración, mantiene trabajo uniforme y cierra el bypass de solicitudes concurrentes. El límite es cinco intentos por HMAC de correo y veinte por HMAC de IP en una ventana fija de 15 minutos.

La ventana nace con el primer intento admitido. Una solicitud bloqueada devuelve posteriormente `429 RATE_LIMITED` con `Retry-After`, pero no incrementa el contador ni desplaza `expires_at`; un tercero no puede prolongar el bloqueo indefinidamente. Al vencer, la siguiente admisión reinicia contador y ventana. Credenciales admitidas pero inválidas devolverán `401 INVALID_CREDENTIALS` sin distinguir cuentas inexistentes.

## Persistencia y privacidad

`login_rate_limits` almacena únicamente `scope`, HMAC-SHA-256 de 32 bytes, inicio/fin UTC, contador y fechas técnicas. `EMAIL` e `IP` usan contextos HMAC distintos. No se persisten correos ni direcciones IP en claro. La clave `LOGIN_RATE_HMAC_KEY_HEX` es independiente, estable entre instancias y reinicios y nunca se versiona.

La clave primaria `(scope, identifier_hmac)` serializa cada dimensión. El repositorio crea y bloquea siempre `EMAIL` antes de `IP`, usa el reloj de MySQL y reserva ambos contadores en una transacción. La restricción limita el contador a 20 y exige que `expires_at` sea exactamente 15 minutos posterior al inicio.

Los registros dejan de tener efecto al vencer. Para limitar retención y crecimiento, el componente expone limpieza de filas vencidas hace más de 24 horas, en lotes máximos de 100 mediante `ix_login_rate_expiry`. La integración posterior de login deberá invocarla de forma oportunista y acotada; un fallo de limpieza no debe ampliar ni omitir límites.

## Proxy

`TRUST_PROXY_HOPS=0` conserva la IP del socket y no confía en `X-Forwarded-For`. Solo debe cambiarse al conocer la topología exacta. Un número de saltos es seguro únicamente si todas las rutas públicas atraviesan exactamente esos proxies confiables y no existe acceso alternativo directo al backend.

## Aplicación futura aislada

No ejecutar hasta recibir autorización expresa y confirmar credenciales de migración locales:

```sh
cd backend
node --env-file=.env.migrations.local database/migrate.js --check --through=003_login_rate_limits
```

Tras revisar preflight, permisos, checksum y estado pendiente, la aplicación autorizada utilizará:

```sh
node --env-file=.env.migrations.local database/migrate.js --apply --through=003_login_rate_limits
```

Para un esquema que ya contiene 001 y 002, 003 necesita `SELECT`, `INSERT` y `CREATE` sobre el esquema exacto. No necesita `ALTER`, `DROP`, privilegios globales ni permisos administrativos. El entorno principal seguirá exigiendo el mapa de checksums previamente validados en el esquema aislado.

Después de aplicar en pruebas se deberán verificar estructura, CHECK, índice, historial/checksum, segunda ejecución idempotente, concurrencia con conexiones independientes, reinicio de ventana y limpieza. Hasta entonces, las pruebas actuales son exclusivamente estáticas y simuladas.
