# Correo de verificación — incremento 1.4A

## Adaptador SMTP

`src/adapters/smtp.js` encapsula Nodemailer 10.4.0, dependencia fijada tras verificar metadatos npm, repositorio oficial y compatibilidad Node >=20 (runtime del proyecto: Node 24). No hay proveedor ni remitente configurados en esta intervención. Las pruebas del adaptador inyectan un transporte y **no prueban entrega real**.

La configuración se obtiene mediante `readEmailConfig(source)` sin cargar ni sobrescribir archivos privados. `SMTP_ENABLED=false` o ausente deshabilita el transporte. Para habilitarlo se requieren SMTP_HOST, SMTP_PORT (465 TLS o 587 STARTTLS obligatorio), SMTP_USER, SMTP_PASSWORD y SMTP_FROM (remitente real autorizado por el proveedor). No poner secretos en Git, comandos persistentes, logs o capturas. Utilizar el .env privado existente y conservar sus valores actuales.

El adaptador exige validación del certificado y TLS >=1.2, limita tiempos de conexión/saludo/socket, deshabilita logs y lectura de archivos/URLs y construye un mensaje de texto fijo sin adjuntos. Solo acepta una dirección institucional con el formato de registro. No se configuró un proveedor ficticio ni se envió correo a terceros.

La aceptación SMTP por el servidor no demuestra recepción en el buzón. Para demostrarla se necesita seleccionar proveedor, autorizar remitente y destinatario de prueba institucional, configurar sus credenciales localmente, y comprobar recepción efectiva (incluyendo carpeta spam si corresponde). No se realiza ese envío sin autorización del destinatario. No incluir códigos, mensajes ni direcciones completas en reportes públicos.

Fuentes: [documentación oficial SMTP](https://nodemailer.com/smtp), [configuración de mensajes](https://nodemailer.com/message) y [repositorio oficial](https://github.com/nodemailer/nodemailer). Se instalaron dependencias con scripts deshabilitados; se conserva package-lock.json.

Este adaptador es una unidad independiente. No implementa por sí solo generación/validación de OTP, sesiones ni créditos; el estado del endpoint y sus políticas se documentarán con el servicio correspondiente.
