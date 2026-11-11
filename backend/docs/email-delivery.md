# Emisión de correo y propuesta OTP 002

**Estado: migración 002 aplicada y validada en skillswap_ai y skillswap_ai_test_auth. Infraestructura 1.4A completa; Brevo/STARTTLS y recepción institucional comprobados de forma controlada.**

La política aprobada está en email.policy.js: seis dígitos con crypto.randomInt, 600 segundos de vigencia, cinco intentos por desafío, 60 segundos entre solicitudes admitidas y máximo cinco por correo en ventana móvil de una hora. Los valores distintos en variables OTP_* se rechazan; no son decisiones pendientes. Los intentos se guardan y consumen transaccionalmente por 1.4B.

Flujo preparado: auth.routes → auth.controller → email.service → repositorios → MySQL; smtp.js es un adaptador sustituible. POST /api/auth/email/send-code admite solo email institucional normalizado y devuelve 202 uniforme con status, verificationId y message. No devuelve código/HMAC, cookie, identidad de usuario ni información de elegibilidad. Una solicitud rechazada por cuota devuelve 429 con Retry-After independientemente de que exista la cuenta. Un fallo general/configuración/esquema devuelve 503. El registro conserva su respuesta y no envía correos automáticamente.

El cupo se adquiere de forma persistente antes de consultar el usuario, por HMAC del correo con clave independiente. El repositorio de desafíos comprueba que el historial 002 exista antes de habilitar el flujo. Sin 002 no hay admisión ni envío. La emisión crea SENDING, no PENDING; solo la aceptación SMTP seguida de una confirmación MySQL permite PENDING. Fallar SMTP y la compensación deja un estado no verificable. Los reenvíos revocan desafíos previos y la confirmación tardía no los reactiva. La red SMTP ocurre fuera de las transacciones.

El código se guarda exclusivamente como HMAC-SHA-256 con clave de 32 bytes y contexto JSON ['skillswap-email-v1',id,email,code]. No se usan códigos de Figma. La fila conserva versión de clave, fechas UTC y máximo de intentos. Una etiqueta de estado no sustituye la comprobación de expiración. El verificador acepta solo `PENDING` vigente con intentos disponibles, propietario coincidente y código correcto.

La cola sigue acotada a 100 tareas, con dos trabajadores y sin durabilidad. Los reinicios conservan el cupo persistido pero pueden perder tareas aceptadas; no hay garantía de entrega. Los límites HTTP por IP/origen complementan MySQL, sin almacenar IP en la base. Son por proceso y deberán revisarse junto al proxy/múltiples instancias antes de uso público.

## Configuración privada y validación SMTP

Nodemailer 10.4.0 está fijado y fue comprobado para Node 24. Usa TLS/certificado verificado (puerto 465 o STARTTLS obligatorio 587), límites de conexión/saludo/socket, logs deshabilitados y sin carga de archivos/URLs. Construye un texto fijo sin adjuntos. Las pruebas usan transporte sustituido y no demuestran recepción.

La migración 002 ya está aplicada y validada en ambas bases. El proveedor configurado para la prueba fue Brevo mediante `smtp-relay.brevo.com:587`, STARTTLS obligatorio y remitente verificado. `SMTP_ENABLED` permanece false en reposo y solo se habilitó en memoria durante las ejecuciones autorizadas. Las variables privadas siguen siendo SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD y SMTP_FROM; no mostrar sus valores ni ponerlos en comandos persistentes, Git o capturas.

También se requieren OTP_HMAC_KEY_HEX (64 caracteres hexadecimales aleatorios), OTP_HMAC_KEY_VERSION y OTP_RATE_HMAC_KEY_HEX (otra clave de 32 bytes, distinta y estable). Los valores de política ya están fijados por el backend y reflejados en .env.example; no es necesario copiar sobrescrituras a un archivo privado. No se modificó ningún archivo privado durante esta preparación. Todas las instancias deben conservar la misma clave de frecuencia; su rotación necesita un procedimiento para no reiniciar cupos. La rotación de claves de desafíos deberá contemplar su versión durante 1.4B.

La aceptación del servidor SMTP no acredita recepción en el buzón. En las pruebas controladas, Brevo aceptó los mensajes y la usuaria confirmó visualmente la recepción institucional. Gmail mostró una advertencia de autenticación del remitente: DKIM/DMARC no están completamente configurados y deben resolverse antes de habilitar envíos públicos a otros estudiantes. No registrar destinatarios, identificadores de mensaje, OTP ni credenciales en esta documentación.

Ver [diseño, permisos, estados, migrador y riesgos de 002](otp-migration-002.md). La validación aislada real de 002, la concurrencia entre conexiones y procesos y los fallos controlados de actualización/COMMIT están documentados en la propuesta. No se afirma cobertura de todas las pérdidas de red. El endpoint de verificación 1.4B activa la cuenta y concede 20 créditos de manera atómica; login y sesiones continúan ausentes.

Referencias oficiales: [SMTP Nodemailer](https://nodemailer.com/smtp), [configuración de mensajes](https://nodemailer.com/message) y [repositorio](https://github.com/nodemailer/nodemailer).
