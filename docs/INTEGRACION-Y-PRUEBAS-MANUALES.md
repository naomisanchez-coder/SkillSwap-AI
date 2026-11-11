# Integración en develop y guía de sustentación

**Actualización posterior a las pruebas de Naomi:** consultar [Correcciones de perfil y Gemini](CORRECCIONES-PERFIL-Y-GEMINI.md). Este documento conserva el estado de la primera integración; la guía nueva detalla las correcciones y la migración 009 pendiente.

Fecha: 11 de noviembre de 2026 (Lima). Las pruebas manuales de esta guía están **pendientes y corresponden exclusivamente a Naomi**. Codex no ha registrado estudiantes, enviado OTP/correos, invocado Gemini, reservado/cancelado ni alterado créditos o datos demo.

## Ramas e historial

- Repositorio compartido: `/Users/naomisanchez/Desktop/PreTesis-SkillSwap`.
- Worktree: `/Users/naomisanchez/Desktop/Integración-SkillSwap`, rama `develop`.
- Frontend identificado: `origin/feature/frontend`, commit `4d88240`.
- Backend integrado: `origin/feature/backend`, commit `05162c654d772ce4d82d7e91f3271a5cf9bc93d1`.
- Merge backend: `c7634ca`; merge frontend: `218bdf6`. Ambos son merges normales con dos padres; no hubo conflictos ni descartes.
- Las ramas `main`, `feature/backend` y la rama de frontend se conservan. Fetch, worktree y commits comparten los metadatos Git del repositorio original; sus archivos de trabajo no se modifican.
- Consultar los commits reales posteriores con `git log --oneline origin/develop`.

## Conexión de pantallas

Se reutilizan los componentes, estilos, iconos y navegación del frontend aprobado. `StudentApp.tsx` compone esas pantallas con adaptadores HTTP, sin los servicios de datos de prueba del preview.

| Pantalla | Fuente real |
| --- | --- |
| Registro y OTP | `/api/auth/register`, `/email/send-code`, `/email/verify` |
| Login, sesión, logout | `/api/auth/login`, `/me`, `/logout` |
| Recuperación | `/api/auth/password-recovery/request`, `/reset` |
| Perfil, carrera, ciclo, foto | `/api/student/profile`, `/profile/photo` |
| Onboarding e intereses | `/api/student/onboarding`, `/skills/catalog`, `/skills/:skillId` |
| Mis habilidades y solicitud | `/api/student/skills`, `/mentor-applications` y certificados privados |
| Dashboard y progreso | `/api/student/dashboard`, `/credits`, `/sessions` |
| Explorar, detalle, disponibilidad | `/api/student/explore/mentors` y sus rutas de detalle/disponibilidad |
| Para ti | `/api/student/recommendations`, con puntuación y cobertura originales del servidor |
| Reservas y sesiones | `/api/student/bookings`, `/sessions`, cancelación, validación y valoración |
| Créditos | `/api/student/credits`, con todos los movimientos paginados y saldo del servidor |
| Asistente | `/api/student/ai/chat`, sin reintentos automáticos |

El CSRF de `/auth/me` permanece en memoria. Las solicitudes autenticadas incluyen cookies; las mutaciones incluyen `X-CSRF-Token`. No se guardan contraseñas, sesión, CSRF ni respuestas Gemini en localStorage. El borrador de reserva es temporal, en memoria; recargar antes de confirmar descarta la selección. Las reservas confirmadas se vuelven a consultar en MySQL.

Los catálogos demo proceden de MySQL: no se traducen los UUID ni se reemplazan los nombres de las habilidades por fixtures React. La intención LEARN se sincroniza al guardar preferencias, conservando TEACH. El ranking parcial no se renormaliza ni se presenta como evidencia completa. No se inventan fotografías ni valoraciones públicas ausentes.

Cambios aditivos del contrato backend: cada habilidad ofrecida incluye `offerId` y `costByDuration`; el perfil incluye `hasPhoto`; créditos agrega `used`, `earned` y `transactions[].holdStatus`. Las sesiones agregan las fechas reales de creación, inicio, realización, validación y cancelación. Se preservan los campos y las rutas existentes. La reserva envía únicamente `requestId`, `offerId`, `startsAt` UTC y `durationMinutes`.

## Límites de esta etapa

- Las pantallas mentor y administrador se conservan en el código, sin habilitar sus operaciones en el acceso integrado. No usar `VITE_ENABLE_FRONTEND_PREVIEW=true` para la sustentación.
- La API exige sesión para Explorar. Antes de iniciar sesión, la portada no inventa un catálogo público de mentores. Después del login se consulta el catálogo real.
- La solicitud de mentor persiste habilidad, certificado y portafolio. Nivel declarado, experiencia y temas permanecen visibles pero deshabilitados porque el contrato actual no los almacena. El nivel de mentor depende de la validación administrativa.
- Las correcciones de solicitudes existentes permiten reemplazar el certificado y reenviar; conservan habilidad y portafolio. El historial administrativo completo no tiene una ruta de lectura para esta UI.
- Las notificaciones y el reporte de incidencias no tienen contrato estudiantil completo: se presentan sin datos ficticios y el reporte permanece deshabilitado.
- El listado de sesiones muestra hasta las 50 sesiones más recientes, límite actual del backend. Los movimientos de créditos sí se recorren por cursor hasta el final.
- Las reseñas individuales públicas no están expuestas por la API actual. La UI no fabrica calificaciones.
- La cancelación real se admite antes del inicio, según el backend. El preview conserva su regla referencial de 12 horas; no rige la integración.

## Preparación privada y local

Node instalado durante la verificación: 24.21.0. Ya se ejecutó `npm ci --ignore-scripts` en ambos proyectos. Para reinstalar, usar ese mismo comando dentro de cada carpeta; no ejecutar migraciones, seeds ni sincronizaciones de catálogos para arrancar esta demo.

El lanzador `backend/scripts/start-integrated-demo.js` lee exclusivamente estos archivos privados existentes de `PreTesis-SkillSwap/backend`, con permisos 0600:

1. `.env`
2. `.env.smtp.local` (sus claves OTP también se necesitan con SMTP apagado)
3. `.env.ai.local`
4. `.env.demo.local`

Las claves de seguridad vacías de la plantilla demo heredan las claves privadas válidas de los archivos anteriores. No se muestran ni se copian al repositorio. Se verifica la identidad `skillswap_ai_demo` / `skillswap_demo_app`, MySQL local, las políticas de seguridad y el almacenamiento existente.

El almacenamiento previo se abre **solo para lectura**. Nuevas cargas y limpieza se realizan en `Integración-SkillSwap/backend/.private-storage/demo`, ignorado por Git. Así no se reemplazan ni borran fotografías o certificados de la carpeta original. Las nuevas cargas de esta integración requieren seguir usando este lanzador; un servidor anterior con otro almacenamiento no podrá leerlas automáticamente.

`frontend/.env.local` ya está preparado, ignorado y con permisos 0600:

```dotenv
VITE_API_URL=http://localhost:4000/api
VITE_ENABLE_API_SESSION=true
VITE_ENABLE_FRONTEND_PREVIEW=false
```

Si se necesita recrearlo, copiar `frontend/.env.example` a `frontend/.env.local` y aplicar `chmod 600 frontend/.env.local`. No añadir claves privadas ni variables de proveedor `VITE_*`.

## Arranque exacto

Antes de iniciar, cerrar con Ctrl+C cualquier Express previo que use la demo, incluso en otro puerto. Revisar los servidores Node y los puertos; el lanzador también rechaza un puerto 4000 ocupado:

```sh
lsof -nP -iTCP -sTCP:LISTEN
```

Comprobar la configuración, sin abrir MySQL, SMTP ni Gemini:

```sh
cd '/Users/naomisanchez/Desktop/Integración-SkillSwap/backend'
npm run demo:config-check
```

Para el recorrido manual que incluye OTP y recuperación, Naomi debe iniciar explícitamente con SMTP:

```sh
npm run demo:start -- --smtp
```

Para revisar arranque sin enviar correos desde la aplicación:

```sh
npm run demo:start
```

Este último modo deshabilita las rutas de envío OTP y solicitud de recuperación. No usarlo para el paso de registro completo. El chatbot no llama a Gemini al arrancar; solo al enviar una consulta desde su pantalla.

En otra terminal:

```sh
cd '/Users/naomisanchez/Desktop/Integración-SkillSwap/frontend'
npm run dev -- --host localhost --port 5173 --strictPort
```

Abrir **http://localhost:5173**. No alternar entre localhost y 127.0.0.1: la cookie y el origen CORS deben ser coherentes. El backend escucha en 127.0.0.1:4000 y permite exactamente http://localhost:5173.

Para terminar, Ctrl+C en ambas terminales. No dejar otro Express apuntando a la misma demo. No se requiere desplegar ni modificar `skillswap_ai` o `skillswap_ai_test_auth`.

## Recorrido manual de Naomi, en orden

1. **Registro.** Crear una cuenta institucional propia desde la portada, completar carrera/ciclo y aceptar los documentos. Confirmar que queda pendiente de verificación. No repetir el registro si aparece un error ambiguo de red; comprobar primero el resultado.
2. **OTP.** Pulsar Solicitar código una vez, revisar el correo y spam e introducir los seis dígitos. La respuesta de envío es genérica y no confirma entrega SMTP. Si se solicita reenviar, respetar el cooldown de 60 segundos. Tras verificar, volver a iniciar sesión.
3. **Login.** Acceder con la cuenta verificada. En DevTools, comprobar cookie `skillswap_session` HttpOnly y ausencia de sesión/CSRF en localStorage. Recargar para verificar recuperación mediante `/auth/me`.
4. **Perfil.** Completar el onboarding con una habilidad exacta del catálogo MySQL, nivel, horario y objetivo. En Mi perfil, guardar biografía de hasta 500 caracteres, carrera vigente y ciclo válido. Subir una foto JPG/PNG/WebP de hasta 2 MB y recargar para comprobar persistencia.
5. **Habilidades.** Comprobar los intereses guardados y editarlos. Si se ensaya solicitud de mentor, adjuntar un PDF válido de hasta 5 MB y un portafolio HTTPS opcional. Confirmar estado pendiente; no se activa el panel mentor ni se simula aprobación.
6. **Explorar y Para ti.** Comprobar los tres mentores demo persistentes con sus nombres reales. Revisar filtros, detalle y horarios. En Para ti comprobar estado parcial/cobertura cuando falten señales. Si no hay coincidencias, elegir una habilidad que efectivamente ofrezca un mentor demo y guardar preferencias; no añadir datos a MySQL para forzar el resultado.
7. **Reservas.** Elegir mentor, fecha futura, horario y duración disponible. Revisar la tarifa que entrega el backend: 30/60/90 minutos corresponden a 5/10/15 créditos. Confirmar una sola vez y guardar el ID de la reserva. La API valida disponibilidad y saldo; nunca los confirma el chatbot.
8. **Créditos.** Revisar el total, retenido, disponible y movimientos. En una cuenta nueva, tras la verificación se esperan 20 créditos una sola vez. Si se reserva 30 minutos y no hay otras operaciones, deben verse 20 totales, 5 retenidos y 15 disponibles. Recargar y comprobar Mis sesiones.
9. **Cancelación.** Antes del inicio, cancelar la reserva y confirmar. En el ejemplo anterior, deben quedar 20 totales, 0 retenidos y 20 disponibles. Revisar el movimiento de devolución y que recargar no duplique el reembolso.
10. **Chatbot.** En el asistente, enviar una consulta académica breve sin datos privados. Comprobar que responde desde `/api/student/ai/chat`. Si aparece cuota o indisponibilidad, verificar el mensaje y no realizar reintentos continuos. La vigencia de la clave y la cuota del proveedor quedan por comprobar manualmente.
11. **Logout y recuperación (comprobación adicional).** Cerrar sesión y verificar que recargar no abre el panel privado. Desde Login, solicitar recuperación una vez, usar el código recibido y una contraseña nueva; volver a iniciar sesión. La solicitud de recuperación no revela si existe la cuenta.

Registrar cualquier fallo con el paso, hora de Lima, mensaje visible y código HTTP público. No compartir contraseñas, OTP, cookies, CSRF, archivos `.env`, certificados ni claves API. Estas pruebas todavía no se han realizado.

## Evidencia técnica y pendientes

- Merges sin conflictos y compilación React/TypeScript correctos.
- ESLint correcto; pruebas frontend y backend con mocks. Los resultados finales se registran en `VERIFICACIONES-TECNICAS.md`.
- Configuración privada validada sin mostrar secretos.
- Arranque temporal sin SMTP: `/api/health` y `/api/health/db` devolvieron 200; servidor cerrado al terminar. Solo se leyeron datos de conexión y migraciones, sin operaciones de negocio.
- No se ejecutaron pruebas de integración que escriben en MySQL ni recorridos de navegador.
- npm informó diez avisos moderados en herramientas de desarrollo del frontend, derivados de minimatch/ESLint/TypeScript-ESLint. No son dependencias de producción; la corrección propuesta por npm implica cambios mayores y no se aplicó `audit fix --force`.
- Vite advierte que el bundle principal supera 500 kB. No impide la compilación ni altera el diseño.
- Pendientes: pruebas manuales completas de esta guía, validación visual por Naomi y confirmación manual de SMTP y Gemini. No afirmar que estas ya pasaron.
