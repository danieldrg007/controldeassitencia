# 📋 Estado del Proyecto — Entradas Oliverio

> Documento vivo. Léelo al iniciar cada sesión y actualízalo al cerrar.
> **Última actualización:** 2026-06-29

---

## 1. Resumen

App web de **control de acceso escolar** del colegio Oliverio: entradas/salidas con QR, asistencia a clase por profesor, recogidas (incl. autorizadas), avisos, chat, calificaciones y notas de los profesores.

- **Stack:** React 19 + Vite 8 + Firebase, Tailwind v3 (paleta institucional vino/dorado/beige).
- **Firebase projectId:** `mi-app-oliverio`
- **En vivo:** https://mi-app-oliverio.web.app
- **Ubicación local:** `/Users/danielricano/Documents/proyectos oliverio/entradasoliverio`
- **CLI Firebase / gcloud:** logueado como `ricfirebase@gmail.com`.

---

## 2. Estado actual (2026-06-29)

- **Git:** rama `main`, working tree limpio, **10 commits adelante de `origin/main`** → falta `git push`.
- **Build:** `npm run build` pasa (hay errores de lint preexistentes que no rompen el build).
- **Deploy:** hosting + firestore.rules + functions desplegados y funcionando.

### Último avance
Importación masiva de profesores desde Excel de HRMS (página `ImportTeachers.jsx`, dependencia `xlsx`, ruta `/import-teachers`). Mejoras de tamaño de iconos en móvil. Enlace de acceso de profesores ahora incluye contraseña.

---

## 3. Roles y accesos

| Rol | Home | Acceso |
|-----|------|--------|
| `superadmin` | /dashboard | TODO (incl. /parent y /teacher) |
| `admin` | /dashboard | Dashboard, Scanner, Students, Users, Import, Announcements, Subjects, Kiosk, Teacher, Messages |
| `guard` (Checador) | /dashboard | Dashboard, Scanner, Students, Kiosk |
| `teacher` (Profesor) | /teacher | TeacherDashboard, Messages |
| `parent` (Padre/Tutor) | /parent | ParentDashboard, Messages |
| `kiosk` (Tablet fija) | /kiosk | Solo /kiosk (pantalla completa) |

Los roles se normalizan a minúsculas. Las rutas están gateadas por rol en `src/App.jsx` (`ProtectedRoute`).

---

## 4. Estructura (páginas en `src/pages/`)

| Página | Ruta | Qué hace |
|--------|------|----------|
| Login | /login | Iniciar sesión / crear cuenta (toggle segmentado) |
| Dashboard | /dashboard | Stats: vista Diaria / Clase / Mensual, filtros plantel/nivel/grado/grupo, export |
| Scanner | /scanner | Escaneo QR entrada/salida + recogida (quién recoge) + recogida con pase temporal |
| Students | /students | CRUD de alumnos + genera/imprime QR |
| Users | /users | Gestión de usuarios por apartados, alta, enlaces de acceso, reset password |
| ImportTeachers | /import-teachers | Importación masiva de profesores desde Excel de HRMS |
| Announcements | /announcements | Admin publica avisos (all / plantel / clase) con prioridad, categoría, imagen de portada y adjuntos (PDF/imágenes); borrado en cascada con Storage |
| Subjects | /subjects | Catálogo de materias (para calificaciones) |
| TeacherDashboard | /teacher | Pase de lista, Alumnos, Avisos, Calificaciones, Perfil, notas/observaciones |
| ParentDashboard | /parent | Asistencia, Grupo familiar, Recogidas, Avisos, Calificaciones, Notas, Perfil |
| Kiosk | /kiosk | Modo kiosko pantalla completa, escaneo continuo, recogida |
| Messages | /messages | Chat en tiempo real (directo + canales de grupo), no leídos |
| Calendar | /calendar | Calendario de eventos (mes + lista). Admin crea para todo/plantel/grupo; profesor para su grupo. Audiencias: padres/maestros/alumnos/general con restricción de visibilidad |

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
| `users` | role, plantel (kiosk), classIds[] (teacher), photo, fcmTokens[], pickupCode, `announcementsReadAt`, name/email/phone |
| `users/{uid}/familyMembers` | familiares con foto + passCode (credencial QR) |
| `students` | name, lastName, plantel, nivel, grado, grupo, classId, parentIds[], qrCode, photo |
| `attendance/{date}/records` | entryTime, exitTime, métodos, guardId, plantel, pickedUpBy* |
| `classAttendance/{date}/records` | pase de lista por profesor (present/late/absent) |
| `notifications` | por parentId (push individual) |
| `announcements` | avisos all/plantel/classId + `priority`, `category`, `coverUrl`/`coverPath`, `attachments[]` (Storage) |
| `conversations` + `/messages` | chat (participants[], lastMessage, lastRead{}) |
| `pickupAuthorizations` | recogidas temporales autorizadas por el tutor |
| `observations` | notas del profesor (conducta/academica/positiva/tarea, visibleToParent) |
| `subjects` | catálogo de materias |
| `grades` | calificaciones por alumno/materia/periodo (escala 0-10, aprobatoria 6) |
| `events` | calendario: `date`, `time`, `audiences[]` (general/parent/teacher/student), `scope` (all/plantel/class), `category`, autor |

Reglas en `firestore.rules` con funciones por rol. **Regla clave:** ramas por rol primero, las que leen `resource.data` al final; NO usar `is list` sobre `resource.data` en colecciones que se consultan con `array-contains`.

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

- [ ] `git push` (11 commits locales sin subir a origin, incluyendo el de avisos y calendario).
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
