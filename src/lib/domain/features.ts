export const FEATURES = ["games", "challenges", "shop", "donations", "registrations"] as const;
export type Feature = (typeof FEATURES)[number];
export const FEATURE_LABEL: Record<Feature, string> = {
  games: "Minijuegos",
  challenges: "Retos entre usuarios",
  shop: "Colección (compras con monedas)",
  donations: "Donaciones",
  registrations: "Registro de cuentas nuevas",
};
/** Todas las funciones están activas salvo que un administrador las apague (interruptor de emergencia). */
export function mergeFeatures(raw: unknown): Record<Feature, boolean> {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return Object.fromEntries(FEATURES.map((f) => [f, r[f] !== false])) as Record<Feature, boolean>;
}
