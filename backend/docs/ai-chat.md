# Chatbot del estudiante — incremento 1.11

## Alcance

`POST /api/student/ai/chat` ofrece orientación breve sobre aprendizaje, habilidades, mentorías y uso de SkillSwap AI. Solo admite una sesión activa y verificada con rol `student`; al ser una mutación exige el origen permitido, la cookie de sesión y `X-CSRF-Token`.

El chatbot es informativo. No reserva sesiones, no modifica perfiles, no mueve créditos y no ejecuta herramientas. Tampoco conserva conversaciones en MySQL. El proveedor recibe únicamente el mensaje, un historial acotado y contexto público del catálogo y de mentores realmente aprobados.

## Contrato HTTP

Solicitud JSON:

```json
{
  "message": "¿Qué habilidad puedo practicar para aprender desarrollo web?",
  "history": [
    { "role": "user", "content": "Quiero empezar desde cero" },
    { "role": "assistant", "content": "Podemos organizar una ruta básica." }
  ]
}
```

- `message` es obligatorio y admite hasta 1000 caracteres Unicode.
- `history` es opcional, admite como máximo 6 mensajes y únicamente roles `user` y `assistant`.
- Cada elemento admite 1000 caracteres y el historial completo, 4000.
- No se acepta el rol `system`, campos adicionales ni caracteres de control.

Respuesta `200`:

```json
{
  "message": { "role": "assistant", "content": "..." },
  "grounding": { "skills": 14, "mentors": 2 },
  "rateLimit": { "remaining": 9, "resetsAt": "2027-01-01T00:00:00.000Z" }
}
```

Los errores mantienen `{ "error": { "code", "message", "fields" } }`. La ausencia de configuración o un error/timeout del proveedor devuelve `503 AI_UNAVAILABLE`; una limitación de cuota del proveedor devuelve `503 AI_PROVIDER_LIMITED`. La limitación local usa el error público `429 RATE_LIMITED`.

## Proveedores y configuración

La lógica del chatbot es independiente del transporte. Se puede seleccionar uno de estos adaptadores HTTPS sin cambiar el endpoint ni las reglas de autorización:

- OpenAI Responses: `POST https://api.openai.com/v1/responses`.
- Google Gemini Developer API: `POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`.

Ningún adaptador habilita herramientas, búsqueda, ejecución de código o acciones sobre SkillSwap AI. Ambos limitan la salida. OpenAI solicita `store:false`; Gemini utiliza exclusivamente los campos admitidos por `GenerateContentRequest` y el backend no persiste la conversación. El modelo no tiene valor implícito: debe aparecer entre los modelos disponibles para el proyecto y configurarse expresamente en `AI_MODEL`.

Variables:

| Variable | Regla |
| --- | --- |
| `AI_ENABLED` | `false` por defecto; debe ser exactamente `true` para habilitar |
| `AI_PROVIDER` | `openai` o `gemini` |
| `AI_API_KEY` | clave privada de OpenAI; nunca usar una variable `VITE_*` |
| `GEMINI_API_KEY` | clave privada de Google AI Studio cuando el proveedor es `gemini` |
| `AI_MODEL` | identificador vigente y disponible en la cuenta |
| `AI_MAX_OUTPUT_TOKENS` | 32–1000; predeterminado 300 |
| `AI_TIMEOUT_MS` | 1000–30000; predeterminado 10000 |
| `AI_RATE_LIMIT_MAX_REQUESTS` | 1–60; predeterminado 10 |
| `AI_RATE_LIMIT_WINDOW_SECONDS` | 10–3600; predeterminado 60 |

El backend carga automáticamente `backend/.env`; las variables que ya existen en el proceso tienen precedencia. Para conservar la clave separada, puede prepararse un archivo privado `backend/.env.ai.local`, aplicar permisos `0600` e iniciar desde `backend/` con:

```sh
node --env-file=.env.ai.local src/server.js
```

El archivo queda cubierto por `.env.*`; se debe comprobar con `git check-ignore -v .env.ai.local` antes de usarlo. No copiar la clave a `.env.example`, React, comandos, logs ni documentación.

Para Gemini, introducir localmente solo `GEMINI_API_KEY` en `.env.ai.local`. Antes de elegir el modelo, listar los modelos realmente accesibles por el proyecto, sin generar contenido:

```sh
node --env-file=.env.ai.local scripts/gemini-models.js
```

El listado se filtra por soporte de `generateContent`, pero no demuestra por sí solo que el modelo sea gratuito. La disponibilidad y el nivel dependen del proyecto y deben contrastarse en la página oficial de precios y cuotas antes de escribir `AI_MODEL`. No se debe activar facturación para esta prueba.

## Datos y seguridad

El contexto real se consulta en cada petición y contiene como máximo 20 habilidades activas y 20 filas de ofertas activas de mentores con solicitud `APPROVED`, usuario activo y correo verificado. Solo se incluyen nombre público, habilidades aprobadas y si existe disponibilidad configurada. No se consultan correos, créditos, certificados, notas administrativas, sesiones ni archivos privados.

Las instrucciones distinguen datos reales de orientación general y prohíben inventar mentores, disponibilidad, calificaciones, créditos, reservas o información institucional. Esta defensa reduce alucinaciones, pero una respuesta generativa no ofrece garantía matemática; React debe presentar el contenido como asistencia y usar los endpoints transaccionales existentes como única fuente de verdad.

El límite local es por estudiante y proceso, con ventana fija y memoria acotada. Es suficiente para el desarrollo en una sola instancia, pero no constituye un límite distribuido ni sobrevive reinicios. Antes de desplegar varias instancias se requiere un mecanismo compartido aprobado; no se añadió persistencia ni DDL en 1.11.

`store:false` evita solicitar almacenamiento del objeto de respuesta en OpenAI, pero no debe interpretarse por sí solo como ausencia absoluta de retención del proveedor. Gemini no admite ese campo en `GenerateContentRequest`. En el nivel gratuito de Gemini, Google indica que el contenido puede utilizarse para mejorar sus productos. Por ello el contexto enviado se limita a la pregunta, historial breve y datos públicos mínimos; no se envían correos, contraseñas, certificados, créditos, reservas ni otros datos privados. Antes de habilitar el servicio públicamente deben revisarse las condiciones vigentes del proveedor, privacidad, ubicación/tratamiento de datos y el aviso al estudiante.

Los diagnósticos internos de Gemini registran únicamente proveedor, modelo, operación, resultado, categoría, estado HTTP y duración. Las categorías diferencian solicitud inválida (`400`), autorización (`401/403`), cuota (`429`), proveedor (`5xx`), timeout, transporte y respuesta inválida. No registran clave, URL autenticada, cookie, token CSRF, prompt ni cuerpo remoto. El contrato HTTP público permanece estable y sanitizado.

## Integración React

1. Recuperar `csrfToken` con `GET /api/auth/me`.
2. Enviar `credentials:'include'`, `Content-Type: application/json` y `X-CSRF-Token`.
3. Mantener como máximo los seis mensajes recientes y no guardar secretos en el navegador.
4. Mostrar `AI_UNAVAILABLE`, `AI_PROVIDER_LIMITED` y `RATE_LIMITED` sin reintentos automáticos agresivos.
5. No interpretar texto del modelo como confirmación de una reserva, saldo o cambio de perfil.

Ejemplo:

```js
await fetch('/api/student/ai/chat', {
  method: 'POST',
  credentials: 'include',
  headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
  body: JSON.stringify({ message, history }),
});
```

Las pruebas automatizadas sustituyen ambos transportes y no llaman a OpenAI ni Gemini. Google AI Studio confirmó para el proyecto local el nivel gratuito y ausencia de cuenta de facturación; el catálogo oficial autenticado confirmó `gemini-3.8-flash` con `generateContent`, y la tabla oficial vigente indica entrada y salida gratuitas para su modalidad estándar. El fallo previo se atribuyó a un campo `store` no admitido por el contrato de Gemini; se eliminó sin cambiar el endpoint público.

Después de rotar la clave local se realizó una única solicitud real adicional, acotada a 128 tokens, sin herramientas ni datos privados, mediante el endpoint autenticado, sesión y CSRF reales sobre `skillswap_ai_test_auth`. El endpoint devolvió `200`, el proveedor registró `SUCCESS/200` en 3.589 segundos y hubo una sola llamada, sin reintentos. Se obtuvo contenido generativo real, aunque quedó truncado por el límite reducido de salida; para la integración local se recomienda conservar el límite configurado de 300 tokens y no reintentar automáticamente respuestas incompletas. La fixture aislada se eliminó al finalizar.

## Override privado del worktree para la sustentación

El lanzador integrado admite `backend/.env.ai.override.local`, opcional, ignorado por Git y con permisos 0600. Solo acepta `AI_MODEL` y `AI_TIMEOUT_MS`: no permite sustituir credenciales, SMTP, conexión MySQL ni ampliar el límite de salida. Si falta, conserva la configuración privada de origen. El modelo anterior y la clave permanecen en ese archivo de origen, sin copiarse ni modificarse.

La selección local se verificó mediante una consulta autenticada de la ficha del modelo: HTTP 200, soporte de generateContent y capacidad de salida suficiente. Esto confirma que el modelo es visible para la clave; el catálogo no informa del nivel de facturación ni de la cuota remanente. La entrada y salida gratuitas se contrastaron con los [precios oficiales del modelo ligero](https://aistudio.google.com/docs/pricing#gemini-3.5-flash-lite). La [documentación oficial de razonamiento](https://aistudio.google.com/docs/thinking?generate-content=true) indica razonamiento mínimo por defecto para ese modelo: no se añaden thinkingBudget ni otros parámetros que puedan ser incompatibles. Se conservan 300 tokens de salida y timeout de 30 segundos, dentro de los 35 segundos de espera del cliente.

Validaciones de esta preparación: 220 pruebas backend aprobadas, 3 omitidas; 98 frontend aprobadas; build, TypeScript, ESLint y git diff --check correctos. Los mocks cubren la selección privada sin cambiar clave/SMTP, parámetros compatibles, respuesta en español, 503, timeout, cuota y el contrato message.content. No se hicieron solicitudes generativas reales ni cambios persistentes en MySQL.

Cerrar primero el Express anterior con Ctrl+C y ejecutar desde backend:

```sh
npm run demo:start -- --smtp
```

Naomi realizará UNA consulta manual desde http://localhost:5173 con la cuenta existente. La aplicación está preparada; una respuesta generativa real y la disponibilidad de cuota no se declaran verificadas hasta esa prueba. No ejecutar reintentos automáticos ni versionar el override privado.
