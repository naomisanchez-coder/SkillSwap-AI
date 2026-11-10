# Correo de verificación — incremento 1.4A

## Adaptador SMTP

`src/adapters/smtp.js` encapsula Nodemailer 10.4.0, dependencia fijada tras verificar metadatos npm, repositorio oficial y compatibilidad Node >=20 (runtime del proyecto: Node 24). No hay proveedor ni remitente configurados en esta intervención. Las pruebas del adaptador inyectan un transporte y **no prueban entrega real**.

La configuración se obtiene mediante `readEmailConfig(source)` sin cargar ni sobrescribir archivos privados. `SMTP_ENABLED=false` o ausente deshabilita el transporte. Para habilitarlo se requieren SMTP_HOST, SMTP_PORT (465 TLS o 587 STARTTLS obligatorio), SMTP_USER, SMTP_PASSWORD y SMTP_FROM (remitente real autorizado por el proveedor). No poner secretos en Git, comandos persistentes, logs o capturas. Utilizar el .env privado existente y conservar sus valores actuales.

El adaptador exige validación del certificado y TLS >=1.2, limita tiempos de conexión/saludo/socket, deshabilita logs y lectura de archivos/URLs y construye un mensaje de texto fijo sin adjuntos. Solo acepta una dirección institucional con el formato de registro. No se configuró un proveedor ficticio ni se envió correo a terceros.

La aceptación SMTP por el servidor no demuestra recepción en el buzón. Para demostrarla se necesita seleccionar proveedor, autorizar remitente y destinatario de prueba institucional, configurar sus credenciales localmente, y comprobar recepción efectiva (incluyendo carpeta spam si corresponde). No se realiza ese envío sin autorización del destinatario. No incluir códigos, mensajes ni direcciones completas en reportes públicos.

Fuentes: [documentación oficial SMTP](https://nodemailer.com/smtp), [configuración de mensajes](https://nodemailer.com/message) y [repositorio oficial](https://github.com/nodemailer/nodemailer). Se instalaron dependencias con scripts deshabilitados; se conserva package-lock.json.

Este adaptador es una unidad independiente. No implementa por sí solo generación/validación de OTP, sesiones ni créditos; el estado del endpoint y sus políticas se documentarán con el servicio correspondiente.

## Servicio y endpoint parametrizables

`POST /api/auth/email/send-code` está implementado como infraestructura 1.4A. Sin SMTP habilitado responde 503 para cualquier correo institucional válido; no simula entregas. Registro 1.3B no envía mensajes automáticamente y conserva su respuesta.

Flujo: auth.routes → auth.controller → email.service → email.repository → MySQL; smtp.js es el adaptador sustituible. El cuerpo admite únicamente email normalizado con la gramática institucional del registro. Exige JSON, origen permitido cuando se suministra Origin y Cache-Control no-store; no establece cookie. La respuesta configurada es 202 `{status,verificationId,message}` según auth-api.md, sin OTP, hash ni diagnóstico del proveedor.

Para no condicionar el tiempo de respuesta a la elegibilidad o a SMTP, se acepta una tarea antes de procesar el usuario. Se comprueba disponibilidad general de MySQL para todos los correos; un fallo general puede responder 503. Hay como máximo 100 tareas en memoria y dos trabajadores. Usuarios inexistentes, ya verificados, deshabilitados o limitados por el historial reciben la misma aceptación pública y no generan mensajes. Los IDs públicos son UUID aleatorios también para solicitudes no elegibles; no prueban que exista un desafío ni autorizan acceso.

El repositorio bloquea la fila del usuario y toma hora UTC de MySQL. Comprueba rol STUDENT, estado pendiente, email_verified_at nulo, espera mínima y emisión acumulada dentro de la ventana. Cuenta todos los desafíos emitidos (también revocados/expirados/fallos de transporte), por lo que reenviar no reinicia los límites. Revoca códigos anteriores o los marca EXPIRED si vencieron y crea el nuevo en una transacción. La llamada SMTP ocurre después del commit y liberación de conexión. No crea sesiones ni créditos.

El código se genera con crypto.randomInt, con ceros iniciales y longitud configurada. MySQL almacena únicamente HMAC-SHA-256 con clave exclusiva de 32 bytes, versión y contexto `['skillswap-email-v1',id,email,code]` serializado como JSON. No basta un hash sin clave para un espacio numérico reducido. No se usan códigos de Figma. El servidor comprueba vencimiento antes del envío; 1.4B deberá comprobarlo otra vez al validar, aunque una fila todavía conserve status PENDING.

Un error SMTP revoca únicamente el nuevo desafío, sin restaurar códigos previos ni reintentar automáticamente un resultado de red incierto. La aceptación HTTP no cambia según ese fallo. Solo se emiten etiquetas técnicas estáticas smtp_accepted, delivery_failed, persistence_failed o revocation_failed; no IDs, destinatarios, mensajes, claves o códigos. Si falla también la revocación, no se puede garantizar ese cambio en MySQL: queda la expiración original y debe investigarse la etiqueta técnica. No se afirma una garantía transaccional entre MySQL y SMTP.

## Configuración obligatoria de OTP y decisiones pendientes

No hay valores funcionales predeterminados: activar SMTP exige configurar expresamente OTP_HMAC_KEY_HEX (64 caracteres hexadecimales generados aleatoriamente de forma local), OTP_HMAC_KEY_VERSION (identificador de 1–50 caracteres), OTP_DIGITS, OTP_TTL_SECONDS, OTP_COOLDOWN_SECONDS, OTP_WINDOW_SECONDS, OTP_MAX_PER_WINDOW y OTP_MAX_ATTEMPTS. No reutilizar contraseñas, claves SMTP ni ejemplos como clave HMAC. Conservar la clave fuera de Git; su pérdida/rotación afecta los desafíos pendientes. 1.4B deberá resolver las versiones antiguas o acordar su invalidación durante una rotación.

La ratificación solicitada de seis dígitos, 600 segundos, cinco intentos, espera de 60 segundos y cinco emisiones en una hora sigue pendiente. Estos valores se usan **solo como política sintética inyectada en pruebas**, no como configuración de producción ni acuerdo implícito. Ningún archivo privado fue modificado. Los parámetros efectivos deben corresponder a la política que apruebe la responsable del proyecto.

Como barreras técnicas, el componente admite 6–8 dígitos, hasta 3600 segundos de vigencia, cooldown mínimo de 60 segundos, ventana hasta un día, máximo 20 emisiones por ventana y hasta diez intentos; esos límites no sustituyen la aprobación de valores concretos. El limitador HTTP aplica una solicitud/correo por cooldown y el máximo/correo por ventana configurados, incluso para correos inexistentes. Además limita IP a 20/cooldown y 100/ventana, con hasta 2000 claves hash por limitador. Devuelve 429 y Retry-After. No se confía automáticamente en cabeceras de proxy.

Los límites HTTP y la cola son por proceso, sin durabilidad ni coordinación entre instancias. Un reinicio puede perder tareas aceptadas. Los límites persistidos de usuarios elegibles se conservan en MySQL, pero no equivalen a una cola durable. Antes de despliegue público, revisar cola durable/outbox, observabilidad, retención, proxy y límites compartidos. No se añadió DDL ni se amplió la migración 001 para resolverlos silenciosamente. Tras reinicio o límite persistente, una aceptación puede no crear un nuevo desafío; React debe respetar Retry-After y no asumir recepción ni validez por un 202.

## Pruebas y siguiente incremento

`node scripts/verify-local.js` usa la cuenta DML skillswap_test_app exclusivamente en skillswap_ai_test_auth. Las pruebas crean fixtures propios, comprueban locks concurrentes, expiración, revocación, límite acumulado, HMAC persistido, rollback real por CHECK, ausencia de sesiones/créditos, contrato HTTP y compensación ante un transporte sustituido que falla. Eliminan únicamente sus fixtures. Ninguna de estas pruebas demuestra conexión/entrega SMTP real.

1.4B queda pendiente: endpoint de validación con comparación HMAC en tiempo constante, límite atómico de intentos, expiración/revocación, uso único, verificación del usuario y concesión inicial de 20 créditos exactamente una vez mediante transacción y restricciones existentes. Debe conservar el orden de bloqueo por usuario, decidir política de claves antiguas y respuestas públicas uniformes. No se implementaron verificación ni login en 1.4A.
