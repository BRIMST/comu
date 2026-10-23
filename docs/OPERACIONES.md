# Operaciones

## Copias de seguridad
- Firebase Console → Realtime Database → ⋮ → *Exportar JSON* (manual), o `node scripts/backup.mjs backups` (ver cabecera del script). Los archivos contienen datos personales: cifrar y guardar fuera del repo.
- Restaurar: Console → ⋮ → *Importar JSON* (en un nodo vacío o de prueba primero). Verifica `wallets` frente a `walletTransactions` tras restaurar.

## Incidentes
| Situación | Acción |
|---|---|
| Sospecha de fraude con monedas | Admin → Resumen → desactivar «Retos con monedas» (con motivo). Revisar Auditoría y el libro de movimientos del usuario. |
| Abuso de un usuario | Admin → Usuarios → Suspender (bloquea sesión y juego). Reportes → resolver con nota. |
| Registro masivo | Desactivar «Registros»; el límite por IP (5/h) sigue activo. |
| Pasarela con fallos | Poner `DONATIONS_PROVIDER=none` en Vercel y redeploy; los aportes pendientes se reconcilian al volver. |
| Clave filtrada | Revocar en Google Cloud/Wompi, generar nueva, actualizar Vercel, redeploy. |

## Pruebas
- `npm test`: servicios de dominio (retos, progreso, donaciones, administración), rutas (401/403, origen, firma de webhook) y análisis estático de reglas.
- Emulador (opcional): `npx firebase emulators:exec --only database "npm test"` con `@firebase/rules-unit-testing` para pruebas de reglas reales.
- `npm run build` y `npm run lint` antes de cada despliegue.

## Moderación de contenido
Los perfiles tienen reportes (`/perfil/{usuario}` → Reportar). Los administradores pueden borrar bio, restablecer nombre/avatar y suspender. Cada acción queda en Auditoría.
