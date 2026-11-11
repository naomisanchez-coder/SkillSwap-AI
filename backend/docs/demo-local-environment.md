# Entorno local de sustentación

`skillswap_ai_demo` es un tercer esquema local independiente. No sustituye `skillswap_ai` ni `skillswap_ai_test_auth`; los manifiestos `DEMO_ONLY` solo pueden cargarse aquí o en el esquema aislado de pruebas.

## Identidades exactas

- Runtime Express y DML: `skillswap_demo_app@127.0.0.1` sobre `skillswap_ai_demo`.
- Migraciones: `skillswap_demo_migrator@127.0.0.1` sobre `skillswap_ai_demo`.

El backend rechaza cualquier combinación diferente. El migrador conserva la lista cerrada de tres esquemas, rechaza privilegios globales/excesivos y exige para demo los checksums previamente validados de 001–008.

## Configuración privada

Los archivos locales ignorados son `.env.demo.local` y `.env.migrations.demo.local`, ambos con modo `0600`. Completar únicamente `DB_PASSWORD` y `MIGRATION_PASSWORD` desde el editor local. No copiar esos valores a `.env.example`, comandos, capturas o conversación.

Las claves HMAC de login, CSRF y recuperación deben generarse como valores hexadecimales independientes de 32 bytes y permanecer estables. Las claves OTP y credenciales SMTP se cargan separadamente desde `.env.smtp.local`; ese archivo permanece con `SMTP_ENABLED=false` en reposo.

## Secuencia controlada pendiente

1. Ejecutar el preflight de 001 con `.env.migrations.demo.local`.
2. Aplicar 001 con autorización DDL en memoria.
3. Confirmar el permiso `ALTER` exacto sobre `skillswap_ai_demo.email_verifications`.
4. Ejecutar preflight y aplicar hasta `008_mentor_skill_levels`.
5. Cargar el catálogo académico aprobado y luego los catálogos de habilidades/niveles `DEMO_ONLY` mediante `skillswap_demo_app`.
6. Provisionar los tres mentores con el procedimiento privilegiado auditado, archivos sintéticos privados, solicitudes ADMIN, ofertas, niveles y disponibilidad.

No se debe ejecutar ningún paso si la identidad, el destino, el historial o los permisos difieren. La configuración por sí sola no demuestra que las migraciones o datos se hayan aplicado.

## Arranque previsto

Cuando el entorno esté validado, Express se inicia cargando primero SMTP y después la configuración demo, manteniendo cualquier activación de SMTP explícita solo para la ejecución autorizada:

```sh
SMTP_ENABLED=true node --env-file=.env.smtp.local --env-file=.env.demo.local src/server.js
```

Sin autorización de envío, omitir `SMTP_ENABLED=true`; el servidor conserva SMTP deshabilitado. React utilizará posteriormente `http://localhost:4000`, pero la integración del frontend queda fuera de este incremento.
