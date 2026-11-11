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

Ningún adaptador habilita herramientas, búsqueda, ejecución de código o acciones sobre SkillSwap AI. Ambos limitan la salida y solicitan `store:false`. El modelo no tiene valor implícito: debe aparecer entre los modelos disponibles para el proyecto y configurarse expresamente en `AI_MODEL`.

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

`store:false` evita solicitar almacenamiento del objeto de respuesta, pero no debe interpretarse por sí solo como ausencia absoluta de retención del proveedor. En el nivel gratuito de Gemini, Google indica que el contenido puede utilizarse para mejorar sus productos. Por ello el contexto enviado se limita a la pregunta, historial breve y datos públicos mínimos; no se envían correos, contraseñas, certificados, créditos, reservas ni otros datos privados. Antes de habilitar el servicio públicamente deben revisarse las condiciones vigentes del proveedor, privacidad, ubicación/tratamiento de datos y el aviso al estudiante.

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

Las pruebas automatizadas sustituyen ambos transportes y no llaman a OpenAI ni Gemini. Google AI Studio confirmó para el proyecto local el nivel gratuito y ausencia de cuenta de facturación; el catálogo oficial autenticado confirmó `gemini-3.8-flash` con `generateContent`. Tras rotar la clave local se realizó una única solicitud real, acotada, sin herramientas ni datos privados, mediante sesión y CSRF reales sobre el esquema demo. El proveedor terminó en el contrato sanitizado `503 AI_UNAVAILABLE` y no se reintentó; no se obtuvo contenido generativo. Antes de integrar el chatbot como operativo debe diagnosticarse el estado HTTP remoto de forma segura y autorizar una nueva llamada controlada. Las pruebas simuladas continúan cubriendo cuota, timeout, respuesta inválida y errores de transporte sin exponer trazas del proveedor al cliente.
