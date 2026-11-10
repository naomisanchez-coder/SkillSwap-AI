# Catálogo académico inicial 1.0.0

Fuente de nombres: https://www.tecsup.edu.pe/segmento-joven/ (consulta 2026-11-09). Selección de 14 carreras aprobadas para SkillSwap AI, organizada en cinco áreas; no representa toda la oferta ni disponibilidad por sede. Los ciclos 1–6 son una configuración del prototipo y no certifican la duración oficial de cada carrera. La carrera no restringe las habilidades ni los mentores disponibles.

`database/catalogs/academic-1.0.0.json` conserva claves estables, UUID deterministas, nombres, áreas y ciclos. Schema 001 no contiene columna de área: se mantiene la asociación como metadato versionado sin alterar el esquema. Una futura persistencia/consulta por área requerirá un incremento independiente. No se implementan estadísticas.

El cargador `database/academic-catalog.js` utiliza una transacción DML y parámetros. Inserta únicamente filas faltantes; nunca sobrescribe nombres, IDs, estado activo ni ciclos existentes. Conflictos de identidad/nombre/ciclos abortan toda la operación. Una segunda aplicación no duplica datos. No es una migración DDL: no altera `001_auth_foundation.sql` ni `schema_migrations`.

Inspección local sin escritura (el archivo privado no se muestra):

```sh
cd backend
node scripts/academic-catalog.js --check .env.test.local
```

Carga únicamente cuando se autorice expresamente el destino:

```sh
CATALOG_ALLOW_WRITE=yes node scripts/academic-catalog.js --apply .env.test.local
```

Solo admite 127.0.0.1:3306 y las parejas skillswap_test_app/skillswap_ai_test_auth o skillswap_app/skillswap_ai, verificando CURRENT_USER y DATABASE. La configuración principal usa `.env`; no se usan cuentas administrativas. Preparar el cargador no implica autorizar automáticamente su aplicación principal. Las pruebas de escritura se ejecutan exclusivamente en la base aislada. Una inspección pendiente informa missingCareers/missingCycles; tras aplicar deben ser cero.

Los documentos propios [términos 1.0.0](legal/terms-1.0.0.md) y [privacidad 1.0.0](legal/privacy-1.0.0.md) son texto versionado para los futuros modales React. No se modificó el frontend ni se habilitó un endpoint legal. Conservar el texto de cada versión: cambios materiales requieren nueva versión, no reescribir una aceptación histórica. Son documentos iniciales con responsable/contacto y revisión jurídica pendientes antes del servicio público.
