# Contratos de autenticación — SkillSwap AI

**Estado de todos los endpoints de este documento: PROPUESTO, NO IMPLEMENTADO.** El incremento 1.1 solo documenta contratos. Los únicos endpoints actuales son los de salud descritos en [../README.md](../README.md).

## Fuentes y precedencia

Se aplican las decisiones definitivas del contexto maestro, las correcciones posteriores de Figma, las capturas confirmadas y, finalmente, la documentación académica contextual. Las auditorías históricas y simulaciones no prueban el comportamiento actual de Express.

La corrección final de Figma exige `nombre.apellido@tecsup.edu.pe`, normalización y rechazo de usuarios sin punto y alias con `+`. Reemplaza la antigua configuración sin dominio y la interpretación de que el punto era opcional. La gramática completa sigue pendiente.

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

`fields` es opcional y solo contiene campos públicos de validación; nunca reproduce valores sensibles. El middleware actual de Etapa 0 todavía no implementa este esquema para autenticación.

| HTTP | Uso propuesto |
| --- | --- |
| 400 | JSON malformado |
| 401 | Credenciales inválidas o sesión ausente/vencida |
| 403 | Cuenta no habilitada, origen rechazado o CSRF inválido |
| 409 | Correo duplicado; decisión pendiente de ratificación |
| 413 | Cuerpo excesivo |
| 415 | Tipo de contenido no admitido |
| 422 | Validación de campos o desafío inválido |
| 429 | Límite de solicitudes; incluir `Retry-After` en segundos |
| 500 | Error interno genérico |
| 503 | Dependencia necesaria no disponible |

### Sesiones y CSRF: mecanismo futuro propuesto

Sesiones persistidas en servidor con almacenamiento MySQL. Cookie con identificador opaco, `HttpOnly`, `Secure` en producción, `Path=/` y `SameSite=Lax` como propuesta sujeta a la topología de despliegue. Definir expiración absoluta e inactividad antes de implementar `remember`. No usar almacenamiento de sesión en memoria de proceso como solución de producción.

Regenerar el identificador al autenticar. Revocar la sesión en servidor al cerrar y eliminar la cookie con los mismos atributos de alcance. Consultar la habilitación de la cuenta al autorizar. No entregar access/refresh tokens para guardarlos en Web Storage.

React envía `credentials: 'include'` en operaciones de sesión. Express deberá habilitar credenciales CORS únicamente para orígenes permitidos. Usar un host consistente en desarrollo; `localhost` y `127.0.0.1` no son intercambiables para cookies. Evaluar cookies y HTTPS en el despliegue final sin relajar controles de producción.

Login devuelve un token CSRF aleatorio ligado a sesión, propuesto como 32 bytes codificados en 64 caracteres hexadecimales. React lo conserva en memoria; las mutaciones autenticadas lo envían en `X-CSRF-Token`. `GET /api/auth/me` permite recuperarlo sin iniciar otra sesión. No confundir este token de protección con una credencial de acceso.

Para login público: exigir JSON y el encabezado `X-CSRF-Protection: 1` que ya envía React, validar estrictamente origen y rechazar solicitudes simples. Ese encabezado constante no es un secreto. Para operaciones públicas de registro y verificación también aplicar política explícita de origen y límites; CORS por sí solo no es autorización. `SameSite` no sustituye las defensas CSRF.

## 1. Registro de estudiante

**Estado: PROPUESTO, NO IMPLEMENTADO.**

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

| Campo | Tipo y validación propuesta |
| --- | --- |
| `firstName`, `lastName` | Cadenas de 2–100 caracteres tras recortar espacios exteriores; conservar nombres legítimos y caracteres españoles |
| `email` | Cadena normalizada, máximo 254 caracteres; aplicar reglas institucionales definidas y gramática por aprobar |
| `career` | Cadena que identifique una carrera activa del catálogo aprobado; no inventar denominaciones oficiales |
| `cycle` | Entero admitido por la carrera; el rango 1–6 del prototipo sigue siendo referencial |
| `password` | Cadena; 8–128 es la propuesta compatible con React, pendiente de política definitiva; no recortar, normalizar ni truncar |
| `termsAccepted` | Booleano `true`, expresa aceptación conjunta de términos y privacidad en la pantalla actual |
| `termsVersion`, `privacyVersion` | Cadenas que coincidan con versiones vigentes controladas por servidor |

La confirmación de contraseña es un control obligatorio del formulario y React compara su igualdad. El cliente actual no la transmite; no añadir un requisito JSON incompatible sin aprobación. Nunca persistir confirmación. La institución no se recibe: el servidor asigna TECSUP. Rechazar campos adicionales, especialmente `role`, `credits`, `emailVerified` y estados internos.

### Respuesta propuesta: 201

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

**Errores:** `422 VALIDATION_ERROR`, `409 EMAIL_ALREADY_REGISTERED` como propuesta compatible con React, `429`, `503` y errores comunes. `409` revela existencia de cuenta; no considerarlo un acuerdo definitivo sin revisar ese riesgo. Una alternativa uniforme requeriría acordar el cambio con frontend.

**React:** pantalla de registro; servicio envía `credentials: 'omit'`, espera `201` y correo normalizado idéntico al enviado. No redirigir a funciones protegidas tras crear la cuenta.

## 2. Envío o reenvío de código

**Estado: PROPUESTO, NO IMPLEMENTADO.**

**Método y ruta:** `POST /api/auth/email/send-code`.

**Propósito:** aceptar una solicitud de envío real para una cuenta elegible pendiente de verificación.

### Entrada

```json
{
  "email": "nombre.apellido@tecsup.edu.pe"
}
```

**Validación:** cadena normalizada y formato institucional; rechazar campos adicionales. No permitir usar el endpoint como envío de correo a destinatarios arbitrarios.

### Respuesta propuesta: 202

```json
{
  "status": "accepted",
  "verificationId": "<identificador-opaco>",
  "message": "Si corresponde, recibirás un código de verificación."
}
```

Respuesta uniforme para cuentas inexistentes, verificadas o no elegibles, con identificadores indistinguibles en formato. El identificador no autoriza acceso. `202` significa aceptación, no recepción. Fallos generales del servicio pueden producir `503`, sin revelar existencia de cuentas mediante errores específicos de destinatario.

**Autorización y seguridad:** público, sin sesión protegida. Código generado criptográficamente; persistir HMAC ligado al desafío con clave exclusiva del backend. No devolver códigos ni registrarlos. Limitar por IP/correo y controlar reenvíos atómicamente. Un reenvío invalida el desafío previo conforme a una política de entrega y reintento que deberá cerrarse.

Propuestas aún no aprobadas: seis dígitos, diez minutos de vigencia, cinco intentos por desafío y espera mínima de 60 segundos. Los límites agregados no deben reiniciarse por solicitar otro código.

**Errores:** `422 VALIDATION_ERROR`, `429` con `Retry-After`, `503` y errores comunes.

**React:** pantalla de verificación y control de reenvío, pendientes de integración. No mostrar un código de demostración ni prometer recepción basándose solo en `202`.

## 3. Verificación de correo

**Estado: PROPUESTO, NO IMPLEMENTADO.**

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

### Respuesta propuesta de primera verificación: 200

```json
{
  "status": "verified",
  "initialCreditsGranted": true,
  "creditsGranted": 20,
  "nextAction": "login"
}
```

**Autorización y seguridad:** público mediante prueba del desafío; no necesita sesión protegida. Comprobar de forma segura el HMAC, controlar intentos y evitar filtraciones. En una misma conexión y transacción: bloquear usuario/desafío, consumirlo, marcar verificación e insertar movimiento de `+20` con clave única de concesión por usuario. Si falla, revertir toda la operación. Conservar auditoría sin código en claro.

Las solicitudes paralelas y reintentos no vuelven a conceder créditos. La propuesta rechaza desafíos consumidos con el mismo error genérico que otros desafíos inválidos. La navegación después de un éxito cuya respuesta se pierda requiere acordar recuperación de UX sin debilitar la unicidad.

No crear sesión automáticamente según la propuesta actual; `nextAction: login` sigue sujeto a aprobación de navegación. Completar onboarding no es condición para recibir los créditos.

**Errores:** `422 VERIFICATION_INVALID` para código incorrecto, vencido, consumido o desafío inexistente; `422 VALIDATION_ERROR` para entrada mal formada; `429`, `503` y errores comunes.

**React:** pantalla de verificación, mensaje de confirmación y navegación a login; flujo pendiente de integración real.

## 4. Inicio de sesión

**Estado: PROPUESTO, NO IMPLEMENTADO.**

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

### Respuesta estudiantil propuesta: 200

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

**Autorización y seguridad:** público mediante credenciales. Comparación de hash segura, trabajo comparable ante cuentas inexistentes, límites por cuenta e IP, validación de origen y controles CSRF descritos arriba. Regenerar sesión al autenticar. No conceder sesión protegida a cuentas no verificadas o suspendidas. La política de `remember` debe aprobarse antes de implementar sus efectos.

**Errores:** `401 INVALID_CREDENTIALS` sin distinguir inexistencia de cuenta; `403 EMAIL_NOT_VERIFIED` o `ACCOUNT_SUSPENDED` solo después de comprobar contraseña; `403 ORIGIN_NOT_ALLOWED`; `422 VALIDATION_ERROR`, `429`, `503` y errores comunes. Si el mecanismo lo requiere, `403 CSRF_INVALID` para protección de solicitud inválida.

**React:** login; envía `{ email, password, remember }`, `credentials: 'include'` y `X-CSRF-Protection: 1`. Mostrar/ocultar contraseña y navegación a registro son operaciones locales. El enlace de recuperación no autoriza implementar recuperación de contraseña en este incremento.

**Compatibilidad administrativa pendiente:** React exige carrera y ciclo incluso para `admin`. Debe acordarse un DTO con datos académicos opcionales/nulos para administradores, sin inventarlos. No declarar cerrado el contrato administrativo hasta resolverlo.

## 5. Cierre de sesión

**Estado: PROPUESTO, NO IMPLEMENTADO.**

**Método y ruta:** `POST /api/auth/logout`.

**Propósito:** revocar la sesión actual y borrar su cookie.

**Entrada:** sin campos de negocio; cuerpo ausente o `{}`. Cookie si existe y `X-CSRF-Token` válido para sesión activa. Rechazar campos adicionales.

### Respuesta propuesta: 200

```json
{
  "status": "ok"
}
```

**Autorización y seguridad:** con sesión activa, comprobar CSRF y origen antes de revocar. Sin sesión, responder también `200` y limpiar cookie residual, respetando política de origen. Operación idempotente; no cerrar otras sesiones salvo que exista un caso de uso aprobado. No informar éxito si falla la revocación necesaria en servidor.

**Errores:** `403 CSRF_INVALID`, `403 ORIGIN_NOT_ALLOWED`, `429`, `503` y errores comunes.

**React:** opción Cerrar sesión; envía credenciales y CSRF, elimina su estado en memoria tras éxito. No basta borrar estado local.

## 6. Recuperación de sesión

**Estado: PROPUESTO, NO IMPLEMENTADO.**

**Método y ruta:** `GET /api/auth/me`.

**Propósito:** consultar identidad autenticada y recuperar CSRF al recargar React. No es recuperación de contraseña.

**Entrada:** sin JSON ni identificador de usuario; cookie de sesión.

**Respuesta propuesta: 200:** mismo objeto JSON `{ "user": { ... }, "csrfToken": "..." }` definido íntegramente en login, con datos vigentes. No crear una cuenta, conceder créditos ni generar una nueva sesión de acceso por visitar esta ruta.

**Validación y autorización:** sesión vigente, usuario existente, habilitado y verificado. Verificar expiración absoluta y por inactividad conforme a la política pendiente. No ampliar indefinidamente la expiración absoluta. La cuenta administrativa mantiene el pendiente de DTO señalado en login.

**Seguridad:** solo lectura de negocio, sin caché ni exposición de identificador de sesión. CORS restringido; CSRF no se exige para esta lectura. La consulta de estado debe permitir detectar suspensión y denegar acceso.

**Errores:** `401 SESSION_REQUIRED` para ausencia o vencimiento; `403 EMAIL_NOT_VERIFIED`, `403 ACCOUNT_SUSPENDED`, `503` y errores comunes.

**React:** inicialización mediante recuperación de sesión y protección de navegación. Los guardas de React no sustituyen autorización en Express.

## 7. Consulta del perfil propio

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
| Política definitiva de contraseñas | Ratificar 8–128 compatible con referencia o acordar cambio; precisar conteo Unicode y límites sin truncamiento |
| Catálogo de carreras y ciclos | Obtener denominaciones y rangos aprobados; el catálogo del prototipo no es oficial |
| Términos y privacidad | Aprobar textos, versiones y evidencia de aceptación; los valores de prototipo no son definitivos |
| Expiración y Recordarme | Definir inactividad, máximo absoluto, persistencia y revocación de sesiones |
| Correos duplicados | Ratificar `201/409` o acordar alternativa uniforme y adaptación del cliente |
| SMTP y remitente | Seleccionar proveedor y remitente autorizado, configurar autenticación de dominio y probar recepción institucional real |
| Envío inicial y navegación | Acordar envío automático/solicitado, recuperación ante respuesta perdida y destino tras verificar |
| Código temporal | Aprobar longitud, vencimiento, intentos, límites agregados y política de reenvío/entrega |
| Administradores | Definir creación segura fuera del registro, correo permitido, verificación y DTO sin datos académicos ficticios |
| Cuenta de migraciones | Configurar cuenta separada con privilegios mínimos de esquema, secretos externos, scripts reproducibles y registro de versiones; nunca dar DDL a `skillswap_app` |
| Topología de despliegue | Acordar hosts, HTTPS, proxy y política de cookies sin relajar controles de producción |

## Compatibilidad y exclusiones

El servicio React revisado espera `201` en registro, `409 EMAIL_ALREADY_REGISTERED`, `422 VALIDATION_ERROR` con `error.fields`, roles en minúsculas y `{ user, csrfToken }` en login y recuperación. Mantener nombres y tipos documentados; cualquier cambio debe coordinarse sin rediseñar las pantallas.

La validación React inspeccionada permitía usuarios sin punto y alias: deberá alinearse con la corrección final de Figma en una intervención frontend autorizada. El mensaje de registro que declara ausencia de envío debe actualizarse al integrar correo real. No modificar frontend desde este incremento.

Los accesos demo, códigos fijos, roles en Web Storage y variables Vite con credenciales no forman parte de la autenticación funcional. Las pruebas y datos ficticios deben quedar aislados de cuentas reales.

Recuperación de contraseña, modificación de perfil, reservas, aprobación de mentores, liquidación de sesiones y panel administrativo no se implementan por aparecer en documentos históricos. Su alcance requiere autorización posterior.
