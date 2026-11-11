# Diagnóstico actual de Gemini y proceso activo

11 de noviembre de 2026. HEAD inspeccionado inicialmente: ffa68b1275558aa258d943440c8fc0d2376ae77b, develop limpio y sincronizado. No se hicieron consultas generativas, reintentos, cambios de modelo, modificaciones de archivos privados ni operaciones sobre MySQL.

## Evidencia del intento actual

Naomi proporcionó el último diagnóstico del fallo actual: proveedor Gemini, operación generateContent, categoría **UPSTREAM**, estado remoto **503**, duración **3084 ms**. Este dato es del intento actual, no una reutilización del diagnóstico anterior. Indica indisponibilidad remota; no identifica por sí solo si Google sufrió saturación u otra incidencia interna. No hay evidencia de 400, 401/403, 429, timeout ni bloqueo de contenido en ese intento.

La respuesta del proveedor demuestra que el adaptador se inicializó y ejecutó. Un rechazo de sesión/CSRF impediría llegar al adaptador. No se solicitó ni se expuso el cuerpo de error remoto.

Procesos encontrados:

| Puerto | PID | Directorio | Comando comprobado sin imprimir argumentos |
| --- | --- | --- | --- |
| 4000 | 39486 | Worktree / backend | start-integrated-demo.js con --smtp |
| 5173 | 39832 | Worktree / frontend | Vite |

Express inició a las 09:20:37; Vite, a las 09:21:35. El commit inicial inspeccionado es de las 09:36:36. El servidor Express no se reinició tras ese cambio y no puede darse por verificado que tenga cargado el código actual. No se leyó el entorno privado ni la memoria del proceso ni se detuvo ninguno de los dos procesos.

La configuración **en disco**, calculada con el lanzador vigente, tiene IA habilitada, proveedor Gemini, modelo y credencial presentes, límite de 300 tokens y SMTP habilitado. React está configurado para localhost:4000/api. Estas comprobaciones no demuestran por sí solas la vigencia de la credencial ante Google ni el entorno exacto del proceso antiguo. Los archivos privados se conservaron intactos.

## Revisión oficial de compatibilidad

- Se conserva POST `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`, autenticación por x-goog-api-key y estructura systemInstruction / contents / generationConfig. No se añade store, herramientas ni parámetros no documentados. [Referencia GenerateContent](https://ai.google.dev/api/generate-content).
- El modelo configurado sigue siendo Gemini 3.8 Flash. La documentación admite razonamiento low/medium/high; minimal no está soportado. No se introduce un nivel por intuición, ni se cambia el modelo o el presupuesto para intentar ocultar un 503. [Modelo](https://aistudio.google.com/docs/models/gemini-3.8-flash), [razonamiento](https://aistudio.google.com/docs/thinking?generate-content=true).
- El presupuesto incluye razonamiento y salida. Un límite bajo puede producir MAX_TOKENS con poco texto o ninguno. Es un riesgo de truncamiento que ahora queda visible en los metadatos; **no es la causa demostrada del 503 actual**.
- promptFeedback y finishReason permiten distinguir bloqueos, límites y terminación normal. Las partes marcadas thought no son el texto destinado al usuario. Se prueban estas formas sin registrar su contenido.
- La guía oficial diferencia cuotas y errores transitorios. Este proyecto conserva cero reintentos automáticos, conforme a la instrucción de Naomi. [Resolución de errores](https://aistudio.google.com/docs/troubleshooting).

## Cambios limitados al diagnóstico y adaptador

1. Arranque: evento ai_runtime con PID, fecha, revisión y huella del código del chatbot, además de indicadores booleanos de configuración. Se registra tras abrir el servidor.
2. Diagnóstico local: `backend/.ai-diagnostic.log` guarda el arranque y el último evento permitido, con permisos 0600 e ignorado por Git. No contiene claves, cookies, CSRF, prompts, texto generado ni cuerpos externos. Los valores enumerados desconocidos se sustituyen por UNKNOWN; no se vuelcan objetos arbitrarios.
3. `node scripts/ai-status.js` compara el código/revisión actual con el arranque registrado y muestra el último código remoto/categoría. No abre MySQL ni solicita contenido al proveedor. Antes del primer reinicio con esta versión informa que no existe registro.
4. Timeout: se encontró que antes solo cubría la llegada de cabeceras; ahora abarca la lectura y análisis del cuerpo. Si las cabeceras ya llegaron, conserva su estado remoto incluso al registrar un timeout posterior.
5. Candidatos: analiza el primer candidato, excluye partes thought y rechaza respuestas bloqueadas aunque contengan texto parcial. No concatena alternativas distintas. MAX_TOKENS con texto visible devuelve únicamente ese texto real y registra truncamiento; sin texto visible mantiene error seguro. No se inventa una respuesta de reemplazo.
6. Se agregan metadatos permitidos: cantidad de candidatos, finishReason, blockReason y conteos de tokens de razonamiento/salida. JSON inválido, ausencia de candidatos, bloqueo y timeout ya no requieren compartir respuestas privadas para investigarlos.

No se modificó el frontend, el contrato message.content, otros módulos del estudiante, el modelo, la configuración de razonamiento ni los parámetros enviados a Google. Estas correcciones no prometen resolver una indisponibilidad remota.

## Verificaciones

- 217 pruebas backend aprobadas, 3 omitidas, 0 fallidas.
- 98 pruebas frontend aprobadas, 0 fallidas; conserva regresión del contrato message.content con el controlador real y transporte mock.
- Build React/TypeScript, ESLint y git diff --check correctos.
- Transporte simulado para 400, 401, 403, 429, 500, 503, timeout antes/después de cabeceras, JSON inválido, bloqueo, truncamiento, ausencia de texto y éxito realista.
- No se registraron estudiantes ni se invocó Gemini, SMTP o MySQL. No se automatizó el navegador. Las pruebas HTTP usan mocks y puertos efímeros locales.

## Próximo paso manual

En la terminal donde está el PID 39486, detener **ese Express** con Ctrl+C. No iniciar otro mientras el puerto 4000 siga ocupado. Luego:

```sh
cd '/Users/naomisanchez/Desktop/Integración-SkillSwap/backend'
npm run demo:start -- --smtp
```

Debe aparecer ai_runtime con la nueva revisión y PID. En otra terminal se puede consultar, sin enviar ninguna petición al proveedor:

```sh
cd '/Users/naomisanchez/Desktop/Integración-SkillSwap/backend'
node scripts/ai-status.js
```

Comprobar processAlive y currentCodeMatchesStartup en true; después del reinicio contra HEAD, currentRevisionMatchesStartup también debe ser true. Al principio lastDiagnostic será null. No compartir el contenido de archivos .env ni procesos completos.

Abrir http://localhost:5173. Vite puede recargar el frontend existente; no hay un cambio visual que comprobar. Naomi puede enviar una consulta breve una sola vez, cuando decida repetir su prueba. Si responde 200, comprobar texto visible y SUCCESS. Si vuelve a fallar, ejecutar ai-status y compartir solo su diagnóstico sanitizado.

## Alternativa gratuita, sin cambio automático

La tabla oficial de precios, consultada hoy, muestra entrada y salida gratuitas en la modalidad estándar gratuita de **gemini-3.5-flash-lite**, sujetas a sus límites. [Precios oficiales](https://aistudio.google.com/docs/pricing#gemini-3.5-flash-lite). La disponibilidad para esta credencial y su cuota no se verificaron mediante llamadas autenticadas.

Primero reiniciar el proceso antiguo. Si Gemini 3.8 Flash sigue devolviendo 503 y Naomi decide cambiar de modelo, esta es una alternativa documentada que debe confirmarse para su proyecto. No se cambió AI_MODEL, no se generaron claves y no se habilitó facturación. No se declara el chatbot operativo hasta una respuesta real comprobada por Naomi.
