# Propuesta 002: seguridad de emisión OTP

**Aplicada y validada en skillswap_ai_test_auth y en skillswap_ai el 2026-11-10. Transporte SMTP real pendiente de configurar y comprobar; 1.4B no implementada.**

## Alcance e impacto

`002_otp_delivery_safety.sql` conserva íntegra la 001 y prepara dos cambios:

1. CREATE TABLE otp_request_limits: email_hmac VARBINARY(32) como PK, cinco DATETIME(6) anulables y fechas técnicas. CHECK exige longitud HMAC y secuencia contigua/ordenada. No contiene correo en claro, IP, código OTP ni clave. No tiene FK a users: incluye solicitudes de cuentas inexistentes.
2. Un único ALTER TABLE email_verifications sustituye el CHECK de estados para admitir SENDING y cambia el default a SENDING. No borra columnas, filas, tablas, cuentas ni créditos. Solo afecta al estado inicial de inserciones futuras; las filas previas no se modifican.

El último INSERT es el registro técnico independiente de schema_migrations. Al aplicar ambas versiones habría nueve tablas y dos entradas de historial. No es una única transacción DDL: CREATE y ALTER tienen commits implícitos. Si falla ALTER, puede quedar la tabla nueva con solo 001 en historial. El ejecutor se detiene, libera el bloqueo y rechaza la reanudación automática de ese esquema parcial; requiere inspección humana. No hay DROP TABLE, reconstrucción ni limpieza automática. Si falla el postcheck después del INSERT técnico, puede existir el registro 002 sin validación satisfactoria: no se interpreta como éxito ni se borra/repite automáticamente el historial.

Antes de una futura aplicación, detener el endpoint/emisores antiguos y revisar que no queden desafíos recientes (última hora, cualquiera sea su estado) ni PENDING vigentes de la implementación anterior. El preflight bloquea 002 si los detecta: no los revoca ni modifica silenciosamente. Mantener SMTP deshabilitado hasta validar la migración y el flujo nuevo. Si hubo admisiones en el servicio antiguo, establecer una hora de quietud antes del corte: sus solicitudes de correos inexistentes nunca se persistieron y no pueden reconstruirse desde MySQL. Esa condición operativa requiere revisión, no la puede demostrar el historial de desafíos. Si el servicio nunca estuvo habilitado y solo respondió 503, no hubo esas admisiones. No se inventó un backfill con información inexistente.

## Política aprobada y límites

Seis dígitos criptográficos; 600 segundos de vigencia; cinco intentos por desafío (consumo pendiente de 1.4B); 60 segundos entre solicitudes admitidas; hasta cinco solicitudes admitidas por correo en ventana móvil de 3600 segundos. Las solicitudes rechazadas con 429/503 no generan un nuevo desafío; una admisión confirmada puede consumir cupo aunque luego falle el transporte o se pierda la tarea por reinicio. Los reintentos no garantizan entrega ni recuperan cupo.

La admisión ocurre antes de consultar existencia/elegibilidad del usuario, tanto para cuentas existentes como inexistentes. Una transacción inserta/bloquea la fila por HMAC, toma hora UTC de MySQL, conserva únicamente los últimos cinco horarios de la ventana, calcula Retry-After y actualiza la fila si admite la solicitud. Una inserción concurrente del mismo HMAC queda serializada por la PK y el lock de fila. El estado no depende del proceso HTTP ni de sus reinicios.

`OTP_RATE_HMAC_KEY_HEX` es una clave privada independiente y estable de 32 bytes; el HMAC usa contexto exclusivo y correo normalizado. Todas las instancias deben compartirla. No cambiarla al reiniciar ni al rotar la clave de desafíos: una rotación sin procedimiento podría reiniciar los identificadores y el límite. Su rotación y la retención/limpieza de filas inactivas requieren un procedimiento acordado antes del uso público; no se inventaron plazos ni se ejecutó mantenimiento. HMAC es seudonimización, no anonimización.

Se conservan controles HTTP por IP/origen y una cola acotada, sin persistir IP. Los límites HTTP son complementarios y por proceso; la fuente de verdad del cupo por correo es MySQL. El control persistente no vuelve durable la cola: un reinicio puede perder una tarea aceptada, pero conserva el cupo ya consumido. No se añadió outbox en esta propuesta.

## Estados y orden de operaciones

- Emisión: bloqueo de usuario, revocación de SENDING/PENDING anteriores, inserción nueva SENDING, commit y liberación de conexión.
- SMTP: fuera de la transacción. Su aceptación no acredita recepción en el buzón.
- Confirmación: nueva transacción, bloqueo usuario → desafío, comprobación de elegibilidad y UPDATE condicionado a status=SENDING y expires_at > UTC_TIMESTAMP(6); solo entonces pasa a PENDING.
- Error SMTP/actualización: intentar REVOKED. Si también falla la compensación, SENDING permanece no verificable. No se restaura el código previo.
- Reenvío: revoca SENDING y PENDING anteriores. Una confirmación tardía no puede revivir una fila revocada.
- Vencimiento: se comprueba por timestamp, no solo por la etiqueta del estado. El flujo puede marcar EXPIRED al sustituir una fila vencida.

No se implementa el endpoint de verificación: continúa devolviendo 404. La futura 1.4B deberá exigir PENDING, fecha vigente, intentos disponibles y código correcto bajo bloqueo, antes de CONSUMED/verificar usuario/conceder créditos. SENDING, REVOKED, EXPIRED, EXHAUSTED y CONSUMED quedan excluidos por ese contrato. El CHECK define estados permitidos, no un trigger que impida toda actualización SQL directa. No se afirma que 1.4B esté implementada.

Si se pierde el acuse de COMMIT tras la aceptación SMTP, el resultado de la transacción puede ser incierto. No se reintenta automáticamente: la fila solo puede ser verificable si el UPDATE PENDING llegó a confirmarse en MySQL. Si no se confirmó, conserva SENDING/REVOKED. Nunca se considera suficiente el resultado del proveedor por sí solo.

## Ejecutor y permisos propuestos

El comportamiento predeterminado sigue limitado a 001 por compatibilidad y para no ampliar una autorización anterior. Para inspeccionar/gestionar hasta 002 se debe seleccionar expresamente `--through=002_otp_delivery_safety`. Procesa 001→002, valida el prefijo de historial y checksum de cada archivo, omite versiones ya aplicadas, bloquea objetos inesperados, checks deshabilitados, defaults/estados incompatibles y fallos parciales.

Una futura inspección (no ejecutada en esta intervención) usaría el archivo privado existente sin mostrarlo:

```sh
node --env-file=.env.migrations.local database/migrate.js --check --through=002_otp_delivery_safety
```

Aplicar requiere --apply y MIGRATION_ALLOW_DDL=yes. Sobre skillswap_ai también requiere MIGRATION_VALIDATED_CHECKSUMS como objeto JSON versión→SHA-256 con ambos checksums previamente validados en el esquema aislado; el checksum único anterior solo sirve para 001. Es una declaración del operador, no prueba automática de que se ejecutaron los tests. Después de 002, usar siempre la selección explícita hasta 002; una invocación limitada a 001 rechaza un historial más nuevo, sin intentar retrocederlo.

No se amplían los privilegios de skillswap_app ni skillswap_test_app. La cuenta de migraciones conservaría SELECT, INSERT, CREATE y REFERENCES exactos de esquema; la preparación propone añadir **solo ALTER sobre la tabla email_verifications del esquema destino**, no ALTER global ni de todo el esquema. El parser acepta esa concesión literal solo al seleccionar 002; no acepta privilegios más amplios como sustituto. UPDATE sigue permitido únicamente en el esquema aislado para su suite histórica. No se ejecutaron GRANT ni cambios de cuentas.

Los nombres de esquema en concesiones de tabla son literales; los escapes de patrones se aplican a concesiones de nivel esquema según partial_revokes. La comprobación conserva el tratamiento estricto de ambos modos y rechaza roles, comodines, GRANT OPTION y ámbitos desconocidos.

Fuentes oficiales: [ALTER TABLE MySQL 8.4](https://dev.mysql.com/doc/refman/8.4/en/alter-table.html) y [GRANT MySQL 8.4](https://dev.mysql.com/doc/refman/8.4/en/grant.html). La sintaxis y los permisos efectivos fueron validados realmente en MySQL 8.4.13, primero en pruebas y después en la principal con autorización expresa.

## Pruebas disponibles y alcance

Los tests unitarios usan dobles de conexión y un modelo SQL en memoria: concurrencia, recreación de servicios, correo inexistente, ventana móvil, fallos de transporte/confirmación/revocación, respuesta SMTP tardía y rollback. Esos modelos por sí solos no prueban aislamiento ni sintaxis DDL.

La suite MySQL OTP requiere DATABASE_TEST_* y OTP_TEST_SCHEMA_002=yes; comprueba primero el historial 002 y usa únicamente skillswap_test_app/skillswap_ai_test_auth, sin DDL. Se ejecutó tras aplicar y validar 002 en pruebas. La suite histórica MIGRATION_TEST_* permanece deshabilitada en la validación de negocio porque usa migrator para fixtures. No se usan credenciales principales ni administrativas para estas pruebas DML.

Los resultados reales de metadatos, CHECK, concurrencia entre pools, persistencia entre procesos, ventanas y fallos controlados de COMMIT se detallan abajo. No se afirma cobertura de todas las pérdidas de red ni recepción SMTP real. El proveedor y la prueba de buzón siguen pendientes; 1.4B no está implementada.

## Resultado real de validación aislada — 2026-11-10

Identidad de migración: skillswap_migrator@127.0.0.1, MySQL 8.4.13, partial_revokes=OFF y roles NONE. Concesiones directas verificadas: USAGE global, privilegios mínimos existentes de esquema y ALTER únicamente sobre skillswap_ai_test_auth.email_verifications. No se otorgaron permisos ni se usó root. El historial inicial contenía solo 001 y no había desafíos recientes/activos ni datos de negocio en pruebas.

El preflight detectó inicialmente el formato MySQL de CHECK_CLAUSE con prefijos de charset y comillas escapadas. Se corrigió el comparador con coincidencia completa del IN esperado y tests de rechazo de predicados adicionales. El DDL 002 completó CREATE, ALTER e INSERT de historial; el primer postcheck falló porque el parser de columnas no admitía dígitos en request_1_at...request_5_at. Se detuvo toda ejecución y se inspeccionó el estado sin DDL: nueve tablas, historial 001/002 completo y default SENDING. Se corrigió el lector y su doble de pruebas, añadiendo comprobación explícita de las ocho columnas y rechazo si falta cualquier timestamp. Ningún objeto se borró/reconstruyó y no se modificaron los archivos SQL. La inspección posterior pasó. La segunda ejecución --apply resultó en applied=false, sin repetir ninguna migración.

Checksums registrados:

- 001_auth_foundation: a544084c180a8c8ce701bd506bc98819d4e433b61460b1b20b7dbe4f0e1061c8. La fila original completa, incluida su fecha, permanece idéntica.
- 002_otp_delivery_safety: bd3cdf30528264baad434993caf1c0334a64bb6ca4d71bcc6518cc3b7d974c8e. El comentario histórico del SQL que indica preparación se conserva para no cambiar los bytes aplicados.

Suite final: 97 pruebas, 96 aprobadas, ninguna fallida y una integración histórica omitida deliberadamente porque inserta fixtures con la cuenta migrator. Las integraciones de escritura habilitadas usaron exclusivamente skillswap_test_app sobre el esquema aislado. Comando de validación: OTP_TEST_SCHEMA_002=yes node scripts/verify-local.js --test-concurrency=1. Se serializan archivos para evitar interferencia entre fixtures; la concurrencia real se ejecuta dentro de los casos con pools independientes.

Pruebas reales adicionales: identificadores de conexión distintos, ocho admisiones concurrentes con una sola permitida, cupo persistido observado desde procesos nuevos, bloqueo de 60 segundos, cinco admisiones por hora móvil y eliminación del timestamp que sale de la ventana. Para probar límites largos se modificaron únicamente fechas de fixtures propios; no se esperó una hora de reloj. Los CHECK de longitud HMAC y orden/continuidad rechazaron DML inválido en MySQL.

Se probaron transacciones MySQL reales con SMTP sustituido y fallos controlados: rechazo del transporte, error real de CHECK al confirmar/revocar, excepción inyectada antes del COMMIT (rollback real) y acuse perdido simulado después de un COMMIT nativo exitoso. En los fallos previos a confirmar quedó SENDING si también falló la compensación. En el último caso puede quedar PENDING porque MySQL sí confirmó realmente; se comprobó ese estado y no se reintentó. No se provocó una caída del servidor ni se afirma haber cubierto todas las pérdidas de red.

La cuenta siguió pendiente, sin activación, créditos o sesiones. La verificación 1.4B continúa ausente; no se declara probado un endpoint que no existe. Todos los fixtures se eliminaron por identificadores propios: las ocho tablas de negocio de pruebas quedaron vacías y schema_migrations conserva dos filas.

La principal se inspeccionó solo en lectura: huellas de todos los datos y SHOW CREATE TABLE idénticas antes/después; conserva ocho tablas, 14 carreras, 84 asociaciones y solo 001 en historial. No se aplicó 002 en la principal. Al cerrar la fase aislada, aún faltaban revisión y autorización principal; esa aplicación se documenta en la sección siguiente. Las claves privadas y proveedor/remitente/destinatario SMTP autorizados siguen pendientes. No hubo entrega real de correo.

## Aplicación controlada principal — 2026-11-10

Después de autorización expresa, se verificó skillswap_migrator@127.0.0.1 en skillswap_ai (MySQL 8.4.13, partial_revokes=OFF, roles NONE), con ALTER exclusivamente sobre email_verifications y sin privilegios globales operativos. El historial inicial contenía solo 001; no había desafíos recientes ni activos. Ambos checksums coincidían con los validados en pruebas. El preflight sin DDL confirmó 001 aplicada y 002 pendiente.

Se aplicó únicamente 002 mediante el ejecutor y MIGRATION_ALLOW_DDL=yes, selección explícita hasta 002 y MIGRATION_VALIDATED_CHECKSUMS con ambos valores aprobados en memoria. No se sobrescribió ningún archivo privado. La aplicación y postcheck finalizaron correctamente. La segunda ejecución devolvió applied=false y omitió ambas migraciones. No se modificó el SQL aplicado ni se realizó recuperación destructiva.

La principal tiene nueve tablas y dos registros de historial, conservando íntegra la fila original de 001. Se comprobaron default SENDING, PK de otp_request_limits y ocho CHECK habilitados entre las tablas de emisión/control. Las huellas de datos preexistentes y del DDL ajeno a email_verifications permanecen idénticas. Se conservaron 14 carreras y 84 asociaciones; users, student_profiles, email_verifications, otp_request_limits, auth_sessions y credit_transactions quedaron vacías, sin cuentas/códigos/créditos demo. Ninguna prueba de negocio escribió en la principal.

Regresiones repetidas con OTP_TEST_SCHEMA_002=yes y skillswap_test_app exclusivamente sobre skillswap_ai_test_auth: 96 aprobadas, 0 fallidas, 1 integración histórica omitida porque usa migrator para fixtures. Todos los fixtures propios se limpiaron. La cuenta skillswap_app conectó correctamente a la principal y ambos endpoints de salud respondieron HTTP 200 mediante curl. npm audit informó cero vulnerabilidades; 79 paquetes con firmas verificadas.

Los cambios de esquema, admisión persistente, política fija y transiciones SENDING/PENDING forman una unidad funcional acoplada. Se publican juntos para evitar una versión intermedia sin el repositorio o la confirmación compatibles. El adaptador SMTP ya existía; no se crea un commit artificial que repita su implementación.

Pendiente para demostrar recepción real: proveedor SMTP y remitente autorizados, configuración privada SMTP y de las dos claves HMAC independientes, destinatario institucional controlado y comprobación efectiva en el buzón. No se enviaron mensajes reales. La cola sigue en memoria; 202 no acredita entrega y las limitaciones de retención/rotación/operación pública descritas arriba siguen vigentes.
