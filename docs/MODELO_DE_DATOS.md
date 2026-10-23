# Modelo de datos (Realtime Database)

Todos los nodos son **solo servidor** (Admin SDK) salvo lectura de `profiles/{uid}` y `users/{uid}` por su dueño y de `publicProfiles`, `usernames`, `achievements`. Índices `.indexOn` en `database.rules.json`.

| Nodo | Contenido |
|---|---|
| `users/{uid}` | email, role, suspended, suspension{reason,at,by}, createdAt |
| `usernames/{nombre}` | uid, username |
| `profiles/{uid}` | displayName, bio, avatar, xp, level, privacidad (showInRanking/showStats/showBadges/showActivity) |
| `publicProfiles/{uid}` | copia pública permitida por privacidad |
| `wallets/{uid}` | balance, ops (claves de idempotencia) |
| `walletTransactions/{uid}/{id}` | libro inmutable: amount, type, description, createdAt |
| `playerStats/{uid}`, `playerEvents/{uid}/{clave}`, `dailyCaps`, `xpLog` | estadísticas, eventos idempotentes, topes diarios |
| `missions`, `communityMissions`, `userAchievements`, `customBadges`, `inventory` | misiones, logros, insignias del equipo, colección |
| `leaderboards/{weekly/YYYY-Www, alltime, wins, reaction, active}`, `weeklyChampions` | rankings |
| `challenges`, `challengeSecrets`, `challengeProposals`, `userChallenges` | retos 1v1 (resultados oficiales solo en servidor; secretos nunca al cliente) |
| `polls`, `events`, `announcements`, `notifications`, `notificationPrefs`, `activity`, `communityFeed` | interacción |
| `donations`, `donationGoals`, `donationThanks`, `donationEvents`, `goalDonations`, `userDonations`, `manualReferences` | donaciones (separadas del juego) |
| `reports`, `reportDedupe` | reportes de usuarios |
| `auditFeed`, `adminAuditLogs/{admin}`, `adminBonuses` | auditoría y bonificaciones |
| `metrics/totals`, `metrics/days/{dia}` | contadores agregados sin datos personales |
| `siteSettings` | name, features, gameConfig, donationInfo |
| `rateLimits`, `deletedAccounts` | límites de uso y tombstones de cuentas borradas |
