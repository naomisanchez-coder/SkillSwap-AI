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

## Proveedor y configuración

El adaptador usa por HTTPS la API oficial Responses de OpenAI: `POST https://api.openai.com/v1/responses`. El modelo no tiene un valor implícito: debe seleccionarse expresamente en la cuenta del proyecto y configurarse en `AI_MODEL`. La petición limita la salida y envía `store:false`.

Variables:

| Variable | Regla |
| --- | --- |
| `AI_ENABLED` | `false` por defecto; debe ser exactamente `true` para habilitar |
| `AI_PROVIDER` | `openai` |
| `AI_API_KEY` | clave privada del proyecto; nunca usar una variable `VITE_*` |
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

## Datos y seguridad

El contexto real se consulta en cada petición y contiene como máximo 20 habilidades activas y 20 filas de ofertas activas de mentores con solicitud `APPROVED`, usuario activo y correo verificado. Solo se incluyen nombre público, habilidades aprobadas y si existe disponibilidad configurada. No se consultan correos, créditos, certificados, notas administrativas, sesiones ni archivos privados.

Las instrucciones distinguen datos reales de orientación general y prohíben inventar mentores, disponibilidad, calificaciones, créditos, reservas o información institucional. Esta defensa reduce alucinaciones, pero una respuesta generativa no ofrece garantía matemática; React debe presentar el contenido como asistencia y usar los endpoints transaccionales existentes como única fuente de verdad.

El límite local es por estudiante y proceso, con ventana fija y memoria acotada. Es suficiente para el desarrollo en una sola instancia, pero no constituye un límite distribuido ni sobrevive reinicios. Antes de desplegar varias instancias se requiere un mecanismo compartido aprobado; no se añadió persistencia ni DDL en 1.11.

`store:false` evita solicitar almacenamiento del objeto de respuesta, pero no debe interpretarse por sí solo como ausencia absoluta de retención del proveedor. Antes de habilitar el servicio públicamente deben revisarse las condiciones vigentes del proveedor, privacidad, ubicación/tratamiento de datos y el aviso al estudiante. No enviar datos sensibles en el chat.

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

Las pruebas automatizadas sustituyen el transporte y no llaman a OpenAI. Una prueba real requiere autorización separada, clave/configuración válida y un presupuesto acotado.
