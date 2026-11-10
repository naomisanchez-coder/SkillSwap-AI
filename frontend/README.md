# SkillSwap AI — frontend

## Administración

Se adapta `AdminOperationsPage.tsx` de Figma Make: resumen, solicitudes, usuarios,
sesiones, incidencias, créditos y cuenta/auditoría. Se conservan tarjetas, colores,
filtros, tablas y la confirmación de las decisiones. El rechazo utiliza el **campo
de texto obligatorio de observaciones** comprobado en el original, con máximo de
2000 caracteres; no se introducen opciones de rechazo inventadas.

### Acceso y mapa de navegación

Con `VITE_ENABLE_FRONTEND_PREVIEW=true` y Vite en desarrollo:

1. Abrir `http://127.0.0.1:5175/?view=admin` (ajustar el puerto al indicado por Vite).
2. Seleccionar **Acceder a administración** con la cuenta de prueba
   `admin@example.test`. No requiere contraseña ni utiliza el login real.
3. Navegar por **Resumen**, **Solicitudes de mentor**, **Usuarios**, **Sesiones**,
   **Incidencias**, **Créditos académicos** y **Mi cuenta**.
4. Abrir la URL sin `?view=admin` en otra pestaña para revisar los mismos datos
   desde el estudiante y mentor. Las escrituras en otra pestaña actualizan las vistas.
5. **Cerrar sesión** en administración retira solo este acceso de desarrollo.
   La recarga conserva el acceso y sección mientras no se cierre.

Este acceso está separado de `POST /auth/login`, sus cookies y CSRF. Se excluye
de la compilación de producción. El guardado de acceso en sessionStorage **no es
seguridad ni concede permisos reales**: durante la integración, el backend deberá
comprobar el rol administrador y el estado de la cuenta en cada endpoint protegido,
gestionar la sesión real y proteger decisiones/archivos con autorización y CSRF.

`AdminService` separa la pantalla de `dev/adminMock.ts`; este reutiliza los almacenes
de cuentas y actividad. Los datos de prueba comprenden la cuenta de Alex, Elena,
Diego y los mentores del catálogo. No se leen usuarios ni documentos de una API.
No se añadieron dependencias ni se modificaron archivos del backend.

### Decisiones y persistencia

- Solicitudes → **Revisar**: nombre, datos declarados, PDF íntegro guardado en
  IndexedDB, historial y observaciones. **Abrir PDF en otra pestaña** recupera un
  Blob validado; si falta o falla, informa el problema y permite reintentar. Los
  archivos permanecen en este navegador y origen; no se presentan como compartidos.
- Rechazo → observación obligatoria → **Confirmar**. El estudiante consulta la
  observación en **Mis habilidades**, puede corregir y reenviar conservando el ID
  y el historial. Aprobación → habilidad habilitada → entrada al panel del mentor;
  la oferta continúa pausada hasta que el mentor la configure y publique.
- Cada decisión verifica que la solicitud siga pendiente y pertenezca al envío
  revisado. Una revisión obsoleta no sobrescribe un reenvío ni otra decisión.
- Usuarios → detalle → suspensión/reactivación explícita con confirmación. Se
  conserva la actividad y el dinero retenido. La suspensión bloquea las acciones
  locales de esa cuenta y retira sus ofertas de nuevas reservas; reactivar no crea
  reservas ni altera movimientos. No hay consulta ni edición de contraseñas.
- Sesiones y créditos → consulta de estados, participantes, saldos y movimientos
  con referencias estables. Los detalles de sesiones se abren con botones accesibles.
- Incidencias → tomar para revisión → resolver con motivo obligatorio:
  **devolver créditos**, **liberar al mentor** o **cerrar sin ajuste**.
- **Mi cuenta** → auditoría de aprobaciones, rechazos, suspensiones, reactivaciones,
  revisiones y resoluciones, con administrador, fecha, entidad y motivo. El detalle
  de solicitud también muestra el historial de decisiones y observaciones previas.

Se reutilizan las tres resoluciones originales de `sessionLifecycle.ts`. La devolución
administrativa cancela la sesión y retorna la retención completa una sola vez,
con referencia `:incident-refund`; no depende del límite de cancelación voluntaria
de 12 horas. La liberación administrativa aplica el 100 % al mentor y liquida la
retención una sola vez. Es una **resolución explícita de una discrepancia**, adicional
al recorrido normal de doble confirmación; se registra como `adminResolution`,
sin inventar `performedAt` ni `validatedAt`. Las vistas muestran esa resolución.
Cerrar sin ajuste conserva los créditos retenidos y devuelve la sesión a
`validation` si el mentor ya confirmó, o a `upcoming` en caso contrario, como Make.
La cancelación voluntaria de 12 horas permanece provisional y sin cambios.

Las decisiones sobre una solicitud, su historial, notificación y auditoría se escriben
juntas en el registro de cuenta. Las resoluciones, saldos de ambas partes, movimientos,
incidencia, notificaciones y auditoría se escriben juntas en el ledger. Un error de
escritura conserva el registro anterior, muestra el error y permite reintentar.
La UI no cierra la confirmación ni informa éxito antes de guardar. Si falla una
lectura posterior, **Actualizar datos** permite consultar el resultado persistido.
No hay una transacción común entre ambos registros, pero cada acción administrativa
afecta un único registro; la API deberá aportar transacciones e idempotencia reales.

Web Locks coordina las pestañas compatibles y la cola alternativa coordina una instancia.
Los reintentos con la misma decisión no duplican auditoría ni ajustes; una decisión
contraria sobre una incidencia resuelta se rechaza. Se conservan los datos v1 previos.

Correcciones al trasladar el original: además de los UUID por incidencia, las
notificaciones y eventos de resolución usan la incidencia concreta. Reiniciar una
sesión después de un cierre sin ajuste genera eventos/notificaciones distintos,
sin colisiones con un inicio anterior. La devolución registra su fecha y la
liberación administrativa conserva su procedencia, compatibles con la validación
del ledger y las vistas existentes. Los modales y menú móvil reutilizan el diálogo
nativo compartido: foco contenido, fondo inerte, Escape y retorno del foco.

Pruebas automatizadas: **56**, incluidas decisiones, observaciones, revisión obsoleta,
persistencia, PDF, suspensión, las tres resoluciones, incidencias sucesivas,
concurrencia, fallos de guardado y regresiones de todos los flujos anteriores.
Chrome: recorrido completo en 320×740, 360×800, 390×844, 640×800, 768×1024,
844×390, 1024×768, 1280×900 y 1440×900. Se verificaron apertura del PDF en otra
pestaña y su contenido, rechazo y consulta de observaciones, corrección y aprobación,
entrada al mentor, suspensión/reactivación, incidencias sucesivas, devolución,
liberación, auditoría y recarga. Menú móvil y modales: Tab/Shift+Tab contenidos,
Escape, retorno del foco y selección con teclado. Sin desbordamiento global,
errores JavaScript ni llamadas a la API; capturas revisadas de celular y tablet.
También se comprobaron errores de escritura visibles sin cerrar el diálogo ni
guardar cambios parciales, reintento, PDF ausente y recuperación posterior, fallo
de lectura y recuperación de la administración, y liberación a la billetera del
mentor desde dos pestañas con 20 reintentos: un único ingreso y una sola decisión.
Se inspeccionó la vista de escritorio y se comprobó que el build de producción no
contiene el acceso administrativo de prueba.
Los scripts y capturas del navegador se mantienen fuera del repositorio.
Pendientes: permisos y transacciones en API, almacenamiento compartido de archivos,
dispositivos físicos, otros navegadores y lector de pantalla.

## Vista del mentor

Se reutilizan las vistas originales de `AccountMentorPages.tsx` y la navegación de
`MentorShell`: panel, disponibilidad, ofertas, habilidades aprobadas, sesiones,
participación y valoraciones. `MentorArea` comparte el menú accesible y el perfil
con la vista estudiantil. Los datos y acciones se separan mediante `MentorService`,
`dev/mentorMock.ts` y `dev/localActivity.ts`; registro y login reales no cambian.

Mapa de navegación vigente:

- Estudiante con habilidad aprobada → **Ir al panel de mentor**.
- Panel mentor → **Disponibilidad**, **Mis ofertas**, **Reservas recibidas**,
  **Habilidades aprobadas**, **Mi participación**, **Mis valoraciones**, **Mi perfil**.
- Mi perfil → editar preferencias → retorno al perfil de mentor.
- Mentor → **Volver a modo estudiante** → panel estudiantil con la misma identidad,
  fotografía, preferencias, reservas y billetera; la vista actual se restaura al recargar.
- Notificación de reserva recibida → sesiones del mentor; notificación de una reserva
  propia → sesiones del estudiante. Las pantallas separan las sesiones de cada rol.

Solo las solicitudes aprobadas de la cuenta habilitan la vista y sus acciones. Cada
habilidad aprobada tiene una oferta independiente, inicialmente pausada; publicar,
pausar o editar conserva las reservas anteriores. No se permite reservar una oferta
propia. Se conservan los costos de **5/10/15 créditos por 30/60/90 minutos**, las
ponderaciones del motor y el máximo de tres recomendaciones.

La disponibilidad semanal usa los siete días y los bloques originales de 5 a 8 PM,
en America/Lima. Se protegen todos los bloques que cubren reservas vigentes, incluida
la extensión de una sesión de 90 minutos. Los intervalos que solo se tocan en su
límite no se solapan. Se detectan conflictos entre distintas ofertas del mismo
mentor y entre sus actividades como estudiante y mentor. El guardado vuelve a leer
y validar los datos; los fallos conservan el estado anterior y permiten reintentar.

La confirmación del mentor registra `performedAt`; la del estudiante registra
`validatedAt`. Solo ambas liberan los créditos retenidos, generan un único ingreso
y actualizan la billetera del mismo usuario. Las incidencias mantienen los créditos
retenidos. Las valoraciones recibidas provienen de sesiones completadas, una por
sesión. La regla provisional de cancelación de 12 horas permanece sin cambios.

Se conserva el ledger v1 y se añaden campos opcionales para configuración y billeteras
de estudiantes de prueba, sin borrar reservas previas. Web Locks coordina las
escrituras entre pestañas compatibles; la alternativa coordina una instancia.
El backend deberá sustituir estos servicios con autorización, transacciones e
idempotencia reales; el almacenamiento del navegador no concede permisos reales.

Correcciones al trasladar el original: IDs distintos por oferta, con propietario
compartido para evitar conflictos ocultos; bloqueo de disponibilidad solo para
reservas cuyo final aún no pasó; confirmación de guardado después de persistir,
con recuperación ante errores. El inicio manual de una sesión conserva la lógica
original; una restricción temporal adicional requiere acordar su contrato.

### Cómo revisar la vista de mentor

Iniciar Vite con `VITE_ENABLE_FRONTEND_PREVIEW=true` (solo desarrollo), completar
el perfil y enviar una solicitud desde **Quiero ser mentor**. La aprobación se prueba
en la consola del navegador, sin añadir controles administrativos al estudiante:

```js
const { mockAccountService, reviewApplicationFixture } = await import('/src/dev/accountMock.ts');
const account = await mockAccountService.getAccount();
const pending = account.requests.find(item => item.status === 'pending');
if (pending) await reviewApplicationFixture(pending.id, 'approved', 'Revisión de prueba');
location.reload();
```

Abrir **Ir al panel de mentor**, guardar disponibilidad y publicar una oferta.
Para generar una reserva recibida sin cambiar de cuenta, usar el fixture separado:

```js
const { mockMentorService, reserveMentorFixture } = await import('/src/dev/mentorMock.ts');
const { getNextAvailableDates } = await import('/src/data/scheduling.ts');
const workspace = await mockMentorService.getWorkspace();
const request = workspace.approved.find(item => workspace.settings.offers[item.id]?.active);
if (!request) throw new Error('Publica una oferta primero.');
const date = getNextAvailableDates(workspace.settings.availability)[0];
if (!date) throw new Error('Guarda disponibilidad primero.');
// Elegir una hora guardada y libre; ajustar el valor si el ejemplo no está disponible.
const received = await reserveMentorFixture({
  id: crypto.randomUUID(), mentorId: `student-mentor-${workspace.profile.id}:${request.id}`,
  date, time: '7:00 PM', duration: 30,
});
console.log(received.session.id);
location.reload();
```

En **Reservas recibidas**, iniciar la sesión y marcarla realizada. El saldo ganado
sigue igual hasta que el estudiante confirme. Para probar esa segunda confirmación:

```js
const { mockMentorService, confirmLearnerFixture } = await import('/src/dev/mentorMock.ts');
const workspace = await mockMentorService.getWorkspace();
const session = workspace.sessions.find(item => item.status === 'validation' && item.studentId === 'fixture-elena');
if (!session) throw new Error('Marca una sesión de Elena como realizada primero.');
await confirmLearnerFixture({ type: 'validate', sessionId: session.id });
await confirmLearnerFixture({ type: 'rate', sessionId: session.id, rating: 5, comment: 'Explicación clara.' });
location.reload();
```

Los fixtures usan a Elena y Diego con billeteras separadas; repetir una confirmación
no transfiere otra vez. Las acciones externas por consola requieren recargar la vista.
No se añadieron dependencias, controles administrativos ni llamadas al backend.
Conexión API y enlaces de videollamada siguen pendientes; estos
últimos se muestran como **Enlace pendiente**, sin presentar una reunión inexistente.

Validación: **47 pruebas automatizadas**, build, lint y revisión de diferencias.
Chrome: recorrido de ambos roles, disponibilidad, ofertas, sesiones de 30/60/90,
doble envío, confirmación independiente, ganancias, reseñas, recarga, menú y teclado
en 320×740, 360×800, 390×844, 640×800, 768×1024, 844×390, 1024×768, 1280×900 y
1440×900, sin desbordamiento horizontal global, errores JavaScript ni llamadas API.
Pendientes: dispositivos físicos, otros navegadores y lector de pantalla.

## Perfil personal y solicitudes para enseñar

Se reutilizan `ProfilePage`, `MentorApplicationPage` y `SkillsPage` del archivo
`AccountMentorPages.tsx` original de Figma Make, con `Card`, `Avatar`, `Badge`, los
campos accesibles y el diálogo compartido existentes. Se conserva la estructura de
tarjetas y el diseño responsive. No se modifican registro, login ni backend.

Mapa de navegación actualizado:

- Menú o avatar → **Mi perfil**: consulta de información institucional, nombre,
  biografía y foto; nombre y biografía editables. Correo, carrera, ciclo e institución
  conservan las restricciones del prototipo.
- Mi perfil / Mis habilidades → **Editar preferencias**: reutiliza los cuatro pasos
  y `ProfileService` existentes, con selecciones conservadas y retorno al origen.
  Así se mantiene el formato de preferencias ya guardado, sin reemplazar rangos
  horarios por una hora suelta ni introducir valores incompatibles con el onboarding.
- Menú, panel o página pública de compartir → **Quiero ser mentor** / formulario
  de solicitud. Requiere haber completado el perfil inicial de aprendizaje.
- Solicitud enviada → **Mis habilidades**: estado, documento, fecha, experiencia,
  temas, observación e historial. Menú y notificación también abren esta pantalla.
- **En observación** o **Rechazada** → corregir y reenviar con el mismo ID.
  Se conservan las observaciones anteriores en el historial; vuelve a **Pendiente**.
- Una habilidad aprobada habilita la vista del mentor descrita arriba. La aprobación
  administrativa real y logout siguen pendientes; una solicitud pendiente no habilita ofertas.

`AccountService` separa los componentes de `dev/accountMock.ts` y
`dev/accountStore.ts`. Los cambios personales y solicitudes se guardan en
`skillswap:frontend-demo:account:v1`; preferencias, reservas, créditos y lectura de
notificaciones mantienen sus claves y datos previos. El nombre/foto actualizan el
encabezado y el panel sin cambiar los comprobantes históricos de reservas.
Las reservas nuevas toman el nombre guardado; reintentar una reserva anterior conserva
el nombre que tenía su comprobante.

La foto admite JPG, PNG y WebP de hasta **2 MB**, con comprobación de tipo, tamaño,
archivo vacío y decodificación real de imagen. Muestra vista previa y confirmación.
`profilePhotoStorage.ts` conserva la base original `skillswap_prototype_files`,
versión 3, almacén `profile_photos`. Se eliminó del migrador la instrucción original
que borraba `payment_receipts`: los almacenes anteriores se conservan. Cada nueva
foto recibe un ID propio para no sobrescribir la anterior si falla el guardado de
metadatos. Las URLs `blob:` se crean solo en memoria y se liberan al dejar de usarlas.

La solicitud exige habilidad vigente del catálogo, nivel Intermedio/Avanzado,
experiencia, temas y evidencia PDF; el portafolio es opcional y debe usar HTTPS.
El servicio vuelve a validar todo, evita otra solicitud activa de la misma habilidad
y solo crea estados pendientes. Nombre: 120 caracteres; biografía: 1000;
experiencia/temas: 2000 cada uno; portafolio: 2048. El formulario impide doble envío;
IDs de envío estables y una firma del contenido permiten reintentos sin duplicar
solicitudes, documentos ni notificaciones. Web Locks coordina las pestañas compatibles;
la cola alternativa solo coordina una instancia.

`evidenceStorage.ts` reutiliza la base original `skillswap_mentor_evidence`, versión 1,
almacén `pdf_documents`. Admite extensión `.pdf`, tipo PDF/vacío/octet-stream,
contenido no vacío, tamaño **hasta 5 MB inclusive** y firma `%PDF-1.x` o `%PDF-2.x`.
Conserva el Blob completo, no solo el nombre; **Abrir PDF** recupera el contenido y
lo abre en otra pestaña sin acceso a la ventana de origen. Al recuperarlo se comprueba
que el Blob siga disponible y tenga tamaño/firma válidos. Es validación básica del
formato del prototipo: el visor puede detectar otros daños estructurales; no equivale
a una validación documental administrativa ni a un análisis antimalware.

**Las fotos y los PDF se guardan en este navegador y origen.** No se comparten entre
dispositivos ni entre puertos/orígenes. Pueden perderse si se borran los datos del sitio,
se agota la cuota o el navegador retira almacenamiento. El nombre del documento sigue
visible si falta el contenido; la pantalla informa el problema y permite reintentar
la recuperación. Una solicitud observada/rechazada puede corregirse adjuntando otro PDF.
No se presenta un nombre guardado como evidencia recuperada.

El éxito se muestra después del guardado confirmado. Si falla IndexedDB, no se enlaza
el archivo. Si se guarda el archivo pero falla el metadato, se intenta eliminar solo
ese archivo nuevo; se conservan las referencias y archivos anteriores. Si esa limpieza
también falla, puede quedar un Blob sin enlazar, sin crear una solicitud ni informar
éxito. No hay una transacción común entre localStorage e IndexedDB; la API deberá
implementar la atomicidad e idempotencia definitivas. Los errores de recuperación de
metadatos no reinician datos ni ofrecen borrar preferencias ajenas al fallo.

Para revisar: inicia Vite con `VITE_ENABLE_FRONTEND_PREVIEW=true`, abre **Mi perfil**,
edita y guarda, cambia la foto y recarga. Abre **Quiero ser mentor**, completa el
formulario y adjunta un PDF. Desde **Mis habilidades**, abre el archivo y recarga.
La revisión de solicitudes se prueba mediante un fixture separado, sin controles
administrativos para el estudiante:

```js
const { mockAccountService, reviewApplicationFixture } = await import('/src/dev/accountMock.ts');
const account = await mockAccountService.getAccount();
await reviewApplicationFixture(account.requests[0].id, 'observation', 'Detalla los temas y adjunta evidencia.');
location.reload();
```

Los otros estados del fixture son `rejected` y `approved`; solo revisa solicitudes
pendientes. Es exclusivo de desarrollo y no forma parte de `AccountService`. La API
deberá verificar roles y permisos, gestionar los archivos compartidos y dar validez a
las revisiones; los datos locales no otorgan permisos reales.

Comprobaciones de este incremento: build, lint sin advertencias y `git diff --check`
correctos; **38 pruebas automatizadas** de perfil, archivos, duplicados, fallos,
reservas, sesiones y recomendaciones. En Chrome se revisó el recorrido en 320×740,
360×800, 390×844, 640×800, 768×1024, 844×390, 1024×768, 1280×900 y 1440×900.
Se verificaron teclado, foco del modal, menú móvil, edición, preferencias conservadas,
recarga, JPG/PNG/WebP decodificables, archivos inválidos, PDF íntegro en IndexedDB y
apertura en otra pestaña. Se corrigió el menú que permanecía abierto al seleccionar
**Quiero ser mentor**.

Los contextos de prueba comprobaron solicitud pendiente/observada/rechazada/aprobada,
historial tras reenviar, dos pestañas con un único documento y solicitud, metadatos
no recuperables, PDF/foto dañados o ausentes, IndexedDB inaccesible, transacción abortada,
compensación del archivo nuevo y conservación de un almacén anterior en una migración.
Sin errores JavaScript ni llamadas a la API. Los scripts temporales y capturas están
fuera del repositorio. Pendientes: dispositivos físicos, otros navegadores, lector de
pantalla y conexión a la API/almacenamiento compartido. La captura de Figma Make no
está disponible mediante el conector; se reutilizó su código original.

## Mis sesiones y billetera

Se trasladan las vistas estudiantiles de `SessionsHubPage.tsx` y `CreditsHubPage.tsx`
del Make original. Se conservan colores, tarjetas, estados, costos de 5/10/15 créditos
por 30/60/90 minutos, y el asistente y motor de recomendaciones sin cambiar sus pesos.
Los diálogos reutilizan el componente nativo compartido: foco contenido, fondo inerte,
Escape y retorno del foco. Las pestañas admiten flechas, Inicio y Fin; la valoración
usa radios nativos. El historial de movimientos tiene desplazamiento horizontal propio.

Mapa de navegación actualizado:

- Perfil completado → panel → Explorar / Para ti → perfil del mentor → reserva.
- Reserva confirmada → Mis sesiones / panel; saldo insuficiente → Mis créditos.
- Menú, accesos del panel y notificaciones → Mis sesiones / Mis créditos.
- Mis sesiones → detalle, cancelación, validación, reporte o valoración según estado.
- Mis sesiones / Mis créditos → asistente → perfil del mentor → volver al origen.
- Mi perfil → editar preferencias → perfil; Mis habilidades → solicitudes para enseñar.
  Logout sigue mostrando un aviso de destino pendiente al seleccionarlo.

Sesiones y billetera se restauran al recargar mediante `sessionStorage`; las reservas,
confirmaciones, incidencias, reseñas y movimientos permanecen en `localStorage`.
Se leen las reservas v1 existentes sin reiniciar el saldo ni eliminar datos anteriores.
Reiniciar preferencias no elimina sesiones ni movimientos.

`data/sessionLifecycle.ts` adapta las transiciones del prototipo. El mentor inicia y
marca realizada una sesión; su confirmación guarda `performedAt`. El estudiante solo
puede validar después, guardando `validatedAt`. Ambas fechas aparecen en las tarjetas
y el detalle. Solo con ambas confirmaciones se descuenta el retenido, se contabiliza
el utilizado y se acredita el 100 % al mentor. Los movimientos `:spent` y `:earning`
son únicos. El historial de la sesión conserva fechas y participantes de cada acción.

**Regla provisional pendiente de confirmación:** solo una reserva próxima puede
cancelarse con **al menos 12 horas** de anticipación en `America/Lima` (incluye el
límite exacto). Se devuelven todos los créditos retenidos, una sola vez, con referencia
`:refund`. Con menos de 12 horas se bloquea la cancelación; se puede reportar una
incidencia. La condición se explica en la tarjeta, el detalle y la confirmación, y
el servicio la comprueba nuevamente al guardar. No se implementan penalizaciones
ni devoluciones fuera de esa regla.

Una discrepancia lleva a `review` y mantiene los créditos retenidos, sin valoración
ni liquidación mientras exista una incidencia abierta. La revisión administrativa
se abre desde la vista de administración; no hay botones estudiantiles para resolverla. Se corrigió el ID fijo
`INC-${sessionId}` del original: cada nuevo reporte lleva un UUID, incluso si una
incidencia anterior fue cerrada sin ajuste. Una sesión completada admite una sola
reseña, con 1–5 estrellas y comentario opcional de hasta 500 caracteres; actualiza
el perfil del mentor y las recomendaciones.

`StudentService.updateSession` es el contrato reemplazable por la API. La implementación
de desarrollo guarda cada transición completa en una sola escritura, bajo la misma
cola y Web Lock de las reservas. Si falla la escritura no cambia sesión, saldo,
movimientos ni notificaciones, y el diálogo permite reintentar. Los datos persistidos
se validan contra sus movimientos y saldos antes de aceptar otra operación; datos
inconsistentes generan un error, nunca una reposición del saldo inicial. Los reintentos
de cancelación y validación no repiten devoluciones ni transferencias. Las retenciones
aplicadas y el movimiento utilizado no representan dos cargos.

Para probar, inicia Vite con `VITE_ENABLE_FRONTEND_PREVIEW=true`, completa el perfil
y reserva una mentoría. Abre **Mis sesiones**, revisa el detalle, cancela una reserva
que cumpla el plazo y compara **Mis créditos** con el panel. Recarga cada pantalla.
No se necesita backend. Los fixtures se limitan a desarrollo y no alteran el registro
ni el login reales; no hay etiquetas técnicas en la interfaz del producto.

Para probar estados del mentor sin añadir su pantalla, las herramientas de desarrollo
pueden importar el fixture explícito (sustituye el ID por el de una reserva local):

```js
const { applyMentorFixture } = await import('/src/dev/studentMock.ts');
await applyMentorFixture({ type: 'start', sessionId: 'ID-DE-RESERVA', mentorId: 'carlos' });
await applyMentorFixture({ type: 'perform', sessionId: 'ID-DE-RESERVA', mentorId: 'carlos' });
location.reload();
```

Después abre **Mis sesiones → Por validar** y confirma o reporta una discrepancia.
`close-incident` es exclusivamente un fixture de cierre sin ajuste para probar reportes
sucesivos; no está en `StudentService` ni se presenta como función administrativa.
Estos fixtures no aplican reglas de inicio temporal de una futura pantalla del mentor.
La API deberá validar identidad, roles, hora del servidor y las operaciones atómicas;
los registros locales son datos de prueba, no una frontera de seguridad.

`npm test` incluye las reservas, recomendaciones y regresiones del ciclo de sesión:
12 horas ±1 ms, cancelación/reembolso repetidos, ambas confirmaciones, transferencia
única, retención por discrepancia, IDs sucesivos, valoración única, fallos de escritura,
recarga, compatibilidad v1 y datos corruptos. No se añaden dependencias. Las pruebas
temporales del navegador se mantienen fuera del repositorio.

Verificación de este incremento: build, lint, diff sin errores y 29 pruebas de Node.
Chrome pasó en 320×740, 360×800, 390×844, 640×800, 768×1024, 844×390, 1024×768,
1280×900 y 1440×900: menú, pestañas, teclado, diálogos, cancelación, recarga, billetera
y asistente. Se comprobaron además el límite de 12 horas ±1 ms con reloj controlado,
dos pestañas, ambas confirmaciones, fallos de guardado con reintento, reseña persistida
y actualizada en el mentor, discrepancia, estados vacíos y notificaciones. El flujo
previo de reservas pasó su regresión completa. Sin errores JavaScript ni llamadas API.
La captura directa de Figma Make no está soportada por el conector; se reutilizó su
código fuente. No se probaron dispositivos físicos ni lectores de pantalla.

Pendientes: backend y asignación de
enlaces de videollamada. La vista estudiantil muestra **Enlace pendiente** sin inventar
una reunión. Web Locks coordina pestañas en navegadores compatibles; la alternativa
solo serializa dentro de una instancia. No se garantizan operaciones entre dispositivos.

## Reserva de mentoría

Desde el perfil de un mentor, **Reservar sesión** abre los tres pasos de
`BookingFlowPage.tsx` original: fecha y horario, duración, revisión y confirmación.
Se mantienen los costos académicos 30/60/90 minutos por 5/10/15 créditos.
Las fechas se calculan en `America/Lima`, desde el día siguiente, como en el prototipo.
Cada bloque publicado cubre una hora; 90 minutos requiere cobertura continua.
No se cambia el horario silenciosamente si aparece un conflicto al confirmar.

El servicio vuelve a validar oferta activa/aprobada, habilidad vigente, duración
publicada, fecha futura, disponibilidad, solapamientos del mentor y del estudiante,
y saldo. Impide autorreservas. El costo se deriva de `creditConfig.ts`, no de campos
enviados por la pantalla. `scheduling.ts` reutiliza las funciones del prototipo y
valida fechas reales e intervalos semiabiertos.

`StudentService` incorpora `getBookingContext`, `confirmBooking`, `getBooking` y los
métodos del borrador de navegación. `dev/bookingStore.ts` implementa la persistencia
local mediante `skillswap:frontend-demo:bookings:v1`. Guarda en una sola escritura
sesión, saldo disponible/retenido, movimiento de retención y notificación; si falla
la escritura no modifica ninguno. Los créditos se retienen, no se consumen todavía.
Reiniciar preferencias no elimina reservas ni devuelve créditos.

El ID de reserva permanece estable durante el flujo y los reintentos. Un mismo ID
con los mismos datos devuelve el comprobante guardado sin retener de nuevo; con
otros datos se rechaza. Otros IDs compitiendo por el horario vuelven a validar bajo
el bloqueo. La interfaz impide doble envío. En Chrome y navegadores con Web Locks,
el bloqueo exclusivo también coordina pestañas del mismo origen; la cola alternativa
coordina la misma pestaña. La futura API deberá garantizar estas operaciones mediante
transacciones y restricciones propias; el frontend no sustituye esos controles.

La pantalla de éxito utiliza exclusivamente el `ConfirmedBooking` devuelto por el
servicio. No recalcula fecha ni hora a partir de la disponibilidad después de bloquear
el horario. Puede recuperar ese comprobante aunque la oferta se desactive después.
El borrador `skillswap:frontend-demo:booking-route:v1` en sessionStorage conserva
selecciones, paso e ID al recargar; una reserva ya guardada abre su comprobante. Si
el navegador impide sessionStorage, la reserva sigue en localStorage y en el panel,
pero no se puede garantizar restaurar la pantalla exacta.

**Volver al panel** actualiza saldo, próxima sesión y notificaciones y cierra el
borrador. Una recarga vuelve a leer los registros persistidos. **Ver mis sesiones**
y **Mis créditos** abren las vistas descritas arriba; los enlaces de reunión siguen
pendientes de asignación.
No se modificó backend ni autenticación; los datos de prueba siguen limitados a la
configuración explícita de desarrollo y no muestran carteles técnicos en la interfaz.

Para revisar en `npm run dev`, habilita `VITE_ENABLE_FRONTEND_PREVIEW=true`, completa
el perfil si hace falta, abre Carlos desde el panel o recomendaciones y reserva un
horario de las 7:00 PM para comprobar las tres duraciones. Revisa el resumen, confirma,
recarga el comprobante y vuelve al panel. El saldo inicial del fixture es 20 créditos;
las reservas se conservan y reducen ese disponible.

`npm test` ejecuta las regresiones de reservas y del motor de recomendaciones.
Incluye costos, doble envío, competencia por horario, solapamientos, saldo insuficiente,
oferta desactivada, datos corruptos, fallo de escritura y la hora inmutable del
comprobante. Chrome se comprobó en nueve tamaños, con teclado, borrador tras recarga,
igualdad revisión/éxito/registro, oferta desactivada y dos pestañas simultáneas.

## Recomendaciones y perfil del mentor

Se reutilizan `RecommendationsPage.tsx` y `MentorProfilePage.tsx` de Figma Make:

- **Para ti** muestra como máximo tres recomendaciones según las preferencias
  del perfil. Mantiene el motor y los pesos 45/20/25/10, sin cambios.
- **Explorar** permite buscar por habilidad, nombre y biografía, y combinar categoría,
  habilidad, nivel y día. **Limpiar filtros** restablece todos los campos. Se corrigió
  la correspondencia entre los nombres de categorías del catálogo público y su mapa
  de habilidades; la búsqueda admite mayúsculas y texto sin tildes.
- **Ver perfil** funciona desde el panel, ambas vistas, el asistente y la exploración
  pública. El perfil incluye biografía, habilidad aprobada, temas, compatibilidad,
  disponibilidad, duraciones, créditos y reseñas. **Volver** conserva los filtros,
  restaura la posición y devuelve el foco a la tarjeta o al asistente de origen.
- Los filtros se conservan durante la navegación en memoria. Recargar mantiene el
  comportamiento por estado `page` del proyecto: vuelve al panel o al perfil inicial.
- **Reservar sesión** abre el flujo local descrito arriba. No envía solicitudes a
  una API. La gestión posterior local se describe en Mis sesiones y billetera.

`StudentService.getMentorProfile(id)` devuelve `MentorProfileDetails | null`. Un ID
inexistente o un mentor no elegible muestra **Perfil no encontrado**, sin sustituirlo
por otro mentor. Un error de carga permite reintentar; una respuesta tardía no cambia
la pantalla después de volver atrás. `ReviewRecord` y `MentorProfileDetails` están
tipados en `data/student.ts`. Los fixtures están en `dev/mentorFixtures.ts`; Carlos
tiene dos reseñas de prueba (media 4.5), mientras Andrea y Luis conservan el estado
sin valoraciones. El panel, las recomendaciones y el perfil usan el mismo resumen.
La interfaz no muestra etiquetas de demostración ni mensajes técnicos.

Para revisar: habilita `VITE_ENABLE_FRONTEND_PREVIEW=true`, inicia `npm run dev`,
completa el perfil si hace falta y abre **Para ti** o **Explorar** en el menú del panel.
Usa Python para obtener resultados con el catálogo actual. En Explorar, combina
Programación + Python + Avanzado + Martes para encontrar a Carlos, abre su perfil y
vuelve para comprobar que los filtros siguen seleccionados.

`npm test` incluye las regresiones del motor y las nuevas comprobaciones de filtros,
categorías y estados vacíos. Las pruebas temporales de Chrome cubren nueve tamaños,
teclado, todos los orígenes de navegación, reseñas vacías y con datos, perfil inexistente,
error con reintento y respuestas tardías. No se añadieron dependencias.

## Panel estudiantil

El panel reutiliza `StudentDashboardPage.tsx`, `StudentShell` de `AppShell.tsx`,
`StudentUI.tsx` y `RecommendationAssistant.tsx` del proyecto original de Figma Make.
Conserva el menú lateral, resumen académico, fotografía, tarjetas de mentores,
próxima sesión y asistente. No muestra carteles técnicos en la interfaz.

Con `VITE_ENABLE_FRONTEND_PREVIEW=true` y `npm run dev`:

- Sin preferencias guardadas abre la configuración inicial. Solo después de guardar
  correctamente pasa al panel. Con preferencias completas abre el panel al recargar.
- **Mi perfil** en el menú o el avatar abren la información personal y la edición
  de preferencias existentes. Guardar actualiza el panel y las recomendaciones. Reiniciar elimina las
  preferencias y exige volver a completar el perfil.
- La campana abre las notificaciones; abrir una marca su lectura y navega al destino.
  La lectura se conserva al recargar. Si falla el guardado, sigue sin leer.
- **Encontrar con IA**, las sugerencias y el botón flotante abren el asistente original.
  Permite habilidad, nivel, horario, revisión y hasta tres resultados; contempla errores
  de entrada y búsquedas sin coincidencias. Es el motor local del prototipo, sin un
  proveedor externo de IA.
- Explorar, Para ti, perfiles de mentor, reservas, sesiones, créditos, perfil personal
  y solicitudes para enseñar están disponibles. Logout conserva un destino pendiente.

`src/services/student.ts` define `StudentService`; `src/dev/studentMock.ts` y
`src/dev/mentorFixtures.ts` proporcionan los datos de prueba. La composición recibe
`StudentService` y `ProfileService` por propiedades para conectar la API después.
Los datos del panel se tipan en `src/data/student.ts`, sin importar el estado global,
migraciones locales ni toda la economía del prototipo. La lectura de notificaciones
usa `skillswap:frontend-demo:student:v1`; las preferencias mantienen su clave anterior.
No se guardan cookies, contraseñas ni tokens, ni se conceden créditos a cuentas reales.

El motor conserva los pesos 45/20/25/10 y el máximo de tres resultados. Como en el
original, parte de la primera habilidad del perfil; el objetivo no añade otro peso.
Solo considera mentores activos, validados, con habilidad activa y horarios, excluyendo
la oferta propia. Mantiene la calidad neutral para mentores sin valoraciones.
Los bloques del catálogo duran una hora. `scheduling.ts` compara intervalos
`[inicio, fin)`: 19:00–20:00 y 20:00–21:00 no se solapan. Se mantiene el puntaje parcial
original por coincidir solo en el día, sin conceder la coincidencia horaria completa.
El panel diferencia preferencias incompletas de una habilidad sin mentores elegibles.

Comprobaciones automatizadas: `npm test` ejecuta las regresiones del motor, horarios
límite, elegibilidad, orden, máximo de resultados y estados vacíos. Requiere Node con
`module.registerHooks` (probado con Node 24); utiliza TypeScript ya instalado, sin
dependencias nuevas. Ejecutar también `npm run build`, `npm run lint` y
`git diff --check`. Las pruebas de Chrome de este incremento se ejecutan con herramientas
temporales fuera del repositorio, en los nueve tamaños indicados abajo.

## Perfil inicial con datos simulados (solo desarrollo)

Este incremento sigue `ProfileSetupPage.tsx` de Figma Make: habilidades del catálogo
activo, nivel, un horario semanal y objetivo académico. Conserva las selecciones al
retroceder. Todos los pasos son obligatorios; al terminar guarda y abre el panel.
La disponibilidad incluye el inicio y el final del horario. Se puede volver a editar
desde el panel; las pantallas privadas restantes continúan pendientes.

Para probar sin backend:

1. En `frontend/.env.local` añade `VITE_ENABLE_FRONTEND_PREVIEW=true`, conservando
   cualquier configuración existente. No subas ese archivo a Git.
2. Desde `frontend/`, ejecuta `npm run dev` y abre la dirección que muestra Vite.
   Reinicia Vite después de cambiar variables de entorno.
3. Sin preferencias se abre la configuración del perfil; si ya están completas se
   abre el panel. La interfaz no muestra carteles técnicos.
4. Pulsa **Guardar preferencias**. Recarga para comprobar la persistencia en el
   panel. **Mi perfil** conserva los valores guardados al editarlos.
5. **Reiniciar preferencias** solicita confirmación y borra únicamente las
   preferencias de prueba. También permite recuperar datos locales dañados.

La vista simulada no inicia `/auth/me`, no crea sesiones ni toca las cookies de una
cuenta real. Usa exclusivamente la clave local
`skillswap:frontend-demo:profile:v1`; no guarda credenciales ni tokens. El navegador
debe permitir almacenamiento local. Si falla el guardado, se conservan las selecciones
y se muestra un error sin confirmar éxito.

`src/services/profile.ts` define la interfaz asíncrona para leer, guardar y reiniciar;
`src/dev/profileMock.ts` implementa la simulación y contiene al estudiante ficticio.
La pantalla recibe el servicio por propiedades para sustituirlo después por una API.
Las opciones referenciales están en `src/data/profileOptions.ts`.

El registro y login existentes conservan la API y sus controles. No hay credenciales
ficticias aceptadas por el login real. Para abrir la navegación pública y autenticación
habituales desactiva la vista con `VITE_ENABLE_FRONTEND_PREVIEW=false` o elimina
la variable. En producción se ignora incluso si vale `true`: la vista y el servicio
simulado no se incluyen en los módulos JavaScript compilados.

Revisar con teclado las casillas (Espacio), opciones únicas (flechas), botones (Tab,
Shift+Tab, Enter) y diálogo de reinicio (Escape). Los pasos enfocan el título; las
validaciones enfocan la primera opción y anuncian el error. La cuadrícula de horarios
se reorganiza para celulares, tablets y escritorio sin exigir desplazamiento horizontal.

## Revisión responsive en cada etapa

Antes de dar por terminada una etapa, comprobar las pantallas modificadas en celular,
tablet y computadora, conservando el diseño original de Figma. Incluir los resultados
en la entrega y esperar la confirmación del equipo antes de la siguiente etapa.

- Tamaños de referencia (ancho × alto, en píxeles CSS): 320×740, 360×800, 390×844,
  640×800, 768×1024, 844×390, 1024×768, 1280×900 y 1440×900.
- Revisar toda la página: textos, imágenes, controles y tarjetas sin recortes,
  superposiciones ni desplazamiento horizontal; comprobar fuentes y recursos cargados.
- Abrir y cerrar el menú; comprobar los destinos, Escape y el cambio de tamaño
  con el menú abierto. Verificar carruseles y modales cuando existan en la pantalla.
- Revisar teclado y controles táctiles, orientación horizontal y contenido que
  necesita desplazamiento vertical dentro de menús o modales.
- Ejecutar `npm run build` y `npm run lint`. Distinguir pruebas realizadas en
  navegador de pruebas y comprobaciones pendientes en dispositivos físicos.

Están disponibles la portada y la navegación pública: Explorar habilidades, Cómo
funciona y Compartir mis habilidades. La navegación usa estado `page`, como el prototipo,
sin rutas URL: al recargar se vuelve al inicio. El registro está conectado a la API;
login y recuperación de sesión están conectados a la API; logout real y conexión de
funciones privadas siguen pendientes y muestran un aviso. El perfil inicial solo está
disponible en la vista de desarrollo descrita arriba. El catálogo público usa perfiles de demostración
del código original; la búsqueda consulta nombre, habilidad y biografía, y las categorías
rellenan ese mismo buscador. Actualmente los tres mentores de demostración enseñan Python.
Para abrirla: ejecutar `npm run dev` en esta carpeta y visitar la URL que indica Vite.

## Registro institucional

Desde `frontend/`, copiar `.env.example` a `.env.local` si todavía no existe y
configurar `VITE_API_URL=http://127.0.0.1:3000/api`. Reiniciar Vite después de
cambiar esta variable. Es una dirección pública de la API, no debe contener secretos;
las variables VITE se incluyen en el código entregado al navegador.

Abrir `http://127.0.0.1:5173` con `npm run dev -- --host 127.0.0.1 --port 5173 --strictPort`.
El backend debe estar activo, conectado a MySQL y permitir ese origen exacto mediante
`AUTH_ALLOWED_ORIGINS`. No mezclar localhost y 127.0.0.1. No se usa proxy ni se
modifican CORS, validaciones, migraciones o controles de acceso del backend.

Crear cuenta, desde las páginas públicas o el menú móvil, abre el formulario
adaptado de `AuthPage.tsx` de Figma Make: mismos recursos y presentación, con
nombres/apellidos de 2 a 100 caracteres, correo institucional de hasta 254,
carrera referencial, ciclo 1 a 6 y contraseña de 8 a 128. La confirmación y la
aceptación se comprueban en el cliente; el servidor sigue siendo la autoridad.
Los tres formatos `sheila`, `sheila.diaz` y `sheila_diaz` en @tecsup.edu.pe son válidos.

`POST /api/auth/register` recibe exclusivamente los campos del contrato, incluida
aceptación explícita y versiones `v1` de términos y privacidad. La confirmación de
contraseña no se envía. Se muestran errores de campo del servidor (422), correo
duplicado (409), fallos del servicio y conexión. El plazo de espera es 15 segundos;
no hay reenvío automático. Si la respuesta se pierde, no se afirma que la cuenta
no se haya creado: una nueva solicitud puede devolver correo duplicado.

Mientras se envía se bloquean los campos y el botón de envío, con una guarda
sincrónica contra eventos de envío repetidos. Al salir se cancela la espera local;
esto no garantiza cancelar una transacción que ya haya llegado al servidor.
El formulario dirige el foco al primer campo inválido o al error general, enlaza
los mensajes mediante aria-describedby y reutiliza el modal accesible existente.
Se puede mostrar/ocultar cada contraseña por teclado.

Solo un HTTP 201 con los estados previstos permite mostrar Cuenta creada. Se
limpian las contraseñas del formulario y el foco llega a la confirmación. El correo
queda sin verificar, el onboarding pendiente y no se crea ni almacena una sesión.
La pantalla indica que no se envió ningún correo y que envío/verificación aún
requieren integración. Desde el formulario se puede pasar al login, que sigue
exigiendo verificación real en el servidor.

Los textos legales `v1` se conservan como borradores del prototipo; describen sus
simulaciones y necesitan revisión antes de una puesta en servicio con datos reales.
No se cambia su contenido ni su versión unilateralmente en esta etapa.

### Validación de este incremento

- Build, lint y `git diff --check`.
- Chrome con API Express real y MySQL en una base temporal nueva separada de
  `skillswap_ai`, con las cinco migraciones. Se verificaron persistencia, estados
  iniciales, aceptación `v1` con fecha del servidor, tres formatos institucionales,
  duplicados normalizados y ausencia de sesión/cookie.
- Dominios incorrectos y campos inválidos bloqueados por el formulario; también
  se comprobó rechazo 422 en la API al omitir la validación del cliente y error de
  campo real por carrera inactiva.
- Fallo 500 real provocado por un trigger solo en la base temporal: mensaje seguro
  y rollback. Fallo de conexión simulado en el navegador: sin confirmación falsa.
  Dos eventos de envío sucesivos produjeron un único POST y un único usuario.
- Revisión en los nueve tamaños indicados arriba: formulario, teclado, modales
  legales en ambos sentidos, Escape, retorno del foco y navegación al inicio,
  sin desbordamiento horizontal. Se inspeccionaron capturas de celular y escritorio.

El script y las capturas de comprobación están fuera del repositorio; no se añaden
dependencias de pruebas. Al finalizar se eliminó únicamente la base temporal creada
y se comprobaron intactos los recuentos de usuarios, aceptaciones y sesiones de
`skillswap_ai`, además de la lista de bases preexistentes. No se verificó ninguna
cuenta real. Pendientes: dispositivos físicos, otros navegadores, HTTPS y comparación
visual con una captura de Figma (MCP no admite get_screenshot para archivos Make).

## Login y recuperación de sesión

El diseño del login procede de `AuthPage.tsx` de Figma Make. `AuthLayout` y
`AuthFields` comparten presentación y campos con el registro, conservando su contrato.
Mostrar/ocultar contraseña y Recordarme se operan con teclado; los errores llevan
el foco al campo correspondiente o al aviso general. El envío se bloquea con estado
y una guarda sincrónica para no duplicar solicitudes.

Se usa la misma `VITE_API_URL` del registro y el origen permitido del backend:

- `POST /api/auth/login`: JSON `{email,password,remember}`, `credentials: include`
  y cabecera `X-CSRF-Protection: 1`. El navegador gestiona Origin y el preflight.
- `GET /api/auth/me`: `credentials: include`, al montar la aplicación y mediante
  Comprobar sesión. La cookie HttpOnly la gestiona exclusivamente el navegador.
- Usuario y `csrfToken` se mantienen solo en memoria React. No se escriben tokens,
  contraseñas ni sesiones en localStorage/sessionStorage ni se registran en consola.
  Tras recargar, `/me` recupera usuario y CSRF desde la cookie válida.

Hay estados explícitos de comprobación, sesión confirmada, ausencia de sesión y
fallo de conexión. Un 401 inicial sin cookie se trata como visitante normal. Tras
perder una sesión confirmada se informa al usuario; un fallo de red no se interpreta
como autenticación confirmada ni como logout exitoso. Se puede volver a comprobar.
Las consultas anteriores se cancelan/ignoran cuando un login más reciente tiene
éxito para evitar sobrescribir su estado con una respuesta atrasada.

Se muestran mensajes para credenciales incorrectas, correo sin verificar, suspensión,
429, errores del servicio y de conexión; no hay reintentos automáticos. Si el navegador
permite leer Retry-After, se muestra el plazo; de lo contrario se indica esperar
unos minutos. No se cambia CORS para exponer cabeceras en este incremento.

Recordarme usa el contrato existente: 8 horas sin marcar y 7 días al marcar,
configurables en el servidor. Ambos modos usan cookie persistente con caducidad
absoluta. El cliente no decide permisos ni interpreta la cookie para dar acceso.
`/me` vuelve a comprobar verificación, suspensión, caducidad y revocación.

El acceso confirmado muestra una sección provisional con el usuario y rol devueltos
por la API, el estado del perfil y los destinos privados pendientes. Se conserva
la navegación pública. Logout, paneles, onboarding y recuperación de contraseña
solo muestran avisos de funcionalidad pendiente; no se llaman sus endpoints ni se
simula cerrar sesión. El registro sigue creando cuentas sin verificar y sin sesión.

### Pruebas de login

Chrome, API real y MySQL en una base temporal nueva, separada de `skillswap_ai`:

- Login y cookie HttpOnly/SameSite=Lax reales, CSRF del contrato, recuperación por
  `/me` al recargar y ausencia de almacenamiento persistente desde JavaScript.
- Recordarme con caducidad de 7 días comprobada en MySQL y recuperación posterior.
- Credenciales incorrectas, cuenta sin verificar y suspendida, sin cookie de acceso.
- Sesión caducada y cambios posteriores de suspensión/verificación: al comprobar,
  desaparece el estado autenticado y el servidor limpia/revoca según su contrato.
- Límite 429 real; conexión y respuesta 503 simuladas en el navegador, sin mostrar
  acceso confirmado. Recuperación de una sesión tras restablecer la conexión.
- Dos eventos de envío generan un POST y una sesión; una respuesta inicial de `/me`
  retrasada no sobrescribe un login posterior. No hubo peticiones de logout.
- Teclado, navegación a registro/inicio y login en los nueve tamaños documentados;
  sección autenticada en celular, tablet y escritorio sin desbordamiento horizontal.

Se usaron exclusivamente fixtures verificados en la base temporal. Al terminar se
eliminó esa base y se verificaron intactos la lista de bases y los recuentos de
usuarios, aceptaciones y sesiones de `skillswap_ai`. Scripts y capturas permanecen
fuera del repositorio; no se añadieron dependencias ni se modificó el backend.
Pendientes: dispositivos físicos, otros navegadores y cookies Secure bajo HTTPS real.

## Información de la plantilla original

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])

```

You can also install [eslint-plugin-react-x](https://npmx.dev/package/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://npmx.dev/package/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])

```
