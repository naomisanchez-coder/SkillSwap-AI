# Contratos de autenticación — SkillSwap AI

**Registro, envío/verificación de correo, recuperación de contraseña y los endpoints `login`, `logout` y `me` están implementados.** Recuperación está validada en el esquema aislado; 004 y sus claves aún no están habilitadas en la base principal. El perfil ampliado sigue fuera de alcance.

## Fuentes y precedencia

Se aplican las decisiones definitivas del contexto maestro, las correcciones posteriores de Figma, las capturas confirmadas y, finalmente, la documentación académica contextual. Las auditorías históricas y simulaciones no prueban el comportamiento actual de Express.

La corrección final de Figma exige `nombre.apellido@tecsup.edu.pe`, normalización y rechazo de usuarios sin punto y alias con `+`. Reemplaza la antigua configuración sin dominio y la interpretación de que el punto era opcional. La gramática inicial implementada exige dos segmentos alfabéticos ASCII; ampliar números, guiones o segmentos requiere aprobación.

## Reglas definidas

- Registro público únicamente para estudiantes TECSUP; institución fija y rol interno `STUDENT` asignados por servidor.
- Roles internos `STUDENT` y `ADMIN`. Mentor es un modo de la misma cuenta estudiantil, no otro rol de cuenta.
- Administradores fuera del registro público; sin credenciales predeterminadas ni acceso demo en Express.
- Correo normalizado con recorte exterior y minúsculas antes de validar y comprobar unicidad. No eliminar puntos ni transformar alias en otra dirección.
- Dominio exacto `tecsup.edu.pe`; rechazar personales, subdominios, dominios falsificados, `demo.pe`, usuarios sin punto, alias con `+` y espacios interiores.
- Formato válido no equivale a propiedad verificada del buzón ni demuestra matrícula vigente.
- Verificación mediante envío real y código temporal seguro. Nunca reutilizar el código fijo del prototipo.
- Conceder 20 créditos académicos una sola vez por cuenta, después de verificar correo, sin esperar al onboarding. La operación debe ser atómica y auditable.
- Una cuenta no verificada no recibe acceso a funcionalidades protegidas.
- MySQL es la fuente de verdad de identidad, verificación, sesiones, permisos y créditos.
- Mantener los campos visuales aprobados. No trasladar autenticación ni saldos manipulables del navegador.

## Convenciones comunes

Base: `/api`. Entrada JSON con `Content-Type: application/json` para solicitudes con cuerpo. IDs públicos como cadenas opacas. No coercionar números o booleanos enviados como texto. No aceptar asignación masiva de campos internos.

Roles públicos propuestos: `student` y `admin`, mediante mapeo explícito de los internos, para compatibilidad con React. Esto no permite al cliente seleccionar rol. Los ejemplos son esquemas ilustrativos; los marcadores entre ángulos no son valores válidos ni credenciales.

Los mensajes y códigos de aplicación son públicos; no incluir SQL, trazas, rutas privadas, contraseñas, códigos enviados o identificadores de sesión en errores. Respuestas de autenticación y perfil con `Cache-Control: no-store`.

### Esquema de errores

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Revisa los datos enviados.",
    "fields": {
      "email": "Usa el formato nombre.apellido@tecsup.edu.pe."
    }
  }
}
```

`fields` es opcional y solo contiene campos públicos de validación; nunca reproduce valores sensibles. La infraestructura 1.3A implementa este esquema mediante PublicError con códigos y mensajes curados; el registro utiliza este contrato y los demás endpoints siguen propuestos. Los errores genéricos del driver nunca se serializan. El 404 y las respuestas de salud conservan su formato anterior. EMAIL_ALREADY_REGISTERED está implementado y aprobado para registro (409).

| HTTP | Uso propuesto |
| --- | --- |
| 400 | JSON malformado |
| 401 | Credenciales inválidas o sesión ausente/vencida |
| 403 | Cuenta no habilitada, origen rechazado o CSRF inválido |
| 409 | Correo duplicado en registro (aprobado) |
| 413 | Cuerpo excesivo |
| 415 | Tipo de contenido no admitido |
| 422 | Validación de campos o desafío inválido |
| 429 | Límite de solicitudes; incluir `Retry-After` en segundos |
| 500 | Error interno genérico |
| 503 | Dependencia necesaria no disponible |

### Sesiones y CSRF implementados

Sesiones persistidas en MySQL. La cookie opaca es `HttpOnly`, `Secure` en producción, `Path=/` y `SameSite=Lax`. Sin Recordarme: 30 minutos de inactividad y 8 horas absolutas. Con Recordarme: 7 días de inactividad, 30 días absolutas y `Max-Age` de 30 días.

Regenerar el identificador al autenticar. Revocar la sesión en servidor al cerrar y eliminar la cookie con los mismos atributos de alcance. Consultar la habilitación de la cuenta al autorizar. No entregar access/refresh tokens para guardarlos en Web Storage.

React envía `credentials: 'include'` en operaciones de sesión. Express deberá habilitar credenciales CORS únicamente para orígenes permitidos. Usar un host consistente en desarrollo; `localhost` y `127.0.0.1` no son intercambiables para cookies. Evaluar cookies y HTTPS en el despliegue final sin relajar controles de producción.

Login devuelve un token CSRF HMAC ligado a la sesión y codificado en 64 caracteres hexadecimales. React lo conserva en memoria; las mutaciones autenticadas lo envían en `X-CSRF-Token`. `GET /api/auth/me` lo recupera sin rotación ni sesión nueva.

Para login público: exigir JSON y el encabezado `X-CSRF-Protection: 1` que ya envía React, validar estrictamente origen y rechazar solicitudes simples. Ese encabezado constante no es un secreto. Para operaciones públicas de registro y verificación también aplicar política explícita de origen y límites; CORS por sí solo no es autorización. `SameSite` no sustituye las defensas CSRF.

## 1. Registro de estudiante

**Estado: IMPLEMENTADO en 1.3B.**

**Método y ruta:** `POST /api/auth/register`.

**Propósito:** crear cuenta y perfil académico pendientes de verificación, sin iniciar sesión ni conceder créditos.

### Entrada

```json
{
  "firstName": "<nombres>",
  "lastName": "<apellidos>",
  "email": "nombre.apellido@tecsup.edu.pe",
  "career": "<carrera-del-catalogo-aprobado>",
  "cycle": 3,
  "password": "<valor-introducido-localmente>",
  "termsAccepted": true,
  "termsVersion": "<version-vigente>",
  "privacyVersion": "<version-vigente>"
}
```

| Campo | Tipo y validación del registro |
| --- | --- |
| `firstName`, `lastName` | Cadenas de 2–100 caracteres tras recortar espacios exteriores; conservar nombres legítimos y caracteres españoles |
| `email` | Cadena normalizada, máximo 254 caracteres; dos segmentos alfabéticos ASCII con dominio exacto |
| `career` | Cadena que identifique una carrera activa del catálogo aprobado; no inventar denominaciones oficiales |
| `cycle` | Entero admitido por la carrera; configuración inicial 1–6 del prototipo, sin afirmar duración oficial |
| `password` | Cadena Unicode bien formada de 8–128 puntos de código, máximo 512 bytes; no recortar, normalizar ni truncar |
| `termsAccepted` | Booleano `true`, expresa aceptación conjunta de términos y privacidad en la pantalla actual |
| `termsVersion`, `privacyVersion` | Cadenas que coincidan con versiones vigentes controladas por servidor |

La confirmación de contraseña es un control obligatorio del formulario y React compara su igualdad. El cliente actual no la transmite; no añadir un requisito JSON incompatible sin aprobación. Nunca persistir confirmación. La institución no se recibe: el servidor asigna TECSUP. Rechazar campos adicionales, especialmente `role`, `credits`, `emailVerified` y estados internos.

### Respuesta implementada: 201

```json
{
  "user": {
    "email": "nombre.apellido@tecsup.edu.pe",
    "role": "student",
    "emailVerified": false,
    "onboardingComplete": false
  }
}
```

No establece cookie de sesión. La decisión de disparar el primer envío de correo desde registro o desde una acción posterior sigue pendiente; `201` no acredita envío ni entrega.

**Autorización y seguridad:** público; asignación de rol en servidor, hash seguro de contraseña, unicidad en MySQL y creación consistente de usuario/perfil. Limitar solicitudes por IP y correo, trabajo concurrente de hash y tamaño de entrada. Nunca actualizar contraseña o datos de una cuenta existente mediante registro repetido.

**Errores:** `422 VALIDATION_ERROR`, `409 EMAIL_ALREADY_REGISTERED` aprobado, `429`, `503` y errores comunes. `409` revela existencia de cuenta; se conserva por decisión expresa y se limita la frecuencia de solicitudes.

**React:** pantalla de registro; servicio envía `credentials: 'omit'`, espera `201` y correo normalizado idéntico al enviado. No redirigir a funciones protegidas tras crear la cuenta.

## 2. Envío o reenvío de código

**Estado: IMPLEMENTADO en 1.4A; política aprobada; ampliación 002 aplicada en ambas bases y SMTP real controlado comprobado.**

**Método y ruta:** `POST /api/auth/email/send-code`.

**Propósito:** aceptar una solicitud de envío real para una cuenta elegible pendiente de verificación.

### Entrada

```json
{
  "email": "nombre.apellido@tecsup.edu.pe"
}
```

**Validación:** cadena normalizada y formato institucional; rechazar campos adicionales. No permitir usar el endpoint como envío de correo a destinatarios arbitrarios.

### Respuesta implementada cuando está configurado: 202

```json
{
  "status": "accepted",
  "verificationId": "<identificador-opaco>",
  "message": "Si corresponde, recibirás un código de verificación."
}
```

Respuesta uniforme para cuentas inexistentes, verificadas o no elegibles, con identificadores indistinguibles en formato. El identificador no autoriza acceso. `202` significa aceptación, no recepción. Fallos generales del servicio pueden producir `503`, sin revelar existencia de cuentas mediante errores específicos de destinatario.

**Autorización y seguridad:** público, sin sesión protegida. Código generado criptográficamente; persistir HMAC ligado al desafío con clave exclusiva del backend. No devolver códigos ni registrarlos. Limitar por IP/correo y controlar reenvíos atómicamente. Un reenvío admitido revoca el desafío previo. El nuevo se crea SENDING y solo pasa a PENDING tras aceptación SMTP y confirmación MySQL. Si falla SMTP, permanece no verificable incluso si falla la revocación compensatoria. No se restaura el anterior ni se reintenta automáticamente. La transacción termina antes de SMTP.

Política aprobada: seis dígitos, diez minutos de vigencia, cinco intentos por desafío, espera mínima de 60 segundos y cinco solicitudes admitidas por correo en ventana móvil de una hora. El backend fija estos valores y rechaza sobrescrituras incompatibles. La propuesta 002 cuenta admisiones antes de consultar existencia de cuenta, también cuando no genera desafío o falla la entrega. Los rechazos 429/503 no generan desafío; un fallo posterior puede consumir un cupo ya confirmado.

**Errores:** `422 VALIDATION_ERROR`, `429` con `Retry-After`, `503` y errores comunes.

**React:** pantalla de verificación y control de reenvío, pendientes de integración. No mostrar un código de demostración ni prometer recepción basándose solo en `202`.

Implementación, configuración y limitaciones: [email-delivery.md](email-delivery.md). Sin proveedor SMTP habilitado el endpoint responde 503 uniforme, no 202 ficticio. Con configuración válida acepta en una cola acotada por proceso antes de consultar elegibilidad o realizar SMTP; 202 no demuestra creación de un desafío, envío ni recepción. El identificador no elegible es indistinguible en formato. La cola no es durable y no se implementó outbox.

## 3. Verificación de correo

**Estado: IMPLEMENTADO EN 1.4B.**

**Método y ruta:** `POST /api/auth/email/verify`.

**Propósito:** demostrar posesión del correo y registrar la concesión inicial única.

### Entrada

```json
{
  "email": "nombre.apellido@tecsup.edu.pe",
  "verificationId": "<identificador-opaco>",
  "code": "<codigo-introducido-por-el-usuario>"
}
```

**Validación:** correo normalizado; identificador y código como cadenas. Conservar ceros iniciales. Longitud y formato del código dependen de la política aprobada. Desafío ligado a usuario, vigente, no consumido y dentro del límite de intentos.

### Respuesta de primera verificación: 200

```json
{
  "status": "verified",
  "initialCreditsGranted": true,
  "creditsGranted": 20,
  "nextAction": "login"
}
```

**Autorización y seguridad:** público mediante prueba del desafío; no necesita sesión protegida. Comprobar de forma segura el HMAC, controlar intentos y evitar filtraciones. En una misma conexión y transacción: bloquear usuario/desafío, consumirlo, marcar verificación e insertar movimiento de `+20` con clave única de concesión por usuario. Si falla, revertir toda la operación. Conservar auditoría sin código en claro.

Las solicitudes paralelas y reintentos no vuelven a conceder créditos. La implementación rechaza desafíos consumidos con el mismo error genérico que otros desafíos inválidos. La restricción `uq_credit_initial_grant`, la referencia de operación y el bloqueo usuario → desafío refuerzan la idempotencia. La navegación después de un éxito cuya respuesta se pierda requiere acordar recuperación de UX sin debilitar la unicidad.

No crear sesión automáticamente según la propuesta actual; `nextAction: login` sigue sujeto a aprobación de navegación. Completar onboarding no es condición para recibir los créditos.

**Errores:** `422 VERIFICATION_INVALID` para código incorrecto, vencido, consumido o desafío inexistente; `422 VALIDATION_ERROR` para entrada mal formada; `429`, `503` y errores comunes.

**React:** pantalla de verificación, mensaje de confirmación y navegación a login; integración visual pendiente. El backend no crea sesión durante esta operación.

## 4. Inicio de sesión

**Estado: IMPLEMENTADO en 1.5.**

**Método y ruta:** `POST /api/auth/login`.

**Propósito:** validar credenciales reales y crear sesión de una cuenta habilitada.

### Entrada

```json
{
  "email": "nombre.apellido@tecsup.edu.pe",
  "password": "<valor-introducido-localmente>",
  "remember": false
}
```

**Validación:** correo y contraseña como cadenas; `remember` booleano obligatorio. Normalizar correo, nunca contraseña. No aplicar automáticamente la política de registro estudiantil a direcciones administrativas: esa política sigue pendiente. No reutilizar reglas nuevas de longitud de registro para bloquear credenciales históricas válidas sin estrategia aprobada.

### Respuesta estudiantil implementada: 200

```json
{
  "user": {
    "id": "<id-opaco>",
    "firstName": "<nombres>",
    "lastName": "<apellidos>",
    "name": "<nombre-completo>",
    "email": "nombre.apellido@tecsup.edu.pe",
    "institution": "TECSUP",
    "career": "<carrera-aprobada>",
    "cycle": 3,
    "role": "student",
    "emailVerified": true,
    "onboardingComplete": false
  },
  "csrfToken": "<token-csrf-generado-por-el-servidor>"
}
```

El marcador CSRF se reemplazará en ejecución por 64 caracteres hexadecimales. La cookie se entrega mediante `Set-Cookie`; el JSON no contiene identificador de sesión ni hash de contraseña. `onboardingComplete` refleja el estado real, no una constante.

**Autorización y seguridad:** público mediante credenciales. Comparación scrypt segura, hash señuelo para cuentas inexistentes, límites persistentes por correo/IP, origen permitido y `X-CSRF-Protection: 1`. Solo cuentas ACTIVE y verificadas reciben sesión.

**Errores:** `401 INVALID_CREDENTIALS` sin distinguir inexistencia de cuenta; `403 EMAIL_NOT_VERIFIED` o `ACCOUNT_SUSPENDED` solo después de comprobar contraseña; `403 ORIGIN_NOT_ALLOWED`; `422 VALIDATION_ERROR`, `429`, `503` y errores comunes. Si el mecanismo lo requiere, `403 CSRF_INVALID` para protección de solicitud inválida.

**React:** login; envía `{ email, password, remember }`, `credentials: 'include'` y `X-CSRF-Protection: 1`. Mostrar/ocultar contraseña y navegación a registro son operaciones locales. El enlace de recuperación no autoriza implementar recuperación de contraseña en este incremento.

**Compatibilidad administrativa:** para `admin`, `institution`, `career`, `cycle` y `onboardingComplete` son `null`; React debe admitir esos campos anulables.

## 5. Cierre de sesión

**Estado: IMPLEMENTADO en 1.5.**

**Método y ruta:** `POST /api/auth/logout`.

**Propósito:** revocar la sesión actual y borrar su cookie.

**Entrada:** sin campos de negocio; cuerpo ausente o `{}`. Cookie si existe y `X-CSRF-Token` válido para sesión activa. Rechazar campos adicionales.

### Respuesta implementada: 200

```json
{
  "status": "ok"
}
```

**Autorización y seguridad:** con sesión activa, comprobar CSRF y origen antes de revocar. Sin sesión, responder también `200` y limpiar cookie residual, respetando política de origen. Operación idempotente; no cerrar otras sesiones salvo que exista un caso de uso aprobado. No informar éxito si falla la revocación necesaria en servidor.

**Errores:** `403 CSRF_INVALID`, `403 ORIGIN_NOT_ALLOWED`, `429`, `503` y errores comunes.

**React:** opción Cerrar sesión; envía credenciales y CSRF, elimina su estado en memoria tras éxito. No basta borrar estado local.

## 6. Recuperación de sesión

**Estado: IMPLEMENTADO en 1.5.**

**Método y ruta:** `GET /api/auth/me`.

**Propósito:** consultar identidad autenticada y recuperar CSRF al recargar React. No es recuperación de contraseña.

**Entrada:** sin JSON ni identificador de usuario; cookie de sesión.

**Respuesta implementada: 200:** mismo objeto JSON `{ "user": { ... }, "csrfToken": "..." }` de login, con datos vigentes. No crea cuenta, créditos ni una sesión nueva.

**Validación y autorización:** sesión vigente, usuario existente, habilitado y verificado. Verificar expiración absoluta y por inactividad conforme a la política pendiente. No ampliar indefinidamente la expiración absoluta. La cuenta administrativa mantiene el pendiente de DTO señalado en login.

**Seguridad:** solo lectura de negocio, sin caché ni exposición de identificador de sesión. CORS restringido; CSRF no se exige para esta lectura. La consulta de estado debe permitir detectar suspensión y denegar acceso.

**Errores:** `401 SESSION_REQUIRED` para ausencia o vencimiento; `403 EMAIL_NOT_VERIFIED`, `403 ACCOUNT_SUSPENDED`, `503` y errores comunes.

**React:** inicialización mediante recuperación de sesión y protección de navegación. Los guardas de React no sustituyen autorización en Express.

## 7. Recuperación de contraseña

**Estado: IMPLEMENTADO Y VALIDADO EN MYSQL AISLADO; PENDIENTE EN BASE PRINCIPAL.**

Contratos: `POST /api/auth/password-recovery/request` para solicitud/reenvío uniforme y `POST /api/auth/password-recovery/reset` para consumir código y establecer contraseña en una sola operación. Ambos requieren JSON, `X-CSRF-Protection: 1` y origen aprobado cuando se incluye `Origin`. No existe un endpoint de validación independiente. Estados, límites, DTO, transacción, SMTP y diferencia visual están documentados en [password-recovery.md](password-recovery.md).

La política aprobada usa seis dígitos, diez minutos, cinco intentos, 60 segundos de espera, cinco solicitudes por correo y veinte por IP en una hora. No crea sesión, no concede créditos y revoca todas las sesiones anteriores tras éxito. La notificación se intenta después del commit y su fallo no revierte el cambio.

## 8. Consulta del perfil propio

**Estado: PROPUESTO, NO IMPLEMENTADO.**

**Método y ruta:** `GET /api/users/me`.

**Propósito:** obtener perfil propio y saldo académico calculado desde MySQL, separado del estado de autenticación.

**Entrada:** sin JSON ni ID de otro usuario; cookie de sesión.

### Respuesta estudiantil propuesta: 200

```json
{
  "user": {
    "id": "<id-opaco>",
    "firstName": "<nombres>",
    "lastName": "<apellidos>",
    "email": "nombre.apellido@tecsup.edu.pe",
    "role": "student",
    "emailVerified": true,
    "onboardingComplete": false
  },
  "studentProfile": {
    "institution": "TECSUP",
    "career": "<carrera-aprobada>",
    "cycle": 3,
    "mentorModeEnabled": false
  },
  "academicCredits": {
    "balance": 20
  }
}
```

Los valores de estado y saldo son ilustrativos: se consultan de la fuente de verdad. No garantizar saldo constante de 20 después de movimientos futuros. Para administradores se propone `studentProfile: null` y `academicCredits: null`, sujeto a acuerdo del contrato administrativo.

**Validación y autorización:** usuario obtenido exclusivamente de sesión vigente, habilitado y verificado. El modo mentor no cambia rol ni concede permisos administrativos.

**Seguridad:** respuesta limitada a campos públicos propios; sin hashes, desafíos o metadatos privados. Sin caché; no exigir CSRF para lectura. No crear un endpoint genérico de edición de saldo.

**Errores:** `401 SESSION_REQUIRED`, `403 EMAIL_NOT_VERIFIED`, `403 ACCOUNT_SUSPENDED`, `503` y errores comunes. Un fallo de integridad del perfil se reporta genéricamente, sin inventar datos académicos.

**React:** perfil propio, cabecera y estado inicial de cuenta. No implementa guardado de preferencias ni equivale a un catálogo oficial. El futuro modelo de saldos disponibles/retenidos de reservas queda fuera de esta etapa.

## Decisiones pendientes antes de implementar funcionalidades afectadas

| Decisión | Estado y dependencia |
| --- | --- |
| Gramática completa del correo | Definir segmentos adicionales, números, guiones y nombres compuestos; no relajar los rechazos ya confirmados |
| Contraseñas | Aprobado: 8–128 puntos de código, Unicode bien formado, sin truncar, hasta 512 bytes |
| Catálogo | Aprobado: selección de 14 carreras, claves estables versionadas y ciclos 1–6 como configuración inicial; ver academic-catalog.md |
| Términos y privacidad | Iniciales 1.0.0 aprobados para prototipo; completar responsable/contacto y revisión jurídica antes del servicio público |
| Expiración y Recordarme | Aprobado: 30 minutos/8 horas sin recordar; 7 días/30 días con cookie persistente; la inactividad nunca supera el máximo absoluto |
| Correos duplicados | Aprobado: 409 EMAIL_ALREADY_REGISTERED; unicidad y concurrencia verificadas en MySQL |
| SMTP y remitente | Seleccionar proveedor y remitente autorizado, configurar autenticación de dominio y probar recepción institucional real |
| Envío inicial y navegación | Acordar envío automático/solicitado, recuperación ante respuesta perdida y destino tras verificar |
| Código temporal | Aprobar longitud, vencimiento, intentos, límites agregados y política de reenvío/entrega |
| Administradores | Definir creación segura fuera del registro, correo permitido, verificación y DTO sin datos académicos ficticios |
| Cuenta de migraciones | Configurar cuenta separada con privilegios mínimos de esquema, secretos externos, scripts reproducibles y registro de versiones; nunca dar DDL a `skillswap_app` |
| Topología de despliegue | Acordar hosts, HTTPS, proxy y política de cookies sin relajar controles de producción |

### Límites persistentes de login 1.5

La migración 003 está aplicada en ambas bases. La admisión cuenta todos los intentos antes de consultar cuentas: cinco por HMAC de correo y veinte por HMAC de IP en ventanas fijas de 15 minutos. Los rechazos no desplazan la expiración. `LOGIN_RATE_HMAC_KEY_HEX` debe ser privada, independiente y estable; `TRUST_PROXY_HOPS=0` no confía en cabeceras de proxy. Ver [login-rate-limits.md](login-rate-limits.md).

## Compatibilidad y exclusiones

El servicio React revisado espera `201` en registro, `409 EMAIL_ALREADY_REGISTERED`, `422 VALIDATION_ERROR` con `error.fields`, roles en minúsculas y `{ user, csrfToken }` en login y recuperación. Mantener nombres y tipos documentados; cualquier cambio debe coordinarse sin rediseñar las pantallas.

La validación React inspeccionada permitía usuarios sin punto y alias: deberá alinearse con la corrección final de Figma en una intervención frontend autorizada. El mensaje de registro que declara ausencia de envío debe actualizarse al integrar correo real. No modificar frontend desde este incremento.

Los accesos demo, códigos fijos, roles en Web Storage y variables Vite con credenciales no forman parte de la autenticación funcional. Las pruebas y datos ficticios deben quedar aislados de cuentas reales.

Los contratos de perfil y onboarding preparados en 1.6 se documentan en [student-profile.md](student-profile.md). Su persistencia real requiere aplicar primero la migración 005 mediante el procedimiento autorizado. Reservas, aprobación de mentores, liquidación de sesiones y panel administrativo continúan fuera de este incremento.


## Persistencia implementada en el incremento 1.2

Migración: `001_auth_foundation.sql`, validada en `skillswap_ai_test_auth` y aplicada con autorización a `skillswap_ai`. Ambas conservan ocho tablas y una fila de historial, sin datos de negocio. Pasaron 28 pruebas, incluida la integración real en la base aislada. Checksum: `a544084c180a8c8ce701bd506bc98819d4e433b61460b1b20b7dbe4f0e1061c8`. No modifica los contratos HTTP ni implementa endpoints. El [README del backend](../README.md#migración-001_auth_foundation) describe la ejecución segura y el estado de pruebas.

| Tabla | Correspondencia y garantías preparadas |
| --- | --- |
| `users` | UUID textual, nombres, correo ASCII normalizado/único, hash con formato codificado, roles `STUDENT`/`ADMIN`, estados, verificación, aceptación y versiones legales, fechas UTC |
| `careers` | Código único y estado activo; catálogo inicial aprobado con carga DML independiente |
| `career_cycles` | Pares carrera/ciclo autorizados, PK compuesta; permite rangos no contiguos sin duplicar atributos del catálogo |
| `student_profiles` | Un perfil por usuario, FK compuesta que exige `STUDENT`, carrera/ciclo existentes y onboarding booleano; sin cuenta de mentor |
| `email_verifications` | UUID de desafío, propietario, HMAC de 32 bytes y versión de clave, intentos configurables, estados y fechas coherentes |
| `auth_sessions` | Digest de 32 bytes del identificador opaco, propietario, HMAC CSRF, última actividad, vencimientos absoluto/inactivo, revocación y preferencia remember |
| `credit_transactions` | Importe entero no nulo/cero, motivo, referencia única, vínculo opcional a desafío del mismo usuario y concesión inicial única de exactamente 20 |
| `schema_migrations` | Versión única, SHA-256 y fecha UTC, insertados solo al terminar la secuencia sin errores |

Los IDs deben generarse en servidor. TECSUP sigue siendo una institución fija de dominio, no un valor editable por React. La gramática pendiente no se inventa en SQL: la restricción estudiantil impone dominio exacto, punto interior, ausencia de puntos consecutivos y de `+`; el servicio de registro implementa la validación más estricta aprobada. El hash codificado requiere prefijo `$` y longitud mínima, pero SQL no prueba que sea un hash criptográfico válido; esa responsabilidad corresponde al servicio de contraseñas.

Las FKs usan la política restrictiva predeterminada, sin cascadas de borrado de usuarios, desafíos o movimientos. Las fechas son `DATETIME(6)` y las conexiones escritoras usan UTC. Las duraciones de sesión son 30 minutos/8 horas o 7/30 días. La política OTP fija 600 segundos y cinco intentos por desafío.

**Límites que exigen transacciones de servicio posteriores:** crear usuario/perfil conjuntamente; verificar carrera activa; comprobar que la cuenta está verificada y habilitada al crear/usar sesión; consumir desafío, verificar usuario y conceder créditos conjuntamente. La FK del movimiento garantiza propietario del desafío, pero no que esté consumido: el servicio deberá comprobarlo bajo bloqueo. El libro admite movimientos futuros con signo; esta tabla por sí sola no garantiza saldo agregado no negativo ni implementa reservas.

La columna generada `initial_grant_user_id` y su índice UNIQUE impiden dos movimientos `INITIAL_EMAIL_VERIFICATION` para el mismo usuario aunque cambie la referencia. Otros motivos no pueden sustituir la concesión inicial: el servidor seleccionará motivos autorizados y no permitirá editar/eliminar el historial desde la API. Los permisos DML del usuario aplicativo no convierten el libro en inmutable frente a acceso SQL directo.

`auth_sessions` usa implementación propia, no `express-session`. MySQL almacena solo SHA-256 del identificador y HMAC del CSRF. El token CSRF público se deriva de forma estable desde la cookie mediante `SESSION_CSRF_KEY_HEX`, permitiendo recuperación y múltiples pestañas sin persistir secretos en claro.

El ejecutor autorizado `database/migrate.js` solo admite `skillswap_ai` y el esquema aislado exacto `skillswap_ai_test_auth`. Inspecciona sin DDL por defecto, exige credenciales separadas y consulta `partial_revokes` antes de comprobar concesiones directas; rechaza privilegios globales operativos, comodines, ALL PRIVILEGES y permisos excesivos. Los escapes de guiones bajos se aceptan con partial_revokes OFF; con ON se exige el nombre literal sin barras. Solo se acepta USAGE global. SELECT, INSERT, CREATE y REFERENCES son los mínimos; UPDATE se reserva al esquema de pruebas y es obligatorio en su suite; las pruebas aisladas reutilizan su lógica. No se configura automáticamente desde las credenciales de la aplicación. El historial no se considera aplicado por existir el archivo ni por pasar pruebas estáticas. No se insertan usuarios demo, administradores ni créditos en el esquema aplicativo. El catálogo aprobado se carga por separado mediante DML autorizado.


## Decisiones aprobadas y alcance de 1.3B

Se conservan exactamente los nueve campos del ejemplo de registro. termsAccepted debe ser booleano true y las dos versiones deben coincidir exactamente con registration.policy.js (1.0.0); el servicio persiste las versiones del servidor y fecha UTC, no versiones arbitrarias. Los textos propios e inmutables están en legal/terms-1.0.0.md y legal/privacy-1.0.0.md; no usar el texto histórico de Figma. Nunca preseleccionar consentimiento. La tabla conserva fecha y ambas versiones; no se añade IP ni seguimiento de dispositivo a esa evidencia.

Password: 8–128 puntos de código Unicode bien formados, hasta 512 bytes, sin recorte ni normalización. Hash nativo scrypt N=131072,r=8,p=1, salt 16 bytes y clave 32 bytes, con máximo dos cálculos simultáneos por proceso. Valores extra como role/credits/emailVerified/confirmPassword se rechazan. La institución TECSUP es fija y no se recibe del cliente.

career sigue siendo el nombre del catálogo en el contrato actual; se resuelve a un UUID persistido, rechazando nombres ambiguos/inactivos y ciclos ausentes. La carga conserva únicamente claves estables, nombres y ciclos en un manifiesto 1.0.0; no incluye áreas, departamentos ni facultades. No se cambia el JSON del formulario a IDs sin coordinar React. Los ciclos 1–6 no afirman duración oficial y la carrera no limita habilidades o mentorías.

Solo se implementa el registro. El 201 no verifica correo, no confirma envío, no concede 20 créditos y no crea cookie. React debe seguir sin credenciales en este POST y mostrar el estado pendiente; no intentar consumir todavía login/verificación. Los futuros modales deben mostrar el texto de la versión aceptada; no se añadió endpoint legal ni se modificó frontend.

Protecciones y respuestas implementadas: 400 JSON malformado, 413 cuerpo mayor de 100kb, 415 falta application/json, 422 validación con fields, 409 duplicado confirmado, 403 origen de navegador no autorizado, 429 con Retry-After y 503 por capacidad de hash/limitador. Un fallo interno conserva 500 genérico. Los límites iniciales por proceso son 10/IP y 5/correo cada 60 segundos, con 2000 claves hash en memoria. Los clientes sin Origin pueden usar la API; con Origin deben coincidir exactamente con CORS_ORIGIN. No hay confianza automática en cabeceras de proxy. Una implantación con múltiples procesos requiere revisar el limitador compartido y el proxy.

Pruebas reales: node scripts/verify-local.js utiliza exclusivamente el esquema aislado y la cuenta DML autorizada. Comprueba HTTP 201, consentimiento persistido 1.0.0, hash, 409 y concurrencia, salud 200 y ausencia de sesiones/verificaciones/créditos. No aplica migraciones nuevas. Los endpoints restantes de este documento continúan siendo contratos de trabajo y sus decisiones pendientes no bloquean el registro actual del prototipo.

## Estado definitivo de infraestructura 1.4A

La migración 002 está aplicada y validada en skillswap_ai_test_auth y skillswap_ai. Incorpora otp_request_limits por HMAC del correo y estado inicial SENDING. Los límites persisten para correos existentes e inexistentes mediante una fila bloqueada y cinco timestamps; los controles por IP/origen siguen siendo complementarios. Ningún correo desconocido se almacena en claro en ese registro.

La política está aprobada y fijada por el backend. Brevo aceptó dos envíos controlados y la usuaria confirmó recepción del envío directo y del generado por `send-code`; Gmail mostró una advertencia de autenticación del remitente. DKIM/DMARC y un remitente apto para uso público deben quedar validados antes de habilitar envíos a otros estudiantes.

La verificación 1.4B está implementada: exige `PENDING` vigente, intentos disponibles, correo propietario y HMAC correcto bajo bloqueo; excluye `SENDING`, `REVOKED`, `EXPIRED`, `EXHAUSTED` y `CONSUMED`. Consume el desafío, activa la cuenta y registra exactamente `+20` en una sola transacción, sin crear sesión. Las pruebas de extremo a extremo con introducción manual de un OTP real requieren autorización específica y no forman parte de la suite automática.

Ver [validación de 002](otp-migration-002.md) y [configuración de correo](email-delivery.md). Se conservaron ambos SQL y sus checksums, catálogo principal y fila original de 001. Las pruebas de negocio escriben exclusivamente en el esquema aislado.
