# Correcciones tras las pruebas manuales

11 de noviembre de 2026. Trabajo realizado únicamente sobre `develop` en el worktree de integración. Naomi confirmó que registro, OTP, login, perfil básico y créditos funcionan; no se reescribieron ni se repitieron esas pruebas. Codex no realizó llamadas reales a Gemini, correos, operaciones de usuario ni DDL.

## Gemini: causa confirmada y alcance de la corrección

Naomi aportó dos diagnósticos seguros del intento desde React: `generateContent`, categoría `UPSTREAM`, HTTP **503**, duraciones 2543 ms y 1461 ms. La causa observada es indisponibilidad del proveedor. La petición alcanzó Gemini: no fue rechazo de sesión/CSRF ni un timeout local. No se puede prometer que un cambio local elimine un 503 remoto.

La inspección sin red confirmó que `.env.ai.local` sí se leía, las cuatro variables requeridas estaban presentes y válidas, y el modelo coincidía con el validado previamente. El límite efectivo anterior no coincidía con los 300 tokens recomendados. No se modificaron archivos privados ni el adaptador Gemini ya corregido.

El lanzador ahora toma la configuración de IA del archivo privado dedicado, sin permitir que valores de plantilla la anulen, y conserva SMTP/OTP e identidad demo. El perfil local fija **300 tokens**, timeout backend de **30 segundos** y espera React de **35 segundos**. Crear el servicio o iniciar Express no envía solicitudes generativas. Cada envío manual produce una sola petición, sin reintentos automáticos. La UI traduce `AI_UNAVAILABLE` a un mensaje de indisponibilidad temporal; el código HTTP permanece disponible para diagnóstico.

Después de cerrar con Ctrl+C el Express anterior, iniciar:

```sh
cd '/Users/naomisanchez/Desktop/Integración-SkillSwap/backend'
npm run demo:config-check -- --smtp
npm run demo:start -- --smtp
```

El primer comando solo valida configuración privada. El segundo inicia Express con SMTP y Gemini configurados; no los invoca automáticamente. Reutiliza los archivos privados existentes y el almacenamiento local de integración con lectura del almacenamiento previo. No sobrescribe claves ni copia secretos al repositorio.

React:

```sh
cd '/Users/naomisanchez/Desktop/Integración-SkillSwap/frontend'
npm run dev -- --host localhost --port 5173 --strictPort
```

Abrir **http://localhost:5173**; la API continúa en el puerto 4000. No iniciar dos Express contra la misma demo. La disponibilidad real de Gemini desde React queda pendiente de la próxima comprobación manual de Naomi.

## Catálogo

Los tres nombres visibles son ahora Programación en Python, Diseño de interfaces y Desarrollo web. Se conserva el valor canónico original al enviar formularios y filtros: IDs, códigos y nombres almacenados no se actualizaron ni se recrearon. `DEMO_ONLY`, los códigos demo y la categoría general de demostración permanecen; no se presenta como catálogo oficial de TECSUP.

Se preparó `backend/database/catalogs/demo-skills-1.1.0.json`, con las tres entradas originales intactas y seis propuestas: SQL, JavaScript, Git y control de versiones, Fundamentos de Linux, Redes de computadoras y Power BI. Son **nueve entradas preparadas, no nueve habilidades importadas**. Las seis nuevas no aparecerán en React hasta validar y autorizar su importación.

Validación local sin MySQL:

```sh
cd '/Users/naomisanchez/Desktop/Integración-SkillSwap/backend'
node scripts/demo-skills.js --validate
```

El importador específico rechaza cualquier identidad diferente de `skillswap_ai_demo` / `skillswap_demo_app`. `--apply` exige además `DEMO_SKILLS_ALLOW_WRITE=yes`; no se ejecutó. Utiliza la sincronización idempotente existente: solo inserta faltantes exactos, rechaza conflictos y no sobrescribe entradas referenciadas. No ejecutar provisión de mentores ni limpieza para ampliar el catálogo.

## Declaraciones de solicitud y migración pendiente

La inspección encontró que el contrato original solo guardaba habilidad, certificado y portafolio. Para no descartar información, se preparó **009_mentor_application_details.sql** y su registro/checksum en el migrador existente. No se aplicó.

La migración crea una única tabla dependiente de la solicitud, con:

- Nivel declarado para enseñar: Intermedio o Avanzado, sin preselección automática.
- Experiencia y temas: textos obligatorios de 1 a 2000 caracteres, con validación de Unicode y controles.
- Fechas de creación/actualización y clave foránea a la solicitud existente.

No altera ni rellena solicitudes anteriores, no cambia usuarios ni créditos, y no asigna niveles aprobados. Los tres conceptos quedan separados: aprendizaje en onboarding, declaración en la nueva tabla, aprobación ADMIN en `mentor_skill_levels`.

El formulario permite escribir y seleccionar estos campos. El backend anuncia si la migración está disponible mediante requisitos de solicitud; **mientras 009 siga pendiente, bloquea el envío ampliado con un mensaje explícito**. No presenta un guardado falso ni almacena documentos nuevos para un envío que sabe que no puede persistir.

Tras la autorización, validación y aplicación de 009, reiniciar Express. El contrato ampliado guarda declaraciones al crear la solicitud y permite `PATCH /api/student/mentor-applications/:applicationId` para editar datos en PENDING o REJECTED. Rechaza APPROVED, otro propietario y campos de aprobación/rol. Cambiar datos no aprueba ni reenvía automáticamente una solicitud; el reenvío de REJECTED sigue siendo explícito. El portafolio permanece opcional y el certificado obligatorio.

**Para habilitar este guardado se necesita autorización de Naomi para el DDL.** La preparación y las pruebas con mocks no constituyen una aplicación real ni una validación sobre MySQL aislado. Se conserva el requisito de validación/checksums del migrador: no se falsificó su mapa de validaciones ni se modificó `skillswap_ai_test_auth` para obtenerlo. No ejecutar `--apply` ni cambiar esos controles sin acordar ese paso. Las migraciones 001–008 mantienen sus checksums.

## PDF y fotografía

- **Quitar PDF seleccionado** elimina solo la selección local, limpia el input e invalida validaciones tardías. Permite elegir nuevamente el mismo archivo u otro; no llama a DELETE ni elimina el certificado ya enviado.
- En solicitudes PENDING/REJECTED, **Editar solicitud / reemplazar PDF** abre la misma pantalla. **Reemplazar certificado** usa el PUT existente y funciona de forma independiente de 009. Guarda únicamente el PDF y lo indica expresamente: no pretende guardar las declaraciones. APPROVED sigue rechazando sustituciones.
- Se mantienen validación PDF, máximo 5 MiB y almacenamiento privado. No se crea un endpoint para dejar una solicitud sin certificado obligatorio.
- **Eliminar foto** aparece cuando hay fotografía y exige confirmación. Envía DELETE con cookie y CSRF, consulta el perfil y actualiza los avatares a iniciales. No envía PATCH ni modifica otros datos del perfil. Ante error no se informa éxito ni se limpia el estado local como si hubiera funcionado.

Estas operaciones solo se ejecutarán mediante acciones manuales de Naomi. Las pruebas técnicas utilizaron archivos y repositorios mock, nunca sus archivos actuales.

## Verificaciones

- Build React/TypeScript y ESLint correctos; `git diff --check` correcto.
- **96 pruebas frontend aprobadas**, 0 fallidas.
- **209 pruebas backend aprobadas**, 3 omitidas, 0 fallidas.
- Configuración conjunta validada con `demo:config-check -- --smtp`, sin abrir MySQL, SMTP ni Gemini.
- Contratos mock de chatbot, foto y certificado; límites, idempotencia del catálogo, validaciones de declaraciones, propiedad/CSRF y reglas PENDING/REJECTED/APPROVED.
- Revisión de secretos antes de publicar. Ninguna clave, cookie o token se incluye en este informe.
- No se utilizaron Chrome ni recorridos visuales automatizados. No se aplicó la migración ni se importaron habilidades. No se alteraron cuentas, fotos, certificados, mentores, ofertas, horarios, créditos ni reservas persistentes.
- Se mantiene el aviso de Vite por bundle superior a 500 kB; no impide compilar. No se cambiaron dependencias, estilos, tipografías, iconos ni pantallas de mentor/administrador.

## Qué volver a probar manualmente

1. Reiniciar Express y React con los comandos anteriores; usar la cuenta ya registrada, sin repetir registro/OTP ni crear cuentas nuevas.
2. Enviar **una** consulta académica breve al asistente. Si Gemini devuelve 503, esperar y comprobar la línea segura `ai_provider`; no repetir continuamente ni compartir claves.
3. Comprobar los tres nombres naturales en habilidades, Explorar y Para ti. Las seis propuestas adicionales todavía no deben aparecer.
4. Abrir una solicitud: verificar que se pueden editar nivel, experiencia y temas, y que el aviso impide afirmar guardado mientras falte 009. Después de autorizar/aplicar la migración, guardar y recargar para comprobar persistencia real; no comprobarlo antes como si estuviera habilitado.
5. Seleccionar un PDF, quitarlo y seleccionar el mismo u otro. En una solicitud PENDING/REJECTED, usar Reemplazar certificado si se desea cambiar realmente el archivo. Verificar que quitar la selección no borra el PDF anterior y que APPROVED no se edita.
6. Solo si se desea borrar realmente la foto actual: pulsar Eliminar foto, comprobar la confirmación, cancelar primero y confirmar únicamente al decidir eliminarla. Revisar iniciales en perfil y barra lateral, y recargar. Subir otra foto si se desea restaurarla.

## Commits y futura incorporación al backend

- `34ed1ea`: configuración conjunta Gemini/SMTP, límites y espera HTTP.
- `97dc5b9`: etiquetas naturales y catálogo demo ampliado preparado.
- `3edfd6a`: backend reutilizable de declaraciones, migración preparada y permisos; no ejecuta DDL.
- `d9a8696`: eliminación de fotografía con confirmación/CSRF.
- `9597d22`: campos persistibles y gestión de selección/sustitución de PDF.
- `bc47aaf`: mensaje seguro para indisponibilidad Gemini.
- Los commits de pruebas/documentación se consultan con `git log --oneline --first-parent`.

`feature/backend` no se modificó. Para incorporar posteriormente el cambio reutilizable, con autorización separada: verificar que el checkout de esa rama esté limpio, ejecutar fetch, confirmar su HEAD y aplicar **cherry-pick normal de `3edfd6a`** sobre `feature/backend`. Ante conflictos, revisarlos o usar `git cherry-pick --abort`; nunca reset/clean/force push. Ejecutar pruebas sin variables de integración y revisar antes de publicar esa rama. El cherry-pick prepara SQL, no lo aplica.

`34ed1ea` y `97dc5b9` mezclan adaptaciones específicas de integración con archivos frontend: no incorporarlos completos a backend sin revisión. Si se necesitan sus archivos backend, preparar después un commit selectivo de esos paths y revisar el diff; no fusionar todo develop a feature/backend ni cambiar la rama del worktree actual. No se ejecutó ninguno de estos pasos de incorporación.
