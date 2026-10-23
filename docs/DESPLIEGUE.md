# Despliegue a producción (Vercel + Firebase)

## 1. Firebase
1. Crea un proyecto, activa **Authentication** (correo/contraseña) y **Realtime Database** (región cercana).
2. Publica las reglas: `npx firebase-tools deploy --only database` (usa `database.rules.json`). Todas las reglas son «solo servidor»: el navegador no escribe nada directamente; las lecturas permitidas son perfiles propios/públicos y datos públicos mínimos.
3. Crea una cuenta de servicio (Configuración → Cuentas de servicio → Generar clave). Codifícala: `base64 -w0 clave.json` y pégala en `FIREBASE_SERVICE_ACCOUNT_BASE64`. **Nunca** la subas al repositorio ni la envíes por chat. Si una clave se filtró, revócala y genera otra.
4. Autoriza el dominio de producción en Authentication → Configuración → Dominios autorizados.

## 2. Vercel
1. Importa el repositorio. Framework: Next.js. Node 20.9+.
2. Variables de entorno: todas las de `.env.example` (Production y Preview según convenga). `SITE_URL` = `https://tu-dominio`.
3. Despliega. Comprueba `GET /api/health` (`phase: 7`, integraciones en `true`).

## 3. Primer administrador
En la consola de Firebase, en `users/{uid}/role` escribe `admin` para tu propio uid (o usa custom claims `admin: true`). Es la única vez que se hace a mano; después nadie puede otorgar roles desde la plataforma.

## 4. Donaciones (opcional)
- `DONATIONS_PROVIDER=none`: `/apoyar` informa que los aportes no están habilitados.
- `manual`: muestra tus instrucciones; tú registras cada aporte verificado en Admin → Donaciones.
- `wompi`: configura `WOMPI_PUBLIC_KEY`, `WOMPI_INTEGRITY_SECRET`, `WOMPI_EVENTS_SECRET` y en el panel de Wompi registra la URL de eventos `https://tu-dominio/api/donations/webhook`. Un aporte solo pasa a «confirmado» tras evento firmado y verificación contra la API de Wompi. **Prueba primero en el entorno sandbox** y haz una transacción de prueba completa antes de abrirlo al público.
- Las donaciones son voluntarias y no dan monedas, XP ni ventajas. Las monedas del juego son virtuales y no tienen valor monetario.

## 5. Lista de verificación previa a abrir
- [ ] Reglas publicadas y probadas (`npm test`; opcional con emulador, ver docs/OPERACIONES.md).
- [ ] Clave de cuenta de servicio rotada si alguna vez estuvo en un archivo compartido.
- [ ] Textos legales (`/terminos`, `/privacidad`) revisados por un abogado colombiano; son borradores.
- [ ] Interruptor «Retos con monedas» en el estado deseado. **Revisa la normativa colombiana de juegos de suerte y azar/apuestas (Coljuegos, Ley 643 de 2001) antes de habilitar retos con monedas.** Esta arquitectura no constituye cumplimiento legal.
- [ ] Probado registro, login, partida, reto 1v1, compra, aporte de prueba, suspensión y exportación/borrado de cuenta.
- [ ] Rotación de claves: cambia `WOMPI_*` o la cuenta de servicio en Vercel y vuelve a desplegar.

## 6. Seguridad
Cabeceras básicas en `next.config.ts` (HSTS, nosniff, DENY frames, Referrer-Policy, Permissions-Policy). No hay Content-Security-Policy estricta: requeriría nonces en middleware; queda como mejora recomendada.
