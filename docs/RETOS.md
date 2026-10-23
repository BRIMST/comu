# Retos entre usuarios (Fase 4)

Solo monedas virtuales, sin valor económico. Antes de activar cualquier mecánica de apuestas, revisa la normativa aplicable en Colombia: esta arquitectura no es garantía de cumplimiento legal.

## Reglas
- Juegos permitidos: **memoria** y **trivia** (se validan con datos del servidor). *Reflejos* queda fuera: el tiempo lo mide el navegador y es manipulable.
- Apuesta: entero de 1 a 500. Cada uno arriesga lo mismo. Nunca más del saldo (se comprueba dentro de la transacción).
- **Custodia**: la apuesta del retador se descuenta al crear; la del invitado, al aceptar. El ganador recibe 2×apuesta (suma cero, sin comisión).
- **Pendiente**: el invitado tiene 24 h. Si rechaza, el retador cancela o caduca → se devuelve la apuesta.
- **Aceptado**: no se puede cancelar. Ambos tienen 24 h para jugar; cada partida dura máx. 120 s (reloj del servidor).
- **Puntuación**: mayor puntaje gana; igualdad = empate (se devuelve a ambos).
- **Abandono**: al vencer el plazo, si solo uno jugó, gana; si nadie jugó, se devuelve a ambos. Una partida iniciada y no enviada vale 0.
- Límites: 10 retos creados/hora, 5 enviados pendientes, 60 acciones/min por usuario. Comprobación de origen (CSRF) en POST.

## Atomicidad y concurrencia
- `wallets/{uid}` solo cambia mediante `applyWalletOp` (`src/lib/server/wallet.ts`): una transacción que valida saldo y registra la clave de la operación en `wallets/{uid}/ops` (idempotencia). El libro `walletTransactions` se escribe solo si no existe.
- Cada cambio de estado del reto es un compare-and-set (`transition`). Los estados transitorios (`funding`, `accepting`, `cancelling`, `settling`) se reanudan si pasan 30 s sin terminar; todos sus pasos son idempotentes.
- No hay cron: la caducidad y la resolución se evalúan al leer o actuar sobre el reto.

## Datos (todo solo-servidor; las reglas niegan lectura/escritura del cliente)
`challenges/{id}`, `challengeSecrets/{id}` (secuencia/respuestas), `userChallenges/{uid}/{id}`, `rateLimits/{uid}/{bucket}`.

## Pruebas
`npm test` — 26 pruebas con un almacén en memoria (`memory-store.ts`) que imita el comportamiento del SDK (primera llamada con caché `null`, reintento con dato real). Cubren aceptación y cancelación simultáneas, doble pago, abandono, empate, caducidad, reanudación tras caída y conservación del total de monedas.
Pendiente: pruebas contra el **emulador de Firebase** (requiere Java) para validar `database.rules.json` con `@firebase/rules-unit-testing`.

## Pendiente / siguiente
- Notificaciones de invitaciones y resultados (Fase 5).
- Contadores de victorias/derrotas y ranking por victorias.
- Topes diarios de recompensas en `/api/games/finish`.

---

# Fase 5: lives, votaciones, notificaciones y misiones

**Rutas**: `/lives`, `/notificaciones`; administración en la sección «Gestión de comunidad» de `/admin`.

**Datos (solo servidor, el cliente no lee ni escribe directo)**: `events`, `polls` (con `voters` y `counts` dentro; votar es una transacción), `announcements`, `communityMissions`, `challengeProposals`, `notifications/{uid}`, `notificationPrefs/{uid}` (categorías silenciadas y lecturas de avisos generales), `siteSettings/channels`, `adminAuditLogs/{adminUid}`.

**Reglas**
- Un voto por cuenta por encuesta (atómico). Los resultados se muestran solo tras votar o al cerrar.
- Eventos, votaciones y avisos generales llegan a todos sin recorrer a cada usuario: se componen al leer (ventana de 14 días) y «leído» se guarda por usuario.
- Notificaciones personales (invitación, aceptación, rechazo, caducidad, resultado, nivel): clave única por evento, nunca duplicadas. Las categorías silenciadas no se muestran ni se crean. Un fallo al notificar no afecta al reto.
- Enlaces de eventos y canales: solo `https://`. No se inventa ninguna integración con TikTok ni YouTube.
- Misiones comunitarias: el progreso lo registra un administrador (no hay verificación externa), por eso **no entregan monedas ni XP**.
- Propuestas de retos: 3 por día por usuario.
- Toda acción de administración exige rol verificado en el servidor (`users/{uid}/role === "admin"` o claim) y queda en `adminAuditLogs`.

**Índices** añadidos en `database.rules.json` (`createdAt`/`startsAt`) para las consultas ordenadas.
