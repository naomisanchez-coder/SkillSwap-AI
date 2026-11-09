# Backend de SkillSwap AI

SkillSwap AI es una plataforma académica para el intercambio de habilidades entre estudiantes de TECSUP. El backend será responsable de la identidad, autorización, verificación institucional, reglas de negocio y persistencia compartida. MySQL será la fuente de verdad; el navegador no podrá asignar permisos, verificación ni créditos.

## Estado del incremento 1.1

La Etapa 0 fue implementada en `aa5fd55cab63432b7bd099eabd6f6175d6592142`: servidor Express, configuración local, pool MySQL, endpoints de salud y pruebas automatizadas. Este incremento añade únicamente documentación.

**La autenticación está planificada, no implementada.** Registro, correo real, sesiones de usuario, créditos y migraciones todavía no están disponibles. Los contratos propuestos están en [docs/auth-api.md](docs/auth-api.md).

## Arquitectura

- Presentación: frontend React separado, comunicado mediante API REST JSON.
- Servidor: Node.js con JavaScript ES Modules y Express.
- Persistencia: MySQL 8.4 mediante `mysql2/promise`.
- Organización prevista: monolito modular con rutas, controladores, servicios y repositorios. Las capas de negocio aún no existen.

`src/app.js` crea la aplicación sin abrir puertos. `src/server.js` administra el servidor HTTP y el cierre del pool. La configuración se concentra en `src/config/`. El pool actual expone comprobación de disponibilidad y cierre; una interfaz transaccional para servicios futuros queda pendiente.

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

El manifiesto admite Node `^24.0.0 || ^26.0.0`. La base de datos objetivo es MySQL Community Server 8.4; la versión de parche del servidor no se volvió a consultar durante este incremento documental. `package-lock.json` fija el árbol reproducible de dependencias.

## Estructura existente

```text
backend/
├── .env                  # Local, ignorado por Git
├── .env.example
├── README.md
├── package.json
├── package-lock.json
├── database/
│   └── .gitkeep           # Sin migraciones implementadas
├── docs/
│   └── auth-api.md
├── src/
│   ├── .gitkeep
│   ├── app.js
│   ├── server.js
│   ├── config/
│   │   ├── db.js
│   │   └── env.js
│   ├── middleware/
│   │   └── errorHandler.js
│   └── routes/
│       └── health.routes.js
├── tests/
│   ├── .gitkeep
│   └── health.test.js
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

## Próximos incrementos

Pendientes de aprobación: decisiones del contrato, migraciones reproducibles, registro institucional, envío real de correo, concesión inicial atómica y sesiones seguras. Este documento no autoriza ejecutar esos incrementos ni implementar recuperación de contraseña, reservas o funcionalidades de mentoría.
