# Fase 2: perfiles, progresión, insignias, colección y rankings

## Cómo fluye el progreso
Toda actividad entra por `progress-service.recordEvent(uid, evento)` (partida, reto resuelto, voto, perfil completado). Es **idempotente por clave de evento** (`playerEvents/{uid}/{key}`): un reintento nunca repite XP ni estadísticas. Pasos: estadísticas y racha → recompensa base con **tope diario** → bonos de racha → clasificaciones → misiones → insignias.

## Anti-abuso
- Tope diario por partidas: **200 XP y 100 🪙** (se renueva a medianoche, hora de Colombia). Las misiones, insignias y rachas son únicas y están acotadas por su definición.
- Las monedas siempre pasan por `applyWalletOp` (atómico, idempotente, libro inmutable).
- Las monedas de los retos se mueven entre jugadores; no se crean.
- Las donaciones no dan XP, monedas ni ventajas.
- Limitación conocida: el tiempo de *Prueba de reflejos* lo mide el navegador (se valida un rango y que no sea anterior a la señal). Por eso no se usa en retos con monedas, pero sí aparece en el ranking de reflejos y su insignia. Para endurecerlo haría falta medición del lado servidor con latencia.

## Misiones
Diarias (3 de 5) y semanales (3 de 4), iguales para todos y deterministas por fecha/semana. Recompensan una sola vez (clave `mission:{periodo}:{id}`).

## Rachas
Un día cuenta con la primera actividad del día. Bonos de XP a los 3, 7, 14 y 30 días. Se pierde si pasa un día sin actividad.

## Insignias (12) y colección
Definidas en `src/lib/domain/progress.ts`. Algunas desbloquean elementos (marco «Llama de racha», títulos). Los elementos cosméticos se compran **solo con monedas virtuales**, no se venden ni transfieren. Catálogo: marcos, temas y títulos; algunos exigen nivel o insignia.

## Rankings
Semanal (clave `AAAA-Wss`, lunes a domingo): una tabla nueva cada semana; **nada se borra**. Además: experiencia total, mejores reflejos, victorias en retos, más activos y campeones históricos (podio congelado de cada semana terminada; el primero recibe la insignia «Campeón semanal» una sola vez). Quien oculta su perfil no aparece. Las tablas internas (`leaderboards`) no son legibles desde el cliente: todo sale por `/api/ranking`.

## Privacidad del perfil
Cuatro opciones: aparecer en rankings, estadísticas, insignias y actividad. El dueño siempre lo ve todo; el saldo nunca es público. `/api/profile/[username]` calcula la vista pública aplicando esas opciones.

## Datos nuevos (solo servidor)
`playerStats`, `playerEvents`, `dailyCaps`, `missions`, `xpLog`, `activity`, `inventory`, `weeklyChampions`, `leaderboards/{weekly/{semana},alltime,wins,reaction,active}`. Índices añadidos en `database.rules.json`.

## Pendiente
- Medición de reflejos del lado servidor.
- Las pruebas de reglas contra el emulador de Firebase (requiere Java).
- `/comunidad` sigue mostrando datos de demostración.
