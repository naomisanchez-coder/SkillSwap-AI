# Entorno local de sustentación

`skillswap_ai_demo` es un tercer esquema local independiente. No sustituye `skillswap_ai` ni `skillswap_ai_test_auth`; los manifiestos `DEMO_ONLY` solo pueden cargarse aquí o en el esquema aislado de pruebas.

## Identidades exactas

- Runtime Express y DML: `skillswap_demo_app@127.0.0.1` sobre `skillswap_ai_demo`.
- Migraciones: `skillswap_demo_migrator@127.0.0.1` sobre `skillswap_ai_demo`.

El backend rechaza cualquier combinación diferente. El migrador conserva la lista cerrada de tres esquemas, rechaza privilegios globales/excesivos y exige para demo los checksums previamente validados de 001–008.

## Configuración privada

Los archivos locales ignorados son `.env.demo.local` y `.env.migrations.demo.local`, ambos con modo `0600`. Completar únicamente `DB_PASSWORD` y `MIGRATION_PASSWORD` desde el editor local. No copiar esos valores a `.env.example`, comandos, capturas o conversación.

Las claves HMAC de login, CSRF y recuperación deben generarse como valores hexadecimales independientes de 32 bytes y permanecer estables. Las claves OTP y credenciales SMTP se cargan separadamente desde `.env.smtp.local`; ese archivo permanece con `SMTP_ENABLED=false` en reposo.

## Secuencia controlada aplicada

Las migraciones 001–008 fueron aplicadas con el migrador oficial y quedaron registradas con checksum independiente. El esquema conserva 14 carreras, 84 asociaciones carrera/ciclo, tres habilidades y tres niveles `DEMO_ONLY`, además de los tres mentores persistentes. Una ejecución posterior del preflight no repitió DDL.

El procedimiento reproducible para comprobar o volver a preparar un esquema demo autorizado es:

```sh
node scripts/demo-mentors.js --check .env.demo.local
DEMO_MENTORS_ALLOW_WRITE=yes node scripts/demo-mentors.js --apply .env.demo.local
node scripts/demo-mentors.js --check .env.demo.local
```

El cargador solo admite la pareja exacta `skillswap_ai_demo`/`skillswap_demo_app`. Registra las cuentas mediante el servicio institucional, verifica códigos con un transporte sustituible que no envía correo, concede los créditos iniciales por la transacción oficial, almacena avatares y certificados sintéticos en el almacenamiento privado, y utiliza los servicios ADMIN para revisar documentos, aprobar y asignar niveles. No crea un estudiante visor ni sustituye el registro/OTP normal de la demostración. Repetirlo sobre un estado completo no duplica datos; cualquier estado parcial o conflictivo se rechaza.

La comprobación operativa crea un estudiante temporal mediante registro y OTP sustituido, abre una sesión real, consulta los endpoints HTTP de Explorar y recomendaciones, reserva, comprueba la retención, cancela concurrentemente y comprueba el reembolso. El bloque `finally` elimina únicamente ese estudiante y sus registros identificados; conserva catálogos y mentores:

```sh
DEMO_VERIFY_ALLOW_WRITE=yes node scripts/verify-demo.js .env.demo.local
```
No se debe ejecutar ningún paso si la identidad, el destino, el historial o los permisos difieren. La configuración por sí sola no demuestra que las migraciones o datos se hayan aplicado.

## Arranque previsto

Express se inicia con la configuración demo. Para habilitar el chatbot se carga primero el archivo de IA; SMTP se incorpora solo durante una prueba de correo expresamente autorizada:

```sh
node --env-file=.env.ai.local --env-file=.env.demo.local src/server.js
```

Sin autorización de envío, no cargar una activación SMTP; el servidor conserva el transporte real deshabilitado. React utilizará posteriormente `http://localhost:4000`, pero la integración y validación visual del frontend siguen pendientes en `develop`.
