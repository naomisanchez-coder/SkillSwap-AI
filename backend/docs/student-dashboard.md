# Inicio y créditos del estudiante — incremento 1.7

## Alcance confirmado

El Figma Make describe `dashboard` como resumen, progreso, recomendaciones y próxima sesión, y `wallet` como saldos y movimientos académicos. También distingue saldo disponible y retenido. Este incremento conecta únicamente información respaldada por las tablas actuales: identidad académica, onboarding, saldo contable, cantidad de movimientos e historial.

Las recomendaciones, próximas sesiones y saldo retenido se posponen. No existen todavía tablas autorizadas para reservas, sesiones o retenciones; la API no devuelve elementos ficticios ni interpreta texto local del prototipo como datos reales.

## Fuente de verdad

`credit_transactions` es el único libro contable. El saldo actual es `SUM(amount)` para el estudiante autenticado; sin movimientos es cero. La concesión inicial de 20 procede exclusivamente de `INITIAL_EMAIL_VERIFICATION`, protegida por la restricción única creada en 001. Consultar Inicio o Mis créditos nunca crea movimientos.

Saldo e historial paginado se leen en una misma transacción MySQL para conservar una vista coherente. Los movimientos se ordenan por `created_at DESC, id DESC`. El cursor opaco conserva esa frontera; no contiene cookies, credenciales ni identificadores de otro usuario.

## Autorización

Ambos endpoints exigen una sesión válida de una cuenta STUDENT activa y verificada. El propietario procede exclusivamente de la sesión. ADMIN recibe 403 y parámetros como `userId` se rechazan. Son lecturas con `Cache-Control: no-store`, por lo que no requieren CSRF. No existe endpoint para editar saldo, importe, motivo o referencia.

## Contratos

### `GET /api/student/dashboard`

No admite parámetros. Devuelve:

```json
{
  "dashboard": {
    "student": {
      "firstName": "Ada",
      "lastName": "Lovelace",
      "career": "Diseño y Desarrollo de Software",
      "cycle": 3,
      "onboardingComplete": true
    },
    "credits": { "balance": 20 },
    "activity": { "creditTransactions": 1 }
  }
}
```

No incluye por ahora próximas sesiones, recomendaciones ni progreso derivado de mentorías.

### `GET /api/student/credits`

Admite `limit` entre 1 y 50, con valor predeterminado 20, y el `cursor` opaco devuelto por la página anterior. Cualquier otro parámetro se rechaza.

```json
{
  "credits": {
    "balance": 20,
    "totalTransactions": 1,
    "transactions": [
      {
        "id": "00000000-0000-0000-0000-000000000000",
        "amount": 20,
        "reason": "INITIAL_EMAIL_VERIFICATION",
        "reference": "initial-email-verification:...",
        "occurredAt": "2026-11-10T12:34:56.123456Z"
      }
    ],
    "pagination": { "limit": 20, "nextCursor": null }
  }
}
```

`reason` es un código estable de negocio para que React presente una etiqueta localizada. La referencia es informativa y no autoriza operaciones. La ausencia de movimientos devuelve saldo cero, arreglo vacío y cursor nulo.

## Dependencias pendientes

- Próximas sesiones requieren el modelo transaccional de reservas y sesiones.
- Saldo retenido requiere una representación contable aprobada para holds, liberaciones y reembolsos.
- Recomendaciones y progreso por mentorías requieren habilidades aprobadas, ofertas activas, disponibilidad y sesiones reales.
- Mis habilidades y la solicitud de mentor requieren catálogo de habilidades, evidencias y flujo de aprobación; no deben reutilizar intereses libres como habilidades autorizadas.
