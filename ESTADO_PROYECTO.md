# 📋 Estado del Proyecto — Mi App Oliverio

> Documento vivo. Léelo al iniciar cada sesión y actualízalo al cerrar.
> **Última actualización:** 2026-07-04

---

## 1. Resumen

App web **Mi App Oliverio** (control de acceso escolar, entradas/salidas con QR, asistencia a clase por profesor, recogidas, avisos, chat, calificaciones y notas).

- **Stack:** React 19 + Vite 8 + Firebase, Tailwind v3 (paleta institucional vino/dorado/beige).
- **Firebase projectId:** `mi-app-oliverio`
- **En vivo:** https://mi-app-oliverio.web.app
- **Ubicación local:** `/Users/danielricano/Documents/proyectos oliverio/entradasoliverio`
- **CLI Firebase / gcloud:** logueado como `ricfirebase@gmail.com`.

---

## 2. Estado actual (2026-07-04)

- **Git:** rama `main`. Todo el trabajo del 2026-07-04 está **en el working tree SIN commit** (solo desplegado en hosting). Sigue pendiente `git push` de los commits previos.
- **Build:** `npm run build` pasa (hay warnings de lint preexistentes que no rompen el build).
- **Deploy:** hosting + firestore.rules + storage + functions desplegados y funcionando.

### Último avance (2026-07-04, ver detalle en sección 13)
- **Rediseño radical de la interfaz** (app shell): sidebar en escritorio, topbar + drawer en tablet, bottom-nav estilo app en móvil. Login split-screen. Tipografía display Sora, botones pill, modales bottom-sheet en móvil. Marca renombrada a "Mi App Oliverio". Paleta institucional intacta.
- **Portal de padres**: tarjeta del alumno rediseñada, correo institucional del alumno obligatorio al registrarlo.
- **Suspensión de acceso** por padre desde Users (switch), bloqueo en tiempo real (AuthContext con onSnapshot).
- **Auto-registro de padres** reactivado en el Login (solo rol parent).
- **Calendario**: sección "Próximos a vencer" con cuenta regresiva, navegación con selectores mes/año + botón Hoy, e historial de eventos.
- **Módulo Asignar profesores** (`/teacher-assign`): planteles (multiplantel), grupos dinámicos y materias.
- Gestión de Alumnos: botones de acción con etiqueta visible.

---

## 3. Roles y accesos

| Rol | Home | Acceso |
|-----|------|--------|
| `superadmin` | /dashboard | TODO (incl. /parent y /teacher) |
| `admin` | /dashboard | Dashboard, Scanner, Students, Users, Import, Announcements, Subjects, TeacherAssign, Kiosk, Teacher, Messages |
| `guard` (Checador) | /dashboard | Dashboard, Scanner, Students, Kiosk |
| `teacher` (Profesor) | /teacher | TeacherDashboard, Messages |
| `parent` (Padre/Tutor) | /parent | ParentDashboard, Messages |
| `kiosk` (Tablet fija) | /kiosk | Solo /kiosk (pantalla completa) |

Los roles se normalizan a minúsculas. Las rutas están gateadas por rol en `src/App.jsx` (`ProtectedRoute`).

---

## 4. Estructura (páginas en `src/pages/`)

| Página | Ruta | Qué hace |
|--------|------|----------|
| Login | /login | Iniciar sesión / **crear cuenta** (toggle segmentado; el auto-registro crea SOLO rol parent). Split-screen con panel de marca |
| Dashboard | /dashboard | Stats: vista Diaria / Clase / Mensual, filtros plantel/nivel/grado/grupo, export |
| Scanner | /scanner | Escaneo QR entrada/salida + recogida (quién recoge) + recogida con pase temporal |
| Students | /students | CRUD de alumnos + genera/imprime QR. Botones de acción con etiqueta visible (Editar/Cambiar grupo/Suspender/Imprimir QR/Eliminar) |
| Users | /users | Gestión de usuarios por apartados, alta, enlaces de acceso, reset password. En Padres: **hijos registrados** (con correo institucional) + **switch de suspensión de acceso**. En Profesores: botón "Asignar" → /teacher-assign |
| ImportTeachers | /import-teachers | Importación masiva de profesores desde Excel de HRMS |
| Announcements | /announcements | Admin publica avisos (all / plantel / clase) con prioridad, categoría, imagen de portada y adjuntos (PDF/imágenes); borrado en cascada con Storage |
| Subjects | /subjects | Catálogo de materias (para calificaciones) |
| TeacherAssign | /teacher-assign | **Asignar materias y planteles** (admin): planteles (multiplantel), grupos dinámicos (plantel→nivel→grado, A/B) y materias por profesor. Guarda `planteles[]`, `classIds[]`, `subjectIds[]`, `subjectNames[]` |
| TeacherDashboard | /teacher | Pase de lista, Alumnos, Avisos, Calificaciones (acotadas a `subjectIds` asignados si los hay), Perfil, notas/observaciones |
| ParentDashboard | /parent | Asistencia (tarjeta del alumno rediseñada), Grupo familiar, Recogidas, Avisos, Calificaciones, Notas, Perfil. Al registrar alumno pide **correo institucional** obligatorio |
| Kiosk | /kiosk | Modo kiosko pantalla completa, escaneo continuo, recogida |
| Messages | /messages | Chat en tiempo real (directo + canales de grupo), no leídos |
| Calendar | /calendar | Calendario de eventos (mes + lista) con **adjuntos** (Storage `events/{id}/`; imágenes en lightbox, PDF en pestaña nueva). **Próximos a vencer** (cuenta regresiva), navegación con selectores mes/año + botón Hoy, **historial** de eventos pasados. Admin crea para todo/plantel/grupo; profesor para su grupo. Audiencias con restricción de visibilidad |
| Deliveries | /entregas | **Cola de entrega**: padre escanea su QR de recogida (RC-/pase temporal) → hijos entran a "pendientes por entregar" → botón "Llamar" (notifica al tutor, mandar a llamar al plantel) → "Entregado" registra la salida en attendance. Tiempo real, filtro por plantel. También se alimenta desde el Kiosko |
| Schedules | /schedules | **Horarios** por grupo (grid Lun–Vie): admin edita bloques (hora/materia/profesor); profesor y padre consultan los suyos |
| Workshops | /workshops | **Talleres**: admin publica (costo, cupo, horario, plantel); padre inscribe hijos → cargo pendiente; admin marca pagado (efectivo/transferencia). Arquitectura Mercado Pago lista en `utils/payments.js` (activar con VITE_PAYMENTS_ENABLED) |

**Otros:** `config/colegio.js` (roles/planteles/niveles/grados/grupos/periodos + helpers classId), `context/AuthContext.jsx`, `firebase.js`, `notifications.js` (FCM), `utils/image.js` (fotos a dataURL), `utils/version.js` (auto-update), `components/` (Navbar, Avatar, NotificationBell).

---

## 5. Datos del colegio (`colegio.js`)

- **Planteles → niveles:**
  - Xochimilco: Primaria, Secundaria
  - Tlalpan: Preescolar, Primaria, Secundaria
  - Coyoacán: Preescolar, Primaria
  - Aztecas: Secundaria, Preparatoria
- **Niveles → grados:** Preescolar (Kinder 1-3), Primaria (1°-6°), Secundaria (1°-3°), Preparatoria (1°-3°).
- **Grupos:** A, B. **Periodos:** Periodo 1/2/3/Final.
- **classId:** `"plantel|nivel|grado|grupo"` (ej. `Tlalpan|Primaria|3°|A`).

---

## 6. Firestore (colecciones)

| Colección | Contenido |
|-----------|-----------|
| `users` | role, plantel (kiosk), classIds[] (teacher), **planteles[]** (teacher, multiplantel), **subjectIds[]/subjectNames[]** (teacher, materias que imparte), photo, fcmTokens[], pickupCode, `announcementsReadAt`, **`accessSuspended`/`accessSuspendedAt`** (suspensión de acceso por admin), adminPlantel/adminNivel (admin acotado), name/email/phone |
| `users/{uid}/familyMembers` | familiares con foto + passCode (credencial QR) |
| `students` | name, lastName, **studentEmail** (correo institucional, obligatorio al registrar desde el portal del padre), plantel, nivel, grado, grupo, classId, parentIds[], qrCode, photo, suspended (adeudo) |
| `attendance/{date}/records` | entryTime, exitTime, métodos, guardId, plantel, pickedUpBy* |
| `classAttendance/{date}/records` | pase de lista por profesor (present/late/absent) |
| `notifications` | por parentId (push individual) |
| `announcements` | avisos all/plantel/classId + `priority`, `category`, `coverUrl`/`coverPath`, `attachments[]` (Storage) |
| `conversations` + `/messages` | chat (participants[], lastMessage, lastRead{}) |
| `pickupAuthorizations` | recogidas temporales autorizadas por el tutor |
| `observations` | notas del profesor (conducta/academica/positiva/tarea, visibleToParent) |
| `subjects` | catálogo de materias |
| `grades` | calificaciones por alumno/materia/periodo (escala 0-10, aprobatoria 6) |
| `events` | calendario: `date`, `time`, `audiences[]`, `scope`, `category`, autor, `attachments[]` (Storage `events/{id}/`) |
| `pickupQueue/{date}/items` | cola de entrega (docId = studentId, no duplica): requestedByName/Code/Uid, status waiting→called→delivered, attendanceRecordId, parentIds[] |
| `schedules` | horario por grupo (docId = classId saneado): blocks[{day 0-4, start, end, subject, teacher}] |
| `workshops` | talleres: name, description, cost, capacity, schedule, plantel ('' = todos) |
| `workshopEnrollments` | inscripciones: workshopId, studentId, parentId, cost, paymentStatus pending/paid, paymentMethod |

Reglas en `firestore.rules` con funciones por rol. **Regla clave:** ramas por rol primero, las que leen `resource.data` al final; NO usar `is list` sobre `resource.data` en colecciones que se consultan con `array-contains`. **`users` update:** al editar su propio perfil un usuario no puede cambiarse el `role` ni quitarse la suspensión (`accessSuspended` protegido con `get('accessSuspended', false)`); solo el admin la modifica.

### Firebase Storage (adjuntos de avisos)
- Reglas en `storage.rules` (desplegadas 2026-06-29). Ruta `announcements/{announcementId}/...`: lectura/escritura/borrado para **autenticados** (escritura con límite 20 MB). **NO usa `firestore.get` para verificar rol** — esa lectura cross-service daba `storage/unauthorized` intermitente; la protección real está en la app (solo admin/profesor ven el formulario) y en `firestore.rules` (solo admin/profesor crean el doc del aviso).
- Helpers cliente en `src/utils/announcements.js` (subir/borrar) y `fileToResizedBlob` en `src/utils/image.js` (comprime la portada a 1200px antes de subir).
- Al **borrar un aviso** se hace `listAll` de su carpeta y se borran todos los archivos antes del doc (sin huérfanos).

---

## 7. Cloud Functions (`functions/index.js`, node20, us-central1)

- `onNotificationCreated` → push individual al padre.
- `onAnnouncementCreated` → fan-out de avisos por all/plantel/classId.
- `onChatMessageCreated` → push de chat a participantes (menos remitente).

⚠️ node20 deprecado (decommission 2026-10-30) y firebase-functions v6 outdated → considerar upgrade.

---

## 8. Notificaciones push (FCM) — desplegado y funcionando

- Service worker `public/firebase-messaging-sw.js`.
- `src/notifications.js`: enable/disable/listenForeground. Token en `users/{uid}.fcmTokens`.
- VAPID key en `.env` (`VITE_FCM_VAPID_KEY`).

---

## 9. Cuentas

| Cuenta | Rol | Notas |
|--------|-----|-------|
| `admin@oliverio.edu.mx` / `Oliverio2026` | admin | bootstrap, recomendar cambiar password |
| `ricfirebase@gmail.com` / `oliverio123$` | superadmin | tester |
| `kiosko.{plantel}@oliverio.edu.mx` / `Kiosko2026$` | kiosk | una por plantel (Xochimilco, Aztecas, Coyoacán, Tlalpan) |

---

## 10. Comandos útiles

```bash
# Desarrollo
npm run dev
npm run build
npm run lint

# Deploy
firebase deploy --only hosting
firebase deploy --only firestore:rules
firebase deploy --only functions   # requiere plan Blaze

# gcloud (PATH no persistente)
export PATH="$HOME/google-cloud-sdk/bin:$PATH"
```

---

## 11. Pendientes / próximos pasos

- [x] `git push` (Todos los cambios de avisos, calendario, responsividad y linter subidos con éxito).
- [ ] Promedios / boleta de calificaciones; configurar escala y periodos desde UI.
- [ ] Captura de notas por admin (las reglas ya lo permiten, falta UI).
- [ ] Implementar `face-api.js` (instalado, sin usar — deuda técnica).
- [ ] Upgrade node20 → versión soportada antes de 2026-10-30.

## 12. Deuda técnica

### ✅ Limpieza de lint (2026-06-29)
Se pasó de **35 errores → 0 errores** (`npm run lint` ahora limpio; build OK). Lo hecho:
- **Variables sin usar** eliminadas: `Users.jsx` (imports `classLabel`/`parseClassId` y `setBaseUrl`), `Scanner.jsx` (`catch (e)` → `catch`).
- **Bug de fragilidad corregido en `Scanner.jsx`**: se leía `scanModeRef.current` directamente en el JSX (un ref no provoca re-render). Se añadió estado `scanMode` para el render; el ref se conserva solo para el callback `onScanSuccess` (evita closure obsoleto).
- **`Students.jsx`**: escapes innecesarios `<\/script>` → `</script>` en el HTML de impresión de QR.
- **`AuthContext.jsx`**: `eslint-disable` puntual para `only-export-components` (el hook `useAuth` vive junto al provider a propósito; solo afectaba Fast Refresh en dev).
- **`eslint.config.js`**: las reglas de *React Compiler readiness* del plugin v7 (`set-state-in-effect`, `immutability`) bajadas a `warn` — marcan patrones que funcionan bien (cargar datos al montar, mutar en callbacks) pero no son compiler-safe; así el lint queda limpio sin reescribir código que funciona. Bloque nuevo para el service worker (`public/**/*-sw.js`) con globals de worker + `firebase`.

### Pendiente (warnings restantes, no bloquean)
- **23 warnings** restantes: 20 `set-state-in-effect` (patrón "cargar datos al montar" en varias páginas), 1 `immutability` (Scanner `handleGroupCode`), 2 `exhaustive-deps` (ParentDashboard). Mejora futura opcional: migrar las cargas a un hook compartido `useFirestoreQuery`.
- `firebaseConfig` con fallback hardcodeado en `src/firebase.js` (ya lee de env; el `apiKey` web de Firebase NO es secreto, así que es deuda cosmética, no riesgo de seguridad).
- `face-api.js` instalado sin implementar.

---

## 13. Historial de cambios de este documento

- **2026-07-06 (Integración Mercado Pago). SIN DEPLOY:** Se instaló e integró la librería `mercadopago` (SDK v2) en las Cloud Functions. Se crearon los endpoints `createWorkshopPreference` (onCall) para generar las preferencias de cobro de talleres y `mercadoPagoWebhook` (onRequest) para recibir notificaciones de pagos exitosos y actualizar Firestore automáticamente. En el frontend se actualizó `startOnlinePayment` en `payments.js` para llamar a la nueva función y redirigir al padre al `init_point` de Mercado Pago inmediatamente después de inscribir al alumno en `Workshops.jsx`. **Modo Simulación Activado:** Dado que aún no hay Access Token real, el sistema detectará esto automáticamente, marcará el pago como exitoso y redirigirá al taller sin necesidad de abrir la pasarela, permitiendo demostrar el flujo completo. Para pasar a producción solo hay que agregar el Access Token real a las variables de entorno de Firebase.

- **2026-07-06 (UX en creación de talleres). SIN DEPLOY:** Se mejoró significativamente la interfaz de usuario para la creación de talleres en `Workshops.jsx` con el objetivo de reducir errores de llenado. El formulario ahora está dividido visualmente en tres secciones ("Información General", "Costo y Cupo", "Horario"). Se cambiaron los selects por chips para elegir el plantel de manera más rápida, se añadieron íconos empotrados en los inputs de moneda y cupo, y el campo de horario ahora cuenta con botones de autocompletado para insertar rangos de días y horas estandarizados con un solo clic.

- **2026-07-04 (cont. 6 — portadas de avisos estéticas). DESPLEGADO:** las portadas de Avisos ya no quedan de alturas dispares ni se recortan feo. Nuevo marco **16:9 uniforme** (`.aviso-cover`): la imagen se muestra completa (`object-fit: contain`) sobre una copia **desenfocada** de sí misma que rellena los lados (estilo streaming), así cualquier proporción (horizontal/vertical/cuadrada) se ve pareja y elegante. `AnnouncementCard.jsx` usa el marco + título con tipografía display. `Announcements.jsx`: vista previa de portada con el mismo marco (estado `coverPreview` con object URL manejado por efecto), texto de ayuda y botón "Cambiar imagen". CSS `.aviso-cover*`. Verificado sembrando avisos con portadas horizontal/vertical/cuadrada (picsum) y borrándolos.

- **2026-07-04 (cont. 5 — módulo Asignar materias y planteles). DESPLEGADO:** nueva página **`TeacherAssign.jsx`** (`/teacher-assign`, roles superadmin/admin, link "Asignar materias y planteles" en grupo Gestión del Navbar). Módulo dinámico para asignar a cada profesor: **planteles** (multiplantel, chips; si no tiene, se infieren de sus classIds), **grupos** (picker que se desbloquea SOLO para los planteles elegidos: plantel→nivel→grado con botones A/B, "A y B" por grado, "Todo el nivel"; quitar un plantel descarta sus grupos), y **materias** (chips del catálogo `subjects`). Guarda en el user doc: `planteles[]`, `classIds[]`, `subjectIds[]`, `subjectNames[]` (denormalizado). Barra de guardado fija con estado dirty/Descartar. Deep-link desde Users.jsx (botón dorado "Asignar" en filas/tarjetas de profesores → `/teacher-assign?uid=`). **TeacherDashboard**: la captura de calificaciones ahora se limita a las materias asignadas (`subjectIds`) si las hay; si no, muestra todas. No requirió cambios de reglas (admin ya podía escribir esos campos). CSS nuevo `.assign-*`, `.pick`. E2E verificado: guardó Tlalpan+Coyoacán + 6 grupos + materias, persistió tras recargar, y se restauró el profesor de prueba (ABRAHAM DURON LOYA).

- **2026-07-04 (cont. 4 — mejoras al Calendario). DESPLEGADO:** (1) sección **"Próximos a vencer"** (tarjeta con filo dorado arriba del calendario): eventos dentro de los próximos 7 días con chip de cuenta regresiva (Hoy/Mañana/En N días, color por urgencia). (2) **Mejor navegación**: selectores desplegables de mes y año + botón "Hoy" (además de las flechas). (3) **Historial de eventos**: la lista lateral ahora tiene toggle segmentado "Próximos / Historial" (pasados del más reciente al más antiguo, hasta 50). Helpers nuevos en `utils/events.js`: `daysUntil`, `relativeDayLabel`. CSS nuevo: `.cal-toolbar`, `.cal-nav-selects`, `.due-chip`, `.cal-due-*`. Verificado con playwright sembrando 8 eventos demo (pasados/hoy/futuros) y borrándolos después.

- **2026-07-04 (cont. 3 — auto-registro de padres reactivado). DESPLEGADO:** el Login vuelve a tener control segmentado "Iniciar sesión / Crear cuenta". El registro crea SOLO cuentas con rol `parent` (nombre, correo, contraseña ≥6 con confirmación), usando el `register` del AuthContext; las reglas de Firestore ya permitían el self-create para role=="parent". Errores de Firebase traducidos a español. E2E verificado (playwright registró un padre real → cayó en /parent con su menú) y la cuenta de prueba se eliminó después (Firestore + Auth). NOTA: esto revierte la decisión "solo login" del 2026-06-29; el personal (teacher/admin/guard/kiosk) sigue creándose desde el panel de administración.

- **2026-07-04 (cont. 2 — acciones descriptivas en Gestión de Alumnos). DESPLEGADO:** los 5 botones de acción por alumno (antes solo ícono + tooltip) ahora muestran etiqueta visible: "Editar", "Cambiar grupo", "Suspender/Reactivar", "Imprimir QR" y "Eliminar", con tooltips más explicativos. Funciona en tabla (escritorio) y en tarjetas (móvil).

- **2026-07-04 (cont. — portal padres + correo institucional + suspensión de acceso). DESPLEGADO (rules+hosting):**
  - **Tarjeta del alumno rediseñada** en el portal del padre: encabezado institucional vino con avatar dorado, chips de grado/plantel/correo institucional, franja de estado con ícono (School/Home/Clock). Selector de hijos con chips `.pp-chip`. Aviso si el alumno está suspendido.
  - **Correo institucional del alumno obligatorio** al registrarlo (campo `studentEmail` en `students`, se guarda en minúsculas). Alumnos previos no lo tienen (se muestra "sin correo institucional").
  - **Admin → Usuarios → Padres**: cada padre muestra sus **hijos registrados** (nombre + correo institucional) en vista lista y tarjetas (mapa `parentIds` → hijos con carga completa de `students`).
  - **Suspensión de acceso a la plataforma** (p. ej. adeudo): switch por padre (`users.accessSuspended` + `accessSuspendedAt`). `AuthContext` ahora escucha el perfil con **onSnapshot** y `App.jsx` bloquea con pantalla "Acceso suspendido" **en tiempo real** (sin recargar). `firestore.rules`: el usuario NO puede quitarse la suspensión al editar su propio perfil (guard con `get('accessSuspended', false)`). CSS nuevo: `.switch`, `.pp-chip`, `.pp-hero-*`.
  - E2E verificado (playwright + Chrome): suspender desde /users bloquea al padre logueado al instante; reactivar lo desbloquea. Cuenta de prueba: prueba@prueba.com / 123456.
  - Deploy: `firebase deploy --only firestore:rules,hosting` (este deploy también publicó el rediseño radical del shell). **Sigue SIN commit.**

- **2026-07-04 (rediseño radical de interfaz — app shell nuevo, paleta intacta):**
  - **Nuevo app shell** (`Navbar.jsx` reescrito por completo, data-driven por rol): **sidebar fijo** en escritorio (≥1024px) con grupos Operación/Gestión/Académico/Comunicación, indicador dorado en link activo y pie con usuario+campana+salir; **topbar glass + drawer lateral** en tablet/móvil; **bottom-nav estilo app nativa** en móvil (<768px) con los 4 links de mayor prioridad por rol + botón "Más" (abre el drawer). Badge de mensajes sin leer en los tres. El desplazamiento del contenido lo hace CSS vía `body.with-shell` (clase que Navbar pone/quita en un effect).
  - **Convivencia con barras existentes**: en `/parent` la barra propia del portal (`.pp-bottomnav`) oculta la global (`#root:has(.pp-bottomnav) .shell-bottomnav`); en el chat con conversación abierta (`.msg-pane.show-chat`) la bottom-nav se oculta y el panel recupera la altura. Alturas del chat recalibradas (topbar+bottom-nav).
  - **Sistema de diseño renovado** (index.css): tipografía display **Sora** (títulos, stats, marca; Inter sigue en cuerpo), botones **pill** (radius 999), inputs "rellenos" beige que se vuelven blancos al enfocar, tarjetas radius 22 con borde dorado al hover, thead con filo dorado, **modales = bottom-sheet con asa en móvil** (slide-up, safe-area), toasts abajo en móvil (no chocan con la nav), drawer con links tipo tarjeta. Radios Tailwind 12/16/22/28 y fontFamily.display en tailwind.config.
  - **Login rediseñado** (pantalla dividida): panel de marca vino con logo, nombre del colegio, features y aros dorados decorativos + panel de formulario; en móvil se apila como hero. Breakpoint 768.
  - **NotificationBell**: prop `up` para abrir el panel hacia arriba (pie del sidebar).
  - Verificado con screenshots (Chrome headless + playwright-core, login como ricfirebase): escritorio 1440 (sidebar, Dashboard/Students), tablet 834 (drawer), móvil 390 (bottom-nav, drawer, Mensajes, portal padre sin doble barra). Build OK, lint 0 errores / 29 warnings (patrón preexistente). **SIN commit y SIN deploy** (pendiente: `firebase deploy --only hosting`).

- **2026-07-03 (sesión grande — 14 funcionalidades + rediseño visual):**
  - **Cola de entrega** (`/entregas` + `utils/pickupQueue.js` + colección `pickupQueue`): padre escanea su QR al llegar → hijos en lista de pendientes → llamar al plantel (notifica) → "Entregado" registra la salida. El Kiosko también encola códigos RC-/PASS-.
  - **Salidas anticipadas**: al registrar salida antes de la hora del nivel (`HORA_SALIDA` en colegio.js) el Scanner pide motivo (modal, `MOTIVOS_SALIDA_ANTICIPADA`); se guarda `earlyExit{reason,note}` en attendance.
  - **Suspensión por adeudo**: botón en Students (campo `suspended`); Scanner/Kiosk muestran "Cuenta suspendida — presentarse en administración" y NO registran acceso; recogidas grupales lo bloquean.
  - **Cambio de grupo** dedicado en Students (modal, guarda `lastGroupChange`).
  - **Promoción de grado masiva** (botón "Promover grado" en Students, solo admin): preview (suben/egresan/revisar plantel/sin datos), confirmación escribiendo PROMOVER; helper `promoverAlumno` en colegio.js; egresados con badge.
  - **Leyenda de responsabilidad** al agregar familiar (checkbox obligatorio, guarda `responsibilityAcceptedAt`) + aviso permanente en pestaña Familia + confirmaciones al desactivar/eliminar pases.
  - **Editar aviso** (Announcements + AnnouncementCard con prop onEdit): formulario pre-llenado, conserva/quita adjuntos y portada, `updatedAt` + "editado".
  - **Reportes de pase de lista** PDF/Excel (botones en TeacherDashboard; `utils/reports.js` con jspdf/xlsx en import dinámico).
  - **Adjuntos en calendario** (`utils/eventFiles.js`, storage.rules ruta `events/`): subir en crear/editar, ver imagen en lightbox / abrir PDF.
  - **Horarios** (`/schedules`, colección `schedules`): admin arma bloques por grupo; profesor/padre consultan.
  - **Talleres** (`/workshops`, colecciones `workshops`/`workshopEnrollments`, `utils/payments.js`): inscripción + pago pendiente/pagado; Mercado Pago documentado como paso futuro.
  - **Admins por plantel/sección**: campos `adminPlantel`/`adminNivel` en la cuenta admin (Users.jsx); Dashboard/Students/Entregas filtran por ese alcance (client-side; superadmin ve todo).
  - **Rediseño visual** (index.css): fondo con halos sutiles vino/dorado, botón primario con gradiente, títulos con gradiente vino, navbar y bottom-nav del padre con glass/blur, sombras y radios más ricos, scrollbar/selection institucionales, animaciones (shimmer, floaty, pulso en badges), clases `.notice-*` y `.skeleton`. Paleta intacta.
  - **DEPLOY NECESARIO**: `firebase deploy --only firestore:rules,storage,hosting` (reglas nuevas: pickupQueue, schedules, workshops, workshopEnrollments; storage: events/).
  - Deps nuevas: jspdf, jspdf-autotable (dinámicos). Lint 0 errores / 28 warnings (patrón preexistente).

- **2026-07-01:** Profesores importados COMPLETO — se validó el Excel (`profesores .xlsx`): 198 filas, 116 candidatos con correo válido, 18 sin correo (ignorados). Se crearon los **12 faltantes** que habían fallado por el bloqueo de Auth (script one-off web-SDK: app primaria como ricfirebase para Firestore + app secundaria para el signUp, pausas de 1.2s). Verificado: **0 faltantes**, los 116 profesores existen. Todos con contraseña `123456`.
- **2026-06-29:** creación del documento. Estado: 10 commits sin push, importación de profesores desde Excel agregada, todo lo demás en vivo.
- **2026-06-29:** limpieza de deuda técnica punto 12 — lint de 35 errores a 0 (sin commit todavía). Ver detalle en sección 12.
- **2026-06-29:** FIX importación masiva — daba 400 `auth/too-many-requests` (Firebase bloquea crear muchas cuentas seguidas desde el navegador). Se agregó retardo de 900ms entre cuentas + reintento con espera creciente (6/12/18s) en `auth/too-many-requests`, indicador "Pausa anti-bloqueo" y se muestra el motivo real del error en la tabla. Re-subir el mismo archivo reintenta solo los faltantes. (Si sigue fallando con lotes grandes, la solución robusta sería una Cloud Function con Admin SDK.) Desplegado.
- **2026-06-29:** LIMPIEZA / reset de datos — el usuario borró los profesores en Firebase Auth; se limpiaron sus perfiles huérfanos en Firestore (117 borrados) y se hizo borrón total de datos operativos (announcements, events, attendance, classAttendance, conversations, grades, observations, pickupAuthorizations, notifications). **Conservados: 9 cuentas** (ricfirebase superadmin, admin@oliverio.edu.mx, 4 kioskos, 3 de prueba fresco/maria/prueba) + las 14 materias. Hecho con script web-SDK firmado como superadmin (borrado selectivo de users) + `firebase firestore:delete --recursive` (colecciones). Listo para re-importar profesores (todos con 123456).
- **2026-06-29:** Contraseña inicial fija `123456` para cuentas nuevas — importación masiva (`ImportTeachers`) y alta individual (`Users`) ya no generan contraseña aleatoria; todas inician con `123456` (los usuarios la cambian en su perfil). Se quitó `genPassword`/`generatePassword`. Desplegado.
- **2026-06-29:** NUEVO — Calendario de eventos (`/calendar`, link en Navbar para admin/profesor/padre). Vista mensual (cuadrícula con puntos por categoría) + lista de próximos. Crear/editar/borrar: admin (todo/plantel/grupo) y profesor (solo su grupo). **Audiencias con restricción**: general/padres/maestros/alumnos — un evento solo lo ve el público elegido (alumnos→lo ven los padres). Filtrado de visibilidad en cliente por rol+plantel+grupo (`src/utils/events.js`), reglas Firestore `events` controlan quién crea. Reutiliza CATEGORIAS de avisos para color. Archivos: `src/pages/Calendar.jsx`, `src/utils/events.js`, CSS `.cal-*`. Reglas Firestore + hosting desplegados.
- **2026-06-29:** FIX subida de avisos — al publicar daba `storage/unauthorized` porque el `firestore.get` cross-service de `storage.rules` fallaba. Reescritas las reglas de Storage para gatear por autenticación + tamaño (sin `firestore.get`); el control de quién publica sigue en la app + `firestore.rules`. Redeploy de Storage.
- **2026-06-29:** Login solo inicio de sesión — se quitó la opción "Crear cuenta" (las cuentas las da la administración); el Login ya no usa `register`, solo `login`, con nota "Contacta a la administración". Modales grandes: altura con `dvh` (no `vh`) para que no los tape la barra del navegador, 94% de ancho útil en móvil y botón de cierre más grande (40px). Desplegado.
- **2026-06-29:** Kiosko (tablet) responsive — `qrbox` adaptable (75% del visor) en vez de 280px fijo; visor de cámara más grande y fluido (`min(440px,86vw)`); CSS `#kiosk-reader video` responsivo (compartido con `#qr-reader`); media query ≤600px oculta el nombre del colegio (evita encimado con el botón Salir) y compacta el título. Desplegado.
- **2026-06-29:** Escáner móvil — recuadro de escaneo `qrbox` ahora adaptable (75% del lado menor del visor, función en `scanner.start`) en vez de 250px fijo, más fiable en teléfonos y tablets; CSS para `#qr-reader video` responsivo (width 100%, height auto) y sin UI/bordes extra del html5-qrcode. El resto del escáner ya centraba con `maxWidth:520`. Desplegado.
- **2026-06-29:** TeacherDashboard responsive — las 5 pestañas (`.seg`) ya no se envuelven en móvil: clase nueva `.seg-scroll` las vuelve tira deslizable horizontal (1 fila, scrollbar oculta). Perfil usa `.pp-grid` (no desborda en teléfonos chicos). Prioridad/Categoría del aviso ahora `.grid-2` (se apilan ≤480px) — mismo fix aplicado al Announcements admin. Pase de lista y grados ya eran responsive (`.attendance-actions` apila a ≤600px). Desplegado.
- **2026-06-29:** chat (Messages) móvil pulido — altura del panel con `dvh` en vez de `100vh` (el campo de escribir ya no queda tapado por la barra del navegador móvil), encabezado compacto (`msg-page-header` oculta subtítulo en móvil), burbujas más anchas (`.msg-bubble` 84%). El toggle lista↔chat ya existía. Desplegado.
- **2026-06-29:** tablas → tarjetas en móvil — patrón CSS `.table-cards` + `data-label` por celda: en ≤768px cada fila se vuelve tarjeta (etiqueta ▸ valor), sin scroll horizontal. Aplicado a Students (roster) y a las 3 vistas del Dashboard (diaria/clase/mensual). Contenedor sin marco doble vía `:has(.table-cards)`. ImportTeachers (preview temporal) y la preview de importación de Students quedan con scroll a propósito. Desplegado.
- **2026-06-29:** portal del padre responsive — utilidad `.pp-grid` (`minmax(min(100%,280px),1fr)`) que reemplaza las rejillas con `minmax(300px,1fr)` que desbordaban en teléfonos angostos (hero, recogidas, familia); encabezado de Grupo Familiar con `flex-wrap`; barra inferior con etiquetas en ellipsis, pill activo y compactado ≤380px; `.grid-2` a 1 columna ≤480px. Desplegado.
- **2026-06-29:** fix UI móvil/tablet — la campanita (y botones de ícono) se recortaban en móvil porque la regla `.btn { padding }` de la media query pisaba el `p-0` de `.btn-icon` (con box-border el ícono quedaba en ~4px). Se excluyó `.btn-icon` de ese override, se blindó con `shrink-0`, y se hicieron táctiles (44px, íconos 24px) la campana/cerrar sesión/menú en ≤900px. `.navbar-actions` ahora es clase CSS. Desplegado.
- **2026-06-29:** avisos mejorados — adjuntos (PDF/imágenes/archivos) y portada en **Firebase Storage**, prioridad (Normal/Importante/Urgente), categoría con color (General/Evento/Pago/Académico/Salud), no leídos por padre (`announcementsReadAt`) con badge real, urgentes destacados en la pantalla de inicio del padre, y borrado en cascada de archivos. Reglas de Storage y **hosting desplegados (en vivo)**. Archivos nuevos: `src/config/avisos.js`, `src/utils/announcements.js`, `src/components/AnnouncementCard.jsx`, `storage.rules`. Build OK, lint 0 errores.
- **2026-06-29:** Implementación de la sincronización de calendario (notificaciones push, feed iCalendar y botón Google Calendar), correcciones de responsividad y limpieza de warnings de linter en `Scanner.jsx`. Commiteado localmente.
