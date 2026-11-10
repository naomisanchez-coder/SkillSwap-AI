# Backend de SkillSwap AI

SkillSwap AI es una plataforma académica para el intercambio de habilidades entre estudiantes de TECSUP. El backend será responsable de la identidad, autorización, verificación institucional, reglas de negocio y persistencia compartida. MySQL será la fuente de verdad; el navegador no podrá asignar permisos, verificación ni créditos.

## Estado del incremento 1.2 (aplicado y validado)

La Etapa 0 fue implementada en `aa5fd55cab63432b7bd099eabd6f6175d6592142`: servidor Express, configuración local, pool MySQL, endpoints de salud y pruebas automatizadas. El incremento 1.1 añadió documentación. El incremento 1.2 incorpora el esquema relacional, un ejecutor seguro y pruebas reales. La migración fue validada en `skillswap_ai_test_auth` y aplicada con autorización explícita a la base principal de desarrollo `skillswap_ai`.

**El registro institucional está implementado en 1.3B.** Correo real, verificación, login, sesiones y concesión de créditos siguen pendientes. Las ocho tablas ya existen en ambas bases; disponer de tablas no implementa los casos de uso de autenticación. Los contratos y su estado están en [docs/auth-api.md](docs/auth-api.md).

## Arquitectura

- Presentación: frontend React separado, comunicado mediante API REST JSON.
- Servidor: Node.js con JavaScript ES Modules y Express.
- Persistencia: MySQL 8.4 mediante `mysql2/promise`.
- Monolito modular por capas: ruta → controlador → servicio → repositorio → MySQL. El módulo auth implementa registro; se conserva la infraestructura existente.

`src/app.js` crea la aplicación sin abrir puertos. `src/server.js` administra el servidor HTTP y el cierre del pool. La configuración se concentra en `src/config/`. El pool expone comprobación de disponibilidad, cierre, ejecución parametrizada y transacciones sobre una misma conexión. El módulo src/modules/auth separa HTTP, validación, negocio, hash y persistencia.

## Tecnologías y versiones

Versiones comprobadas en el entorno del incremento 1.1:

| Componente | Versión |
| --- | --- |
| Node.js | 24.21.0 |
| npm | 11.19.0 |
| Express | 5.3.0 |
| mysql2 | 3.24.6 |
| dotenv | 18.0.10 |
| cors | 2.8.6 |

El manifiesto admite Node `^24.0.0 || ^26.0.0`. La versión del servidor comprobada durante el incremento 1.2 es MySQL Community Server 8.4.13. `package-lock.json` fija el árbol reproducible de dependencias.

## Estructura existente

```text
backend/
├── .env                  # Local, ignorado por Git
├── .env.example
├── README.md
├── package.json
├── package-lock.json
├── database/
│   ├── .gitkeep
│   ├── academic-catalog.js
│   ├── catalogs/academic-1.0.0.json
│   ├── migrate.js
│   └── migrations/
│       └── 001_auth_foundation.sql # Aplicada y validada localmente
├── docs/
│   ├── academic-catalog.md
│   ├── legal/                 # Textos propios 1.0.0
│   └── auth-api.md
├── scripts/
│   ├── academic-catalog.js
│   └── verify-local.js
├── src/
│   ├── .gitkeep
│   ├── app.js
│   ├── server.js
│   ├── config/
│   │   ├── db.js
│   │   └── env.js
│   ├── errors/
│   │   └── PublicError.js
│   ├── modules/
│   │   └── auth/
│   │       ├── auth.routes.js
│   │       ├── auth.controller.js
│   │       ├── auth.service.js
│   │       ├── registration.policy.js
│   │       ├── registration.limiter.js
│   │       ├── auth.repository.js
│   │       ├── auth.validation.js
│   │       └── password.service.js
│   ├── middleware/
│   │   └── errorHandler.js
│   └── routes/
│       └── health.routes.js
├── tests/
│   ├── .gitkeep
│   ├── database.test.js
│   ├── errors.test.js
│   ├── health.test.js
│   ├── migrations.test.js
│   ├── catalog.test.js
│   ├── registration-http.test.js
│   ├── registration.test.js
│   └── registration.integration.test.js
└── uploads/              # Local, ignorado; sin funcionalidad de carga
```

`node_modules/` es un directorio local generado por npm e ignorado por Git. No forma parte del código versionado.

## Configuración local segura

Desde la raíz del repositorio, entrar en `backend/`. Si no existe `.env`, crear una copia de `.env.example`; si ya existe, conservarla y editar únicamente los valores necesarios de forma local. Nunca sobrescribir una configuración existente sin revisarla.

| Variable | Configuración prevista |
| --- | --- |
| `NODE_ENV` | `development` |
| `HOST` | `127.0.0.1` |
| `PORT` | `4000` |
| `DB_HOST` | `127.0.0.1` |
| `DB_PORT` | `3306` |
| `DB_USER` | `skillswap_app` |
| `DB_PASSWORD` | Configurar exclusivamente en el entorno local |
| `DB_NAME` | `skillswap_ai` |
| `CORS_ORIGIN` | `http://localhost:5173`; admite lista separada por comas |

El archivo `.env` se carga desde `backend/`, con independencia del directorio de ejecución. Las variables ya presentes en el proceso tienen precedencia. La configuración valida puertos, campos obligatorios, entorno, usuario aplicativo y orígenes explícitos.

La base y el usuario deben existir previamente. La aplicación no utiliza `root` ni crea tablas. `skillswap_app` debe conservar permisos DML, sin DDL. Las futuras migraciones requerirán una cuenta separada y un procedimiento aprobado.

El pool tiene un máximo de cinco conexiones, cola limitada y tiempos controlados. La comprobación ejecuta `SELECT 1`. La posibilidad de suministrar TLS existe en la fábrica del pool, pero el arranque actual no incorpora configuración de despliegue remoto por variables.

La ausencia de contraseña permite mantener la salud HTTP disponible, pero hace fallar la comprobación de base de datos. Esto no representa una autenticación funcional ni una configuración válida para producción.

## Instalación y ejecución

En una instalación nueva, desde la raíz:

```sh
cd backend
npm ci
```

Conservar `package-lock.json`. No reinstalar dependencias para ejecutar el servidor si ya están correctamente instaladas.

```sh
npm run dev
```

El modo de desarrollo usa el observador nativo de Node. Para arrancar sin observador:

```sh
npm start
```

La API escucha en `127.0.0.1:4000` con la configuración prevista. `SIGINT` y `SIGTERM` solicitan cierre ordenado del servidor y pool.

## Endpoints implementados

| Método y ruta | HTTP | Respuesta |
| --- | --- | --- |
| `GET /api/health` | 200 | `{"status":"ok","service":"skillswap-api"}` |
| `GET /api/health/db` | 200 | `{"status":"ok","database":"connected"}` |
| `GET /api/health/db`, sin disponibilidad | 503 | `{"status":"error","database":"unavailable"}` |
| Ruta inexistente | 404 | `{"status":"error","message":"Not found"}` |

La salud HTTP no depende de MySQL. La salud de base de datos consulta realmente el pool.

Con el servidor iniciado:

```sh
curl -i http://127.0.0.1:4000/api/health
curl -i http://127.0.0.1:4000/api/health/db
```

## Pruebas y comprobaciones

Desde `backend/`:

```sh
npm test
find src tests -name '*.js' -exec node --check {} \;
npm ls --depth=0
npm audit
npm audit signatures
```

Las pruebas usan `node:test` y `node:assert/strict`. Cubren importación sin apertura de servidor, salud, 404, errores, CORS y configuración. Los casos de base de datos de la suite utilizan una dependencia simulada: **no acreditan conexión real**. Esa conexión requiere la comprobación de integración independiente y el endpoint de base de datos con configuración real.

Las pruebas HTTP abren puertos locales efímeros. Las auditorías npm necesitan acceso al registro. Su resultado debe registrarse cuando se ejecuten; esta documentación no garantiza resultados de auditorías futuras.

## Seguridad y política de trabajo

- `.env`, sus variantes privadas, dependencias, logs y uploads se mantienen fuera de Git. `.env.example` se conserva sin secretos.
- No imprimir configuraciones completas, contraseñas, códigos temporales o sesiones en respuestas o logs.
- Las variables `VITE_*` son públicas; no sirven para guardar secretos de backend.
- Los accesos demo del prototipo no se incorporan a la autenticación real.
- El CORS actual usa orígenes explícitos; sesiones con cookies y CSRF están pendientes de implementación.
- Trabajar exclusivamente en `feature/backend`, sin modificar otras ramas ni frontend.
- Mantener el README general de la raíz intacto; la documentación específica vive en este directorio.
- Usar commits progresivos con prefijos `feat`, `fix`, `test` o `docs` y descripción en español, por ejemplo: `docs(backend): documentar contratos de autenticacion`.
- Revisar pruebas, alcance, diferencias y secretos antes de publicar únicamente en `origin feature/backend`. No usar force push ni preparar archivos indiscriminadamente.

## Migración 001_auth_foundation

Archivo: [database/migrations/001_auth_foundation.sql](database/migrations/001_auth_foundation.sql). Prepara ocho tablas InnoDB: `schema_migrations`, `careers`, `career_cycles`, `users`, `student_profiles`, `email_verifications`, `auth_sessions` y `credit_transactions`. `career_cycles` normaliza las combinaciones autorizadas de carrera y ciclo; no se carga ningún catálogo. No contiene cuentas, administradores, códigos ni créditos iniciales.

**Estado real:** aplicada con `skillswap_migrator` en `skillswap_ai_test_auth` y `skillswap_ai`; 28 pruebas aprobadas, ninguna omitida. Verificadas 8 claves primarias, 7 foráneas, 6 UNIQUE y 31 CHECK. Cada esquema conserva una única fila de historial; las tablas de negocio permanecen vacías. Las inserciones sintéticas se ejecutaron únicamente en pruebas y se revirtieron. El archivo no se ejecuta al arrancar Express. El usuario aplicativo conserva DML y no ejecuta esta migración.

### Evidencia de validación

Checksum SHA-256 aprobado y registrado en ambos esquemas:

```text
a544084c180a8c8ce701bd506bc98819d4e433b61460b1b20b7dbe4f0e1061c8
```

La inspección previa de la principal confirmó esquema vacío, identidad `skillswap_migrator@127.0.0.1`, permisos específicos y checksum validado. La segunda aplicación devolvió `applied: false`, sin duplicar tablas ni historial. Los endpoints de salud se comprueban separadamente del DDL.

Conservar configuraciones locales separadas: `.env.migrations.local` para pruebas y `.env.migrations.main.local` para la principal; ambas quedan ignoradas por `.env.*`. No sobrescribir una con otra ni versionarlas. Node puede cargarlas explícitamente con `--env-file`; el ejecutor no las descubre automáticamente. Las variables heredadas del proceso tienen precedencia: verificar siempre el destino efectivo.

La configuración de migraciones usa `MIGRATION_*`; la suite real usa `MIGRATION_TEST_*`. Para ejecutar la integración, proporcionar las cuatro variables de pruebas en el proceso desde un mecanismo local seguro, nunca copiar contraseñas a comandos o documentación. En esta validación se mapearon las credenciales locales a las variables de pruebas únicamente en memoria.

### Procedimiento de ejecución aprobado por alcance

Antes de ejecutar DDL, disponer de una cuenta distinta de `skillswap_app`, con permisos mínimos de `CREATE`, `REFERENCES`, `SELECT` e `INSERT` en el esquema destino; las pruebas también necesitan `UPDATE`. No usar `root` como usuario aplicativo. La cuenta de migraciones tiene concesiones independientes y exactas para cada destino autorizado; UPDATE se limita al esquema aislado. No solicitar secretos por chat ni incluirlos en argumentos, logs o archivos versionados.

1. Revisar instancia `127.0.0.1:3306`, MySQL 8.4, identidad autenticada, permisos y objetos existentes. El destino de aplicación es `skillswap_ai`; la validación debe usar un esquema aislado precreado y expresamente autorizado.
2. Adquirir un bloqueo asesor por esquema con `GET_LOCK` en la misma conexión; comprobar que se obtuvo. Mantenerlo hasta terminar y liberarlo en `finally`.
3. Calcular SHA-256 de los bytes exactos del archivo. Inspeccionar historial y objetos: esquema vacío para primera aplicación; si existe la versión completada, comprobar checksum y estructura antes de omitirla. Ante deriva, tablas parciales o ajenas, detenerse sin modificar objetos.
4. Configurar UTC, modo SQL estricto y las variables de sesión `@skillswap_migration_version = '001_auth_foundation'` y `@skillswap_migration_checksum` con el SHA-256 calculado. Estas variables contienen metadatos técnicos, no secretos.
5. Ejecutar cada sentencia secuencialmente y detenerse al primer error. El único `INSERT` del archivo registra versión/checksum al final, después de todas las creaciones. Nunca continuar con `--force` ni registrar éxito desde un bloque `finally`.
6. Verificar tablas, restricciones e historial. Liberar el bloqueo y cerrar conexión. Conservar un reporte sin credenciales.

MySQL hace commits implícitos con DDL: no prometer rollback global. Si falla una creación, pueden quedar tablas parciales sin fila de éxito. No borrarlas ni reanudar automáticamente: inspeccionar y acordar recuperación. La ausencia de una fila no significa que no exista DDL parcial.

El ejecutor autorizado es [database/migrate.js](database/migrate.js), reutilizado por las pruebas. Importarlo no abre conexiones ni aplica DDL. Solo admite la migración revisada `001_auth_foundation`; no es un parser SQL genérico. No lee `.env` ni reutiliza variables `DB_*`.

Configurar de forma segura en el proceso `MIGRATION_DB`, `MIGRATION_USER` y `MIGRATION_PASSWORD`. Solo admite exactamente `skillswap_ai` y `skillswap_ai_test_auth` en `127.0.0.1:3306`. Si se especifican `MIGRATION_HOST` o `MIGRATION_PORT`, deben coincidir exactamente con ese destino. Sin credenciales separadas, falla antes de conectarse. No suministrar contraseñas en argumentos ni historial del shell.

Desde `backend/`, la inspección predeterminada no ejecuta DDL ni registra historial:

```sh
node database/migrate.js --check
```

La aplicación explícita requiere `MIGRATION_ALLOW_DDL=yes` configurada por el operador. Para `skillswap_ai` también exige `MIGRATION_VALIDATED_CHECKSUM` igual al SHA-256 del archivo que ya pasó las pruebas aisladas. Esta variable es una declaración del operador, no una demostración automática de que se ejecutaron las pruebas. No configurarla para eludir una validación pendiente.

```sh
node database/migrate.js --apply
```

El ejecutor verifica identidad autenticada, permisos directos, versión, destino, objetos, checksum e historial. Bloquea la aplicación por esquema e inspecciona nuevamente bajo el bloqueo. Un esquema parcial, objetos ajenos, historial distinto o deriva básica de estructura bloquean la ejecución. No elimina objetos ni otorga permisos. Solo registra la versión al terminar las sentencias y hace una comprobación posterior.

La comprobación estructural compara tablas, motor, nombres/orden/tipos de columnas, nombres de restricciones y CHECK habilitados. No demuestra equivalencia completa de expresiones CHECK, valores por defecto o definiciones de índices bajo nombres iguales; esos cambios requieren revisión humana y migraciones versionadas. Si la comprobación posterior falla tras el INSERT final, existe registro técnico de sentencias terminadas, pero la ejecución global se informa como fallida y bloquea publicación.

### Privilegios exactos y preparación manual de Workbench

El ejecutor consulta `@@GLOBAL.partial_revokes` antes de interpretar `SHOW GRANTS FOR CURRENT_USER()`. No cambia esta opción ni modifica permisos. Si no conoce su valor, bloquea la comprobación.

- Con `partial_revokes=OFF`, los guiones bajos de la concesión deben estar escapados: `skillswap\_ai\_test\_auth`. Un nombre sin escapes representa un patrón y se rechaza, aunque visualmente coincida con el destino.
- Con `partial_revokes=ON`, usar el nombre literal sin barras: `skillswap_ai_test_auth`. Por política conservadora, representaciones con barras se rechazan en este modo; no se adivina su significado ni se recomienda cambiar la opción global.
- Solo se acumulan privilegios de concesiones directas sobre el esquema exacto. Se permiten entradas independientes sobre los dos destinos autorizados, pero los permisos de uno nunca satisfacen los del otro.
- Se requieren SELECT, INSERT, CREATE y REFERENCES. UPDATE está permitido únicamente en pruebas y es obligatorio para la suite de integración. No se necesitan DELETE, ALTER, DROP, TRIGGER ni EVENT para este incremento.
- `USAGE ON *.*` es la única entrada global aceptada. Se rechazan permisos globales operativos, ALL PRIVILEGES, GRANT OPTION, roles, revocaciones parciales, ámbitos de tabla, esquemas ajenos y formatos ambiguos. No ampliar permisos para hacer pasar el preflight.

En Workbench, abrir Server → Users and Privileges, seleccionar la cuenta de migraciones y mantener Administrative Roles sin privilegios globales. En Schema Privileges → Add Entry, configurar exclusivamente el esquema de pruebas: si partial_revokes está OFF, usar Schemas matching pattern con `skillswap\_ai\_test\_auth`; si está ON, seleccionar el esquema literal `skillswap_ai_test_auth`. Marcar SELECT, INSERT, UPDATE, CREATE y REFERENCES; revisar el alcance antes de Apply. Los permisos locales fueron preparados manualmente por la desarrolladora; el ejecutor no crea cuentas ni modifica concesiones.

Confirmar mediante consultas de solo lectura `SELECT @@GLOBAL.partial_revokes;` y `SHOW GRANTS FOR CURRENT_USER();` desde la conexión de migraciones. No alterar `skillswap_app`. La entrada exacta de migraciones sobre la principal usa únicamente SELECT, INSERT, CREATE y REFERENCES; el escape depende de la misma opción global. Un esquema de pruebas vacío aún no equivale a migración validada.

### Pruebas aisladas optativas

`npm test` ejecuta comprobaciones estáticas, el control de detención ante errores y la suite de salud. Sin configuración explícita, la prueba de integración aparece como **SKIP**; eso no valida sintaxis SQL ni restricciones en MySQL.

Para habilitarla, un operador debe configurar de forma segura en el proceso:

| Variable | Requisito |
| --- | --- |
| `MIGRATION_TEST_DB` | Exactamente `skillswap_ai_test_auth`, precreado y autorizado; vacío en primera aplicación o con el historial compatible y sin datos de negocio al repetir pruebas; nunca `skillswap_ai` ni otros sufijos |
| `MIGRATION_TEST_USER` | Cuenta de migraciones de pruebas distinta del usuario aplicativo |
| `MIGRATION_TEST_PASSWORD` | Secreto local, nunca en ejemplos ni historial de comandos |
| `MIGRATION_TEST_ALLOW_DDL` | `yes`, consentimiento explícito para crear tablas en ese esquema aislado |

Host y puerto están fijados en `127.0.0.1:3306`; no se reutilizan credenciales de aplicación. No se añaden estas claves a `.env.example` en este incremento. Proporcionar las cuatro variables completas; una configuración parcial debe fallar, no omitirse silenciosamente.

Ejecutar desde `backend/`:

```sh
node --test tests/migrations.test.js
```

La integración verifica versión, destino, permisos directos, esquema vacío/historial compatible, creación, reaplicación sin cambios, tipos, claves, roles, normalización, ciclos autorizados, caducidades y concesión inicial única. Las cuentas y catálogos sintéticos se insertan únicamente dentro de una transacción y se revierten; las tablas y la fila técnica del historial permanecen para inspección. No se ejecuta `DROP`, `TRUNCATE` ni limpieza destructiva. Las concesiones por roles, globales operativas o con sintaxis no reconocida se rechazan; la suite usa el mismo comprobador de permisos que el ejecutor y exige UPDATE para las pruebas.

La prueba de fallo del ejecutor sin MySQL demuestra detención antes del historial; no equivale a comprobar un fallo DDL real del servidor. La integración real de este incremento pasó; esto no valida automáticamente futuras modificaciones del SQL. No hacer commit ni push si falta alguna verificación obligatoria.

## Incremento 1.3A: persistencia transaccional y errores públicos

Infraestructura transversal implementada y validada con una cuenta solo DML del esquema aislado, sin endpoints nuevos de autenticación ni cambios a las migraciones. `createDatabase()` conserva `check()` y `close()` y añade:

- `execute(sql, values = [])`: usa sentencias preparadas de mysql2, devolviendo `[rows, fields]`. Los valores se enlazan por separado; los identificadores deben pertenecer al código de repositorio, no a entradas del usuario.
- `transaction(async (tx) => ...)`: reserva una conexión, inicia transacción, entrega `tx.execute()`, confirma al resolver y revierte al rechazar. Devuelve el resultado del callback y libera la conexión. No exponer el pool ni manejar HTTP desde esta capa.

Solo se admiten sentencias de datos que comiencen por SELECT, INSERT, UPDATE o DELETE. El API no es un ejecutor de DDL: rechaza comandos de control transaccional y no sustituye al migrador. Los callbacks deben esperar todas sus operaciones y usar exclusivamente `tx.execute()` para participar en la misma transacción. No hay transacciones anidadas, savepoints ni reintentos automáticos.

Cada checkout espera `SET SESSION time_zone = '+00:00'`; el driver usa `timezone: 'Z'` para serializar/leer fechas JavaScript de forma coherente. Escribir fechas desde servicios en UTC; presentar zona local corresponde a la UI. No cambiar la zona global del servidor.

Errores al iniciar o inicializar sesión descartan la conexión. Un fallo de callback intenta rollback y conserva el error original. Si rollback falla, se descarta la conexión en vez de devolver una sesión de estado incierto al pool. Un fallo de commit también descarta y no se reintenta: el resultado puede ser incierto si se perdió la confirmación de MySQL. La idempotencia de negocio deberá resolverse en los servicios futuros.

`src/errors/PublicError.js` define mensajes públicos curados para VALIDATION_ERROR (422), CONFLICT (409), UNAUTHORIZED (401), FORBIDDEN (403), RATE_LIMITED (429) y SERVICE_UNAVAILABLE (503). Solo VALIDATION_ERROR admite `fields`, con mensajes de validación sin valores enviados por el cliente. No construir campos a partir de errores del driver. Los mensajes, código y estado públicos son controlados; un error desconocido produce 500 genérico. El middleware reconoce además JSON inválido (400), cuerpo excesivo (413) y codificaciones no soportadas (415).

Los errores del middleware usan `{error:{code,message,fields?}}`. Se conservan exactamente las respuestas de ambos endpoints de salud y el 404 existente. Esta mejora no implementa registro, autorización ni sesiones.

### Validación de 1.3A

Pruebas unitarias: enlace separado de parámetros, UTC, una conexión por transacción, commit/rollback, cierre del scope, liberación y descarte ante fallos, preservación del error original, TLS y contrato HTTP sin detalles internos. Las pruebas HTTP usan servidores efímeros.

La integración de persistencia requiere la cuenta **solo DML** `skillswap_test_app`, diferente de root, skillswap_migrator y skillswap_app. No usar credenciales de migraciones para validar operaciones del runtime. Configurar localmente las variables siguientes, sin secretos en Git ni en comandos persistentes:

| Variable | Valor o requisito |
| --- | --- |
| `DATABASE_TEST_DB` | Exactamente `skillswap_ai_test_auth` |
| `DATABASE_TEST_USER` | `skillswap_test_app`, sin privilegios globales operativos, roles activos ni DDL, limitada al esquema aislado |
| `DATABASE_TEST_PASSWORD` | Contraseña local |

La cuenta necesita SELECT, INSERT, UPDATE y DELETE en el esquema aislado. La prueba confirma una transacción de solo lectura mediante COMMIT. Las escrituras sintéticas con UUID propio terminan siempre en rollback, tanto ante un error de negocio como ante un error SQL; no se ejecuta limpieza mediante DELETE ni se conservan fixtures. No crea tablas ni toca registros de la base principal. Comprueba también roundtrip de fecha UTC y parámetros como datos.

Con estas variables cargadas de forma local, ejecutar `node --test tests/database.test.js`. Sin ellas se informa SKIP; eso no demuestra funcionamiento transaccional real. La suite de migraciones usa otras variables y una cuenta distinta: no habilitarla en un entorno que prohíba credenciales administrativas. Para una configuración privada que utilice las claves DB_HOST, DB_PORT, DB_NAME, DB_USER y DB_PASSWORD, validar primero el destino exacto 127.0.0.1:3306, skillswap_ai_test_auth y skillswap_test_app. Después mapear en memoria DB_NAME → DATABASE_TEST_DB, DB_USER → DATABASE_TEST_USER y DB_PASSWORD → DATABASE_TEST_PASSWORD al lanzar las pruebas. El archivo local `.env.test.local` se mantiene ignorado e intacto; el runtime de producción no cambia. No habilitar variables MIGRATION_TEST_* en esta ejecución DML.

## Próximos incrementos

Pendientes: SMTP, verificación de correo, concesión inicial atómica de créditos, login y sesiones seguras. El catálogo seleccionado y los documentos legales iniciales ya están versionados. Este documento no autoriza ejecutar esos incrementos ni implementar recuperación de contraseña, reservas o funcionalidades de mentoría.


### Resultado de validación de 1.3A

Suite ejecutada con mapeo de entorno únicamente en memoria: 36 pruebas aprobadas y ninguna fallida. La integración real de persistencia pasó con skillswap_test_app@127.0.0.1 en skillswap_ai_test_auth, sin DDL ni datos sintéticos persistidos. Se verificaron COMMIT de solo lectura, rollback por error de negocio y rollback por error SQL, reutilización de conexiones, parámetros y fechas UTC.

La integración de migraciones quedó omitida deliberadamente en esta ejecución para no utilizar la cuenta de migraciones; su validación de 1.2 permanece documentada. La suite HTTP conserva los cuerpos de salud y actualiza las expectativas del nuevo contrato del middleware. La validación 1.3A no requiere ni realiza escrituras en skillswap_ai.


## Incremento 1.3B: registro institucional

`POST /api/auth/register` recibe exactamente nueve campos: firstName, lastName, email, career, cycle, password, termsAccepted, termsVersion y privacyVersion. Exige JSON, consentimiento true y versiones vigentes 1.0.0 configuradas en registration.policy.js. La fecha de aceptación es del servidor UTC. React debe mostrar los textos versionados antes de aceptar; no preseleccionar la casilla ni enviar campos internos.

El correo se recorta y convierte a minúsculas; la gramática inicial exige dos segmentos alfabéticos ASCII separados por un punto y dominio exacto tecsup.edu.pe. Se rechazan alias, números, guiones, segmentos adicionales, espacios internos, dominios alternativos y subdominios. Cualquier ampliación futura requiere acuerdo del contrato. Contraseña de 8–128 puntos de código Unicode, sin recortar/normalizar, máximo 512 bytes y Unicode bien formado.

El hash usa scrypt asíncrono nativo, N=131072, r=8, p=1, salt aleatorio de 16 bytes y salida de 32 bytes. Conserva parámetros/salt para futura comprobación y no añade dependencias. Máximo dos derivaciones simultáneas por proceso; exceso responde 503 sin cola ilimitada. No se implementó login. Referencias: [Node crypto](https://nodejs.org/docs/latest-v24.x/api/crypto.html) y [OWASP Password Storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html).

El servicio valida y calcula hash antes de abrir la transacción. El repositorio bloquea catálogo carrera/ciclo y crea usuario STUDENT/PENDING_VERIFICATION junto con perfil onboarding=false en una sola conexión. Acepta únicamente carrera activa y no ambigua, con ciclo existente. La restricción UNIQUE del correo resuelve solicitudes concurrentes; tras rollback se confirma el duplicado y se devuelve 409 EMAIL_ALREADY_REGISTERED. No se actualiza la cuenta existente. Un fallo de perfil revierte el usuario. No se crean verificaciones, sesiones ni créditos.

El controlador devuelve 201 con `{user:{email,role:"student",emailVerified:false,onboardingComplete:false}}`, sin cookie, contraseña, hash ni ID interno. Los errores mantienen el contrato centralizado. Las rutas de salud y su 404 no cambian.

Protecciones técnicas iniciales: JSON de hasta 100kb, origen de navegador en CORS_ORIGIN, límite por proceso de 10 intentos/IP y 5/correo por 60 segundos (todas las solicitudes admitidas por el middleware cuentan), máximo 2000 claves hash en memoria; 429 incluye Retry-After. Un origen ausente permite clientes API no navegador; un origen presente no autorizado recibe 403. No se confía en X-Forwarded-For: cualquier proxy debe configurarse expresamente y revisar los límites antes de despliegue. Los límites en memoria no se comparten entre procesos. Registro no usa sesiones/cookies: las protecciones CSRF autenticadas corresponden al próximo incremento de sesiones, no están implementadas aquí.

Ver [catálogo y carga DML versionada](docs/academic-catalog.md), [términos](docs/legal/terms-1.0.0.md) y [privacidad](docs/legal/privacy-1.0.0.md). No se modifica la migración 001. La carga del catálogo principal requiere autorización del destino; sin catálogo cargado no se admite ninguna carrera ausente. Los textos tienen identificación del responsable, contacto, conservación y revisión jurídica pendientes antes de operación pública. Este registro funcional del prototipo no certifica preparación legal para un servicio público.

### Pruebas de registro

```sh
cd backend
npm test
node scripts/verify-local.js
```

El lanzador mapea el archivo privado .env.test.local en memoria y solo acepta skillswap_test_app en 127.0.0.1:3306/skillswap_ai_test_auth. No cambia la configuración del runtime ni archivos privados. Incluye pruebas unitarias, HTTP y persistencia real: consentimiento, hash real, duplicados concurrentes, catálogo inactivo/ambiguo, ciclo inválido, rollback del perfil y ausencia de sesiones/créditos. Los datos sintéticos y su limpieza se limitan a registros propios del esquema aislado. La prueba del catálogo carga/repite dentro de una transacción que termina en rollback. No habilita credenciales MIGRATION_TEST_* ni repite DDL.

No se han implementado SMTP, verificación de correo, login, /me, logout ni perfil editable. No avanzar automáticamente a esos incrementos.

## Incremento 1.4A: infraestructura de envío de verificación

POST /api/auth/email/send-code está implementado con transporte SMTP sustituible, OTP criptográfico y HMAC ligado al desafío, transacción de emisión y límites persistidos. La red SMTP se ejecuta fuera de la transacción. La respuesta 202 es uniforme y no acredita recepción; sin SMTP habilitado responde 503. Registro 1.3B permanece compatible, sin correo automático.

No hay proveedor SMTP activo configurado. La política OTP ya está aprobada y fijada: seis dígitos, 600 segundos, cinco intentos, cooldown de 60 segundos y cinco solicitudes por hora móvil. La ampliación 002 fue aplicada y validada en skillswap_ai_test_auth y skillswap_ai. Consultar [email-delivery.md](docs/email-delivery.md) para variables locales obligatorias, pruebas, limitaciones de cola/límites por proceso y requisitos de entrega real. No se modifican archivos privados ni se envía correo a terceros durante las pruebas.

Las pruebas reales de persistencia se limitan a skillswap_ai_test_auth con skillswap_test_app. Los transportes sustituidos no constituyen evidencia SMTP. Nodemailer 10.4.0 es la única dependencia incorporada; requiere Node >=20 y se usa con validación TLS, sin logs de contenido ni acceso a archivos/URLs. No se modificó la migración 001. Verificación de códigos, concesión de créditos, login y sesiones siguen pendientes.

## Migración OTP 002 (aplicada en ambas bases)

Ver [otp-migration-002.md](docs/otp-migration-002.md): control persistente por HMAC para cualquier correo, estado SENDING no verificable y transición condicionada a PENDING después de aceptación SMTP y confirmación MySQL. Nueva clave privada independiente OTP_RATE_HMAC_KEY_HEX; no se cambia ningún archivo privado ni se conceden permisos.

El migrador conserva el modo 001 predeterminado y requiere --through=002_otp_delivery_safety para incluir ambas versiones en orden. Mantiene bloqueo, checksums independientes, autorización DDL explícita y detención ante fallos parciales. Esta preparación no autoriza ejecutar migraciones. Las pruebas unitarias con modelo SQL no prueban funcionamiento real de 002 en MySQL. No ejecutar pruebas de integración hasta la autorización correspondiente.

Validación real aislada 002 del 2026-11-10: 96 pruebas aprobadas, 0 fallidas y una integración histórica con migrator omitida. DDL ejecutado únicamente con skillswap_migrator; fixtures DML únicamente con skillswap_test_app en skillswap_ai_test_auth. Segunda ejecución idempotente, historial/checksums separados y principal intacta mediante huellas de datos/DDL. Se corrigieron dos interpretaciones del postcheck (CHECK escapado y nombres de columnas con dígitos) sin alterar los SQL aplicados ni reconstruir objetos. Detalles y limitaciones en la documentación de 002. La aplicación principal posterior se documenta al final de esta sección; SMTP real y 1.4B siguen pendientes.

Finalización 1.4A del 2026-11-10: 002 aplicada en la principal con autorización explícita y checksums validados, sin repetir 001; segunda ejecución idempotente. La principal conserva 14 carreras/84 asociaciones y cero cuentas, desafíos, sesiones o créditos demo. skillswap_app y ambos endpoints de salud comprobados (HTTP 200). Suite repetida en la base aislada: 96 aprobadas, 0 fallidas, 1 omitida. La generación/protección de códigos, admisión persistente y transiciones de envío están implementadas; recepción SMTP real pendiente de configurar y comprobar. No se implementaron 1.4B ni login.
