// Humo responsive: abre páginas públicas en 360/768/1280 px y falla si hay scroll horizontal o errores de página.
// Uso: (con `npm run start` activo) BASE=http://localhost:3000 node scripts/smoke.mjs   — requiere playwright instalado.
import { chromium } from "playwright";
const BASE = process.env.BASE ?? "http://localhost:3000";
const PAGES = ["/", "/login", "/registro", "/apoyar", "/terminos", "/privacidad", "/ranking", "/comunidad"];
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
let bad = 0;
for (const w of [360, 768, 1280]) {
  const page = await browser.newPage({ viewport: { width: w, height: 800 } });
  const errors = []; page.on("pageerror", (e) => errors.push(e.message));
  for (const p of PAGES) {
    errors.length = 0;
    const res = await page.goto(BASE + p, { waitUntil: "networkidle" });
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    const ok = (res?.status() ?? 0) < 500 && over <= 1 && errors.length === 0;
    if (!ok) bad++;
    console.log(`${ok ? "OK " : "FALLA"} ${w}px ${p} status=${res?.status()} desborde=${over}px ${errors.join("|")}`);
  }
  await page.close();
}
await browser.close();
process.exit(bad ? 1 : 0);
