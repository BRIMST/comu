import { mergeFeatures, type Feature } from "../domain/features";
import { mergeGameConfig } from "../domain/game-config";
import { ApiError } from "./errors";
import type { Store } from "./store";

export const getFeatures = async (store: Store) => mergeFeatures(await store.get("siteSettings/features"));
export const getGameConfig = async (store: Store) => mergeGameConfig(await store.get("siteSettings/gameConfig"));

/** Interruptor de emergencia: bloquea la acción si un administrador apagó la función. */
export async function assertFeature(store: Store, feature: Feature) {
  if (!(await getFeatures(store))[feature]) throw new ApiError("Esta función está desactivada temporalmente por el equipo.", 503);
}
