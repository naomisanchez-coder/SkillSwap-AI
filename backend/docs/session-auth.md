# Login y sesiones seguras — incremento 1.5

## Configuración privada

`LOGIN_RATE_HMAC_KEY_HEX` y `SESSION_CSRF_KEY_HEX` deben ser claves distintas de 32 bytes, codificadas como 64 caracteres hexadecimales y estables entre reinicios e instancias. También deben ser distintas de las claves OTP. `TRUST_PROXY_HOPS=0` es obligatorio mientras Express sea accesible directamente; no confiar en `X-Forwarded-For` hasta conocer la topología.

Generación local sin imprimir una clave en la terminal:

```bash
umask 077
node -e "const{randomBytes}=require('node:crypto');process.stdout.write(randomBytes(32).toString('hex')+'\n')" > clave-local-temporal
```

Trasladar cada valor por separado al archivo privado autorizado, eliminar de forma segura el temporal y aplicar `chmod 600`. No regenerar claves ya usadas: cambiar la clave de rate-limit altera los identificadores y cambiar CSRF invalida la recuperación de tokens de sesiones existentes.

## Sesiones y cookies

La cookie `skillswap_session` contiene 32 bytes aleatorios codificados en hexadecimal. MySQL conserva solo SHA-256. Usa `HttpOnly`, `Path=/`, `SameSite=Lax` y `Secure` en producción. Sin Recordarme es una cookie de sesión del navegador; con Recordarme tiene `Max-Age=2592000`.

El backend comprueba expiración por inactividad y absoluta en cada recuperación. La actividad renueva solo el límite inactivo. Logout valida `X-CSRF-Token`, revoca la fila en MySQL y elimina la cookie con el mismo alcance.

## Integración React

- Enviar `credentials: 'include'` en login, logout y `/me`.
- Login envía JSON `{email,password,remember}` y `X-CSRF-Protection: 1`.
- Conservar `csrfToken` solo en memoria y enviarlo como `X-CSRF-Token` en mutaciones autenticadas.
- Recuperar usuario y CSRF con `GET /api/auth/me` al recargar.
- Tratar los campos académicos del rol `admin` como `null`.
- No guardar la cookie ni el CSRF en `localStorage`.

Un despliegue verdaderamente cross-site requerirá `SameSite=None` junto con `Secure=true`, HTTPS y orígenes CORS exactos. Esa variante no está habilitada por defecto.
