# Procedimiento aislado de tres mentores ficticios

Este procedimiento es exclusivamente para `skillswap_ai_test_auth`. Los manifiestos tienen `scope: DEMO_ONLY`; los cargadores rechazan ese alcance si el destino es `skillswap_ai`. No se atribuyen las habilidades o niveles a TECSUP y no se afirma que las personas ficticias posean credenciales reales.

## Manifiestos y datos

- Diego Ramírez Torres: `software`, ciclo 4, Programación en Python, nivel avanzado de demostración.
- Valeria Mendoza Flores: `diseno-industrial`, ciclo 4, Diseño de interfaces, nivel intermedio de demostración.
- Andrés Castillo Vega: `software`, ciclo 5, Desarrollo web, nivel intermedio de demostración.

Las carreras y ciclos proceden del catálogo académico versionado ya usado por MySQL. Las habilidades, categorías y niveles son provisionales y llevan marcas literales de demostración. `database/demo-mentors.js` valida que el manifiesto tenga exactamente tres perfiles, biografías ficticias, referencias por código y disponibilidad estructurada de Lima.

## Preparación idempotente

Primero inspeccionar, sin escribir:

```sh
node scripts/skill-catalog.js --check .env.test.local database/catalogs/demo-skills-1.0.0.json
node scripts/level-catalog.js --check .env.test.local database/catalogs/demo-levels-1.0.0.json
```

Solo con autorización para DML aislado:

```sh
SKILL_CATALOG_ALLOW_WRITE=yes node scripts/skill-catalog.js --apply .env.test.local database/catalogs/demo-skills-1.0.0.json
LEVEL_CATALOG_ALLOW_WRITE=yes node scripts/level-catalog.js --apply .env.test.local database/catalogs/demo-levels-1.0.0.json
```

Los cargadores insertan faltantes exactos, no sobrescriben ni desactivan filas, abortan ante colisiones y son idempotentes. Las variables de autorización viven solo durante el comando; el archivo privado continúa ignorado y con permisos `0600`.

## Flujo funcional que no debe omitirse

1. Registrar cada cuenta mediante el endpoint institucional y verificarla usando transporte sustituible en el esquema aislado. No se inserta una cuenta directamente para una demostración funcional.
2. Completar perfil con la carrera/ciclo indicados y una biografía que declare el carácter ficticio.
3. Cargar un avatar sintético autorizado (PNG/JPEG/WebP válido). No usar fotografías de personas reales sin permiso.
4. Declarar la habilidad `TEACH` y enviar una solicitud con un PDF válido. El PDF debe contener visiblemente “EVIDENCIA ACADÉMICA FICTICIA — SOLO DEMOSTRACIÓN”, no código activo ni datos reales.
5. Iniciar sesión como ADMIN preexistente; descargar el documento por la ruta privada, revisar y decidir mediante el endpoint ADMIN. Nunca modificar el estado con SQL en la demostración.
6. Ya aprobada la solicitud, el mentor activa su oferta y disponibilidad mediante las rutas estudiantiles existentes.
7. ADMIN asigna el nivel provisional a la oferta. Solo entonces el perfil se vuelve elegible con nivel para Explorar/Para ti.
8. Verificar que Explorar no publique solicitudes pendientes/rechazadas, que el detalle no exponga documentos y que el recomendador identifique calidad ausente sin inventarla.

La integración automatizada `tests/admin.integration.test.js` usa cuentas pre-verificadas únicamente como fixtures técnicas para aislar la lógica ADMIN. Aun así, crea archivos sintéticos válidos, pasa por solicitud, aprobación, oferta, nivel y disponibilidad; valida concurrencia/auditoría y elimina selectivamente todos sus registros y objetos privados.

## Limpieza selectiva

Registrar los UUID y claves del sufijo de la ejecución. Eliminar en orden: niveles de oferta, disponibilidad, ofertas, eventos/documentos/solicitudes, foto, metadatos y objetos privados, habilidades declaradas, sesiones de autenticación, detalles/perfiles y usuarios. Quitar catálogos `DEMO_ONLY` solo si fueron insertados por esa ejecución y no tienen referencias. No usar `TRUNCATE`, `DROP`, comodines por correo ni borrar catálogos o cuentas ajenos.
