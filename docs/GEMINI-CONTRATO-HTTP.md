# Chatbot: corrección del contrato HTTP

11 de noviembre de 2026. Rama develop. Esta corrección solo afecta al chatbot y su inicialización; no modifica perfil, autenticación, créditos, reservas, catálogo, diseño ni archivos privados.

## Hallazgos comprobados

La configuración efectiva del lanzador `npm run demo:start -- --smtp` contiene AI_ENABLED, AI_PROVIDER, AI_MODEL, GEMINI_API_KEY y AI_MAX_OUTPUT_TOKENS presentes y válidos. El modelo y la credencial coinciden con el archivo privado de IA del backend original. El límite es 300 tokens, SMTP permanece habilitado y React apunta a localhost:4000/api. No se imprimieron sus valores secretos ni se hicieron llamadas al proveedor para verificarlo.

Los diagnósticos aportados previamente por Naomi mostraban UPSTREAM/503: Gemini respondió con indisponibilidad remota. Ese estado no demuestra ausencia de configuración, error CSRF o timeout, y no se puede eliminar mediante un cambio local ni declarar resuelto sin otra consulta manual.

Además se encontró un fallo local independiente y reproducible: `ai.controller.js` entrega HTTP 200 con `{ message: { role: 'assistant', content: '...' }, grounding, rateLimit }`, pero el servicio React leía `reply`, un campo interno del servicio backend que no forma parte del JSON público. Los mocks frontend anteriores también devolvían ese formato incorrecto y ocultaban el defecto. Incluso con un 200 válido del proveedor, React no recuperaba el texto correcto.

## Cambio mínimo

- `frontend/src/services/ai.ts` consume `message.content`, valida el rol assistant y rechaza texto ausente/vacío. Mantiene cookie, CSRF, espera de 35 segundos, errores seguros y una sola petición por envío.
- `backend/src/modules/student/ai.factory.js` reúne la inicialización que ya utilizaba Express, con transporte sustituible para pruebas. `backend/src/server.js` usa esa misma función. Crear el servicio no produce solicitudes generativas.
- Se mantiene Gemini configurado y OpenAI como alternativa explícita. No hay cambio automático de proveedor ni reintentos generativos.
- El lanzador y los archivos privados no necesitaban otra modificación. El adaptador Gemini permanece intacto y no envía store:false.
- Se corrigieron los mocks de frontend y se añadió una regresión que conecta el cliente real con el controlador real y el inicializador Gemini mediante transporte mock.

## Verificaciones

- Build React/TypeScript y ESLint correctos.
- 98 pruebas frontend aprobadas, 0 fallidas.
- 212 pruebas backend aprobadas, 3 omitidas, 0 fallidas.
- Configuración habilitada, inicialización sin llamadas, respuesta exitosa simulada y alternativas Gemini/OpenAI.
- Errores simulados 400, 401/403, 429, 500/503 y timeout; diagnósticos sanitizados y ausencia de reintentos.
- Contrato HTTP protegido por sesión de estudiante, origen y CSRF, cubierto con mocks.
- Rechazo explícito del antiguo formato reply y de respuestas vacías.
- `demo:config-check -- --smtp`, revisión de secretos y `git diff --check` correctos.

Las pruebas no modifican MySQL demo ni utilizan SMTP o Gemini reales. No se registraron estudiantes, no se ejecutaron migraciones y no se automatizó el navegador. La revisión automática de permisos caducó en el primer intento de ejecutar los tests HTTP locales; el reintento autorizado terminó correctamente.

## Reinicio y comprobación manual de Naomi

Cerrar con Ctrl+C el Express anterior antes de iniciar otro proceso. En la terminal backend:

```sh
cd '/Users/naomisanchez/Desktop/Integración-SkillSwap/backend'
npm run demo:start -- --smtp
```

En la terminal frontend, reiniciar Vite si estaba abierto:

```sh
cd '/Users/naomisanchez/Desktop/Integración-SkillSwap/frontend'
npm run dev -- --host localhost --port 5173 --strictPort
```

Abrir http://localhost:5173 y utilizar la cuenta existente. Enviar una única consulta académica breve desde el asistente. El resultado esperado es HTTP 200 en POST /api/student/ai/chat con `message.content` y ese mismo texto visible en la conversación. En Express debe aparecer el diagnóstico seguro SUCCESS/200.

Si vuelve a aparecer UPSTREAM/503, el proveedor continúa indisponible; no significa que React esté leyendo mal el contrato corregido. Esperar antes de otra consulta y compartir solo categoría, estado y duración del diagnóstico, sin claves, cookies, CSRF ni archivos .env. No se declara Gemini funcional desde React hasta esta comprobación manual.
