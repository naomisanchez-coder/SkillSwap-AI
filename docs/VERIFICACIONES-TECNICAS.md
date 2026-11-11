# Verificaciones técnicas de integración

Ejecutadas por Codex el 11 de noviembre de 2026, en el worktree de `develop`. **No equivalen a pruebas manuales ni a una validación visual.**

| Comprobación | Resultado |
| --- | --- |
| Dependencias frontend/backend | `npm ci --ignore-scripts`, instalación correcta |
| Node | 24.21.0 |
| React y TypeScript | `npm --prefix frontend run build`, correcto |
| ESLint | `npm --prefix frontend run lint`, correcto |
| Pruebas frontend | 89 aprobadas, 0 fallidas |
| Suite backend técnica | 201 casos: 198 aprobados, 3 omitidos, 0 fallidos |
| Configuración local privada | `npm --prefix backend run demo:config-check`, correcta |
| Arranque local sin SMTP | Correcto; proceso cerrado al terminar |
| `/api/health` | HTTP 200, `status: ok` |
| `/api/health/db` | HTTP 200, `database: connected` |
| Mentores demo persistentes | 3 aprobados y activos, confirmados con SELECT COUNT de solo lectura |
| SQL de diagnóstico | SELECT 1 y lectura de presencia de migraciones, sin escrituras |
| Git | Merges normales, sin conflictos; `git diff --check` correcto |
| Secretos | Sin coincidencias con los valores privados vigentes ni patrones de claves en los archivos que se publican |
| Archivos privados | `.env.local` y almacenamiento ignorados por Git; archivos de entorno originales leídos, sin cambios |
| Original | `feature/backend` permanece en `05162c654d772ce4d82d7e91f3271a5cf9bc93d1`, limpio |

La suite backend se ejecuta con:

```sh
npm --prefix backend run test:technical
```

El lanzador de pruebas excluye los archivos `*.integration.test.js` y retira las credenciales/activadores de integración del entorno del proceso hijo. Las tres omisiones corresponden a pruebas condicionales de MySQL dentro de las suites de catálogo, base de datos y migraciones. Las pruebas HTTP usan servicios mock y puertos efímeros locales. No se ejecutaron migraciones ni operaciones sobre `skillswap_ai_test_auth` o `skillswap_ai`.

Las nuevas regresiones cubren contratos HTTP y multipart/CSRF, OTP con identificador en memoria, recuperación, ausencia de reintentos generativos, errores de cuota, UUID y tarifas de ofertas, cobertura exacta de horarios, fechas UTC/Lima, reservas y recarga de saldos, sincronización LEARN conservando TEACH, ranking parcial, fechas reales de sesiones y almacenamiento con origen de solo lectura.

En el primer intento técnico de arranque se detectó que los valores vacíos de seguridad de `.env.demo.local` anulaban valores privados válidos. Se corrigió la precedencia, se añadieron validaciones y una regresión automatizada; el arranque y ambos endpoints de salud pasaron después. No se modificaron los archivos privados originales.

Avisos pendientes: bundle principal de aproximadamente 519 kB; diez avisos moderados en herramientas de desarrollo relacionadas con minimatch/ESLint/TypeScript-ESLint. No hay avisos altos/críticos reportados por npm ni dependencias de producción afectadas en esa auditoría. No se aplicaron actualizaciones forzadas o cambios mayores de dependencias.

SMTP y Gemini no se invocaron. Registro, entrega/verificación real de OTP, login en navegador, perfil, reservas, créditos, cancelación y chatbot quedan para la [guía manual de Naomi](INTEGRACION-Y-PRUEBAS-MANUALES.md). No se utilizó Chrome, Computer Use ni automatización visual.
