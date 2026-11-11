# Entrega del backend estudiantil para integración con React

## Estado de la entrega

El backend estudiantil está implementado y cubierto por pruebas automatizadas y validaciones reales sobre MySQL aislado. La base local `skillswap_ai_demo` conserva migraciones 001–008, catálogos y tres mentores ficticios aprobados para la sustentación. Esto no significa que las pantallas React estén integradas o validadas visualmente: esa comprobación debe realizarse posteriormente en `develop`.

Funcionalidades disponibles:

- registro institucional, envío y verificación OTP, activación y concesión única de 20 créditos;
- login, sesiones persistentes, `/me`, logout, CSRF y límites de intentos;
- recuperación de contraseña con revocación de sesiones;
- perfil, onboarding, fotografía, intereses y habilidades del estudiante;
- solicitud de mentor con documentos privados y aprobación administrativa mínima;
- dashboard, libro de créditos y saldos total, retenido y disponible;
- Explorar, detalle público de mentores y recomendaciones deterministas;
- disponibilidad, reservas, sesiones, cancelación, reembolso y valoraciones;
- chatbot informativo con adaptadores sustituibles para Gemini y OpenAI.

El ranking puede devolver `PARTIAL` cuando falte evidencia de nivel, disponibilidad o calidad. Los mentores demo tienen habilidades, nivel y disponibilidad, pero no se inventaron valoraciones: mientras no existan sesiones completadas y revisadas, el componente de calidad permanece sin evidencia.

## Arranque local con demo y Gemini

Desde `backend/`, los archivos privados deben estar ignorados, no versionados y con modo `0600`:

- `.env.demo.local`: conexión de aplicación a `skillswap_ai_demo`, claves de sesión/CSRF/recuperación y `CORS_ORIGIN`;
- `.env.ai.local`: proveedor, modelo, clave API y límites del chatbot;
- `.env.smtp.local`: SMTP y claves OTP, solo cuando se autorice una prueba real de correo.

Arranque sin habilitar SMTP:

```sh
node --env-file=.env.ai.local --env-file=.env.demo.local src/server.js
```

Las variables ya cargadas por Node tienen precedencia sobre `backend/.env`; por ello la conexión demo y Gemini no son sustituidas cuando `src/config/env.js` carga la configuración base. No incluir secretos en comandos, React, capturas o variables `VITE_*`.

Antes de volver a usar Gemini debe existir una clave vigente no expuesta. El proyecto verificado en Google AI Studio figura en nivel gratuito y sin cuenta de facturación; el modelo configurado debe continuar apareciendo en el catálogo del proyecto con soporte para `generateContent`. No habilitar herramientas, búsqueda ni facturación.

## Sesión, cookies, CORS y CSRF

- Cookie: `skillswap_session`, `HttpOnly`, `Path=/`, `SameSite=Lax`; `Secure=true` bajo HTTPS.
- React debe usar `credentials: 'include'` en todas las solicitudes autenticadas.
- Login: `POST /api/auth/login` con `X-CSRF-Protection: 1`.
- Estado de sesión: `GET /api/auth/me`; su respuesta entrega el `csrfToken` que React conserva solo en memoria.
- Mutaciones autenticadas: enviar `X-CSRF-Token` con el valor de `/me`.
- Recuperación pública y login también requieren `X-CSRF-Protection: 1` para impedir formularios cross-site simples.
- `CORS_ORIGIN` debe contener los orígenes locales exactos, por ejemplo `http://localhost:5173`; no se permite `*` con credenciales.
- Si en despliegue React y API fueran verdaderamente cross-site, se requerirían HTTPS, `SameSite=None` y `Secure=true`; esa variante no está habilitada por defecto.

## Endpoints que React debe integrar

Autenticación:

- `POST /api/auth/register`
- `POST /api/auth/email/send-code`
- `POST /api/auth/email/verify`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/auth/logout`
- `POST /api/auth/password-recovery/request`
- `POST /api/auth/password-recovery/reset`

Estudiante:

- `GET|PATCH /api/student/profile`
- `GET|PUT /api/student/onboarding`
- `GET /api/student/catalog`
- `GET /api/student/dashboard`
- `GET /api/student/credits`
- `GET /api/student/skills/catalog`
- `GET /api/student/skills`
- `PUT /api/student/skills/:skillId`
- `GET /api/student/mentor-application/requirements`
- `GET|POST /api/student/mentor-applications`
- `PUT /api/student/mentor-applications/:applicationId/certificate`
- `POST /api/student/mentor-applications/:applicationId/resubmit`
- `GET /api/student/mentor-applications/:applicationId/documents/:type`
- `GET|PUT|DELETE /api/student/profile/photo`
- `GET /api/student/explore/skills`
- `GET /api/student/explore/mentors`
- `GET /api/student/explore/mentors/:mentorId`
- `GET /api/student/recommendations`
- `GET /api/student/explore/mentors/:mentorId/availability`
- `POST /api/student/bookings`
- `GET /api/student/sessions`
- `GET /api/student/sessions/:sessionId`
- `POST /api/student/sessions/:sessionId/cancel`
- `POST /api/student/sessions/:sessionId/validate`
- `POST /api/student/sessions/:sessionId/reviews`
- `GET /api/student/session-credits`
- `POST /api/student/ai/chat`

Las rutas de oferta, agenda e inicio/finalización de sesiones ya son servicios backend del rol mentor, pero sus pantallas pertenecen a la segunda etapa. Las rutas `/api/admin/mentor-applications` y asignación de nivel son operaciones administrativas mínimas reutilizables; no constituyen un panel ADMIN completo.

## Contratos que deben contrastarse con React

1. Usar los nombres JSON documentados; no adaptar silenciosamente `career`, `cycle`, `skillId`, `mentorId`, `sessionId`, `verificationId`, `remember` ni los campos de consentimiento.
2. Tratar identificadores como cadenas opacas y fechas como ISO-8601 UTC; la presentación local corresponde a la UI.
3. No calcular en el navegador costos, estados, saldo, retenciones, reembolsos ni permisos. El backend es la fuente de verdad.
4. Presentar los códigos de error de `{error:{code,message,fields}}`; `fields` solo aparece en validaciones.
5. No exponer certificados, rutas privadas, correos, notas administrativas ni claves en vistas públicas.
6. Mostrar las recomendaciones como parciales cuando `status` o la cobertura de evidencia lo indiquen.
7. El chatbot orienta, pero no confirma reservas, créditos o cambios de perfil.

## Plan manual de integración

1. Verificar `/api/health` y `/api/health/db` con la configuración demo.
2. Registrar un estudiante institucional real desde React, solicitar un único OTP autorizado y completar la verificación.
3. Confirmar activación, concesión única de 20 créditos y login con cookie HttpOnly.
4. Recargar la aplicación y recuperar usuario/CSRF mediante `/api/auth/me`.
5. Completar perfil y onboarding; subir una fotografía y declarar intereses/habilidades.
6. Recorrer Explorar y Para ti, comprobando que los tres mentores demo proceden de MySQL y que la calidad faltante se muestra como parcial.
7. Reservar una sesión, comprobar la retención, cancelar antes del inicio y verificar el reembolso único.
8. Consultar dashboard, sesiones y movimientos de créditos antes y después de las operaciones.
9. Ejecutar una conversación académica breve con el chatbot, sin datos privados, y comprobar errores de cuota/indisponibilidad sin reintentos automáticos.
10. Probar logout y confirmar que la sesión revocada ya no permite `/me`.

La integración debe detenerse ante discrepancias de campos o flujos y corregir el contrato conscientemente; no debe modificar el diseño aprobado ni sustituir datos reales por mocks del frontend.
