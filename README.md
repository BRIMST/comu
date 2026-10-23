# El Refugio — fases 1 a 7

Aplicación Next.js App Router + TypeScript estricto + Tailwind CSS, preparada para Vercel y Firebase Authentication / Realtime Database.

## Estado (fases 1–7)
Comunidad, minijuegos, retos 1v1 con monedas virtuales, interacción (votaciones, lives, eventos, notificaciones), donaciones voluntarias (Wompi verificado en servidor o registro manual), panel de administración por pestañas (métricas, interruptores, usuarios, reportes, insignias, donaciones, auditoría), cuenta (exportar/eliminar) y páginas legales (borradores). Guías: `docs/DESPLIEGUE.md`, `docs/OPERACIONES.md`, `docs/MODELO_DE_DATOS.md`, `docs/RETOS.md`, `docs/FASE2.md`. Variables: `.env.example`. Pruebas: `npm test`.
**No probado contra Firebase ni Wompi reales desde este entorno.** Los textos legales requieren revisión profesional.

## Estado honesto (histórico de fases 1–3)

- **Fase 1:** base Next.js, layout responsive, Firebase cliente/Admin, registro, login, verificación por correo, recuperación de contraseña, cookie de sesión HTTP-only, API de salud y reglas iniciales de RTDB.
- **Panel de administración (configuración inicial):** el nombre visible de la comunidad se cambia en `/admin`; la API exige rol `admin` en custom claims (`admin: true` o `role: "admin"`) o en `users/{uid}/role`. Los cambios quedan en `siteSettings` y se registra auditoría. Para habilitarlo, asigna el rol desde un entorno de confianza; nunca permitas que un usuario se lo asigne a sí mismo.
- **Fase 2:** estructura de perfil editable y privacidad, monedero de solo lectura para usuario, cálculo de niveles, colección de insignias (catálogo inicial) y ranking conectado a RTDB si hay datos.
- **Fase 3:** tres minijuegos jugables (reflejos, memoria visual y trivia), sesiones creadas en servidor, respuestas validadas, y recompensas con control de sesión de un solo uso. La medición de reflejos tiene solo controles básicos anti-trampas.
- La UI de actividad y ranking incluye algunos datos expresamente marcados como demostrativos; no son usuarios reales.
- La app requiere credenciales Firebase propias para habilitar autenticación y persistencia real. No se ha desplegado a Vercel desde este entorno.

## Requisitos

Node.js 20.9+ (recomendado Node 22), npm y un proyecto Firebase propio.

## Ejecutar localmente

```bash
cp .env.example .env.local
# Rellena las variables de Firebase indicadas más abajo
npm install
npm run dev
```

Abre http://localhost:3000. `GET /api/health` muestra si están presentes las variables necesarias.

## Firebase setup

1. En Firebase Console crea un proyecto.
2. En Authentication → Sign-in method activa Email/Password y configura plantillas de verificación/restablecimiento.
3. En Realtime Database crea la base y copia su URL a `NEXT_PUBLIC_FIREBASE_DATABASE_URL`.
4. En Project settings → Your apps registra una app web y copia los valores `apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, `appId` al `.env.local` con prefijo `NEXT_PUBLIC_FIREBASE_`.
5. Crea una cuenta de servicio de Firebase Admin, descarga el JSON en un lugar seguro, conviértelo a Base64 y asigna el resultado a `FIREBASE_SERVICE_ACCOUNT_BASE64`. No lo subas a Git. En macOS/Linux: `base64 -w 0 service-account.json` (en macOS usa `base64 service-account.json | tr -d '
'`).
6. Publica las reglas: `npx firebase-tools deploy --only database --project TU_PROJECT_ID` tras instalar Firebase CLI y haber iniciado sesión, o pega `database.rules.json` en la consola.
7. En Authentication → Settings → Authorized domains agrega `localhost` para desarrollo y tu dominio de Vercel para producción.

## Variables de entorno

Ver `.env.example`. La configuración pública Firebase de navegador no es secreta, pero el acceso a datos se protege con Rules. `FIREBASE_SERVICE_ACCOUNT_BASE64` es exclusivamente servidor y jamás debe llevar el prefijo `NEXT_PUBLIC_`.

## Estructura

```text
src/app/                 rutas y API handlers
src/components/          navegación y shell responsive
src/lib/firebase/        SDK cliente
src/lib/server/          Admin SDK y sesiones seguras
src/lib/domain/          cálculos de progresión y tests
 database.rules.json      reglas RTDB deny-by-default
```

## Modelo RTDB inicial

- `users/{uid}`: email, role, createdAt, termsAcceptedAt (privado; solo servidor escribe).
- `siteSettings/siteName`: nombre visible de la comunidad y `updatedAt`; lectura pública del nombre, escritura solo desde API administrativa.
- `adminAuditLogs/{uid}/{timestamp}`: registro de cambios administrativos; escritura solo desde servidor.
- `usernames/{username}`: uid y nombre reservado; transacción para impedir duplicados.
- `profiles/{uid}`: perfil completo y preferencias privadas; legible solo por su propietario a través de Rules.
- `publicProfiles/{uid}`: subconjunto explícitamente público y filtrado por preferencias; no contiene email, wallet ni ajustes privados.
- `wallets/{uid}`: balance, updatedAt. Escritura solo servidor.
- `walletTransactions/{uid}/{transactionId}`: amount, type, description, createdAt; historial inmutable desde el cliente.
- `leaderboards/weekly/{uid}`: username y XP agregada por proceso confiable.
- `gameSessions/{sessionId}`: uid, tipo, estado, marcas de tiempo, reto privado y resultado; solo servidor escribe.
- `gameResults` (siguiente iteración): historial normalizado de resultados validados.
- `achievements/{achievementId}`: catálogo público administrado por servidor.
- `userAchievements/{uid}/{achievementId}`: fecha de desbloqueo.
- Extensiones previstas para fases siguientes: `gameSessions`, `gameResults`, `challenges`, `challengeInvitations`, `inventory`, `missions`, `polls`, `events`, `notifications`, `donations`, `donationGoals`, `reports`, `adminAuditLogs`.

Los índices `orderByChild` se deben declarar en las reglas cuando se habiliten las listas definitivas. No se confía en saldo, rol o resultados enviados por navegador. El Admin SDK omite las Rules, así que cada endpoint servidor debe verificar identidad, autorización y validar con Zod.

## Reglas de seguridad / pruebas

`database.rules.json` niega lectura/escritura global y permite solo las lecturas necesarias; las escrituras se canalizan por Admin SDK en handlers autenticados. Antes de producción, revisar cuidadosamente qué perfiles deben ser públicos, añadir límites de solicitudes persistentes (por ejemplo App Check + limitador con almacenamiento compartido), configurar alertas y respaldos. Admin SDK ignora Realtime Database Rules.

Comandos:

```bash
npm run typecheck
npm run test
npm run build
```

El test de progresión cubre umbrales, valores negativos y porcentaje. Para probar Rules con seguridad, usar Firebase Emulator Suite y casos de lectura anónima, lectura de wallet ajena y cualquier escritura cliente a `wallets`, `users.role`, `gameResults` y `adminAuditLogs` (deben denegarse). Las pruebas integrales requieren credenciales/emulador configurados.

## Despliegue en Vercel

1. Sube el proyecto a un repositorio Git privado/público de tu elección.
2. Importa el repositorio en Vercel como Next.js.
3. Configura las variables de `.env.example` en Project Settings → Environment Variables (Production/Preview/Development según aplique).
4. Despliega y agrega el dominio a los dominios autorizados de Firebase Auth.
5. Prueba `/api/health`, registro, verificación, inicio/cierre de sesión y lectura del perfil con cuentas de prueba.

## Limitaciones pendientes antes de producción

- Implementar CSRF/origin checks completos y rate limiting persistente en endpoints sensibles.
- Terminar política legal/privacidad y flujo de eliminación de cuenta.
- Endurecer la idempotencia de las recompensas y su atomicidad entre wallet, historial y XP; ahora se reclama la sesión antes de actualizar cada registro.
- Fortalecer antitrampas de reflejos; el cliente puede manipular sus mediciones.
- Ampliar reglas y pruebas de Emulator Suite para el modelo completo.
- Verificar variables/credenciales reales y compilar con dependencias instaladas en el entorno de destino.
- Las rutas `/juegos` y `/retos` son estados informativos, no funcionalidades completadas.
