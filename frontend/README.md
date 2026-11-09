# SkillSwap AI — frontend

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
- **Reservar sesión** abre un aviso de funcionalidad pendiente: no crea reservas,
  descuenta créditos ni envía solicitudes.

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
- **Mi perfil** en el menú o el avatar permiten editar las selecciones existentes.
  Guardar vuelve al panel y actualiza las recomendaciones. Reiniciar elimina las
  preferencias y exige volver a completar el perfil.
- La campana abre las notificaciones; abrir una marca su lectura y navega al destino.
  La lectura se conserva al recargar. Si falla el guardado, sigue sin leer.
- **Encontrar con IA**, las sugerencias y el botón flotante abren el asistente original.
  Permite habilidad, nivel, horario, revisión y hasta tres resultados; contempla errores
  de entrada y búsquedas sin coincidencias. Es el motor local del prototipo, sin un
  proveedor externo de IA.
- Explorar, Para ti y los perfiles de mentor están disponibles. Sesiones, créditos,
  solicitudes de mentor, reservas y logout conservan destinos pendientes al pulsarlos.

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
