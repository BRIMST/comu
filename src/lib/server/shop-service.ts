import { CATALOG, DEFAULTS, isDefaultItem, itemById, type Slot } from "../domain/progress";
import { ApiError } from "./errors";
import type { createProgressService } from "./progress-service";
import type { Store } from "./store";
import { bump } from "./metrics";
import { assertFeature } from "./settings";
import { applyWalletOp } from "./wallet";

type Progress = ReturnType<typeof createProgressService>;

export function createShopService({ store, progress, clock = Date.now }: { store: Store; progress: Progress; clock?: () => number }) {
  async function state(uid: string) {
    const [inv, prof, ach, wallet] = await Promise.all([
      store.get<Record<string, unknown>>(`inventory/${uid}`),
      store.get<{ level?: number; equipped?: Partial<Record<Slot, string>> }>(`profiles/${uid}`),
      store.get<Record<string, unknown>>(`userAchievements/${uid}`),
      store.get<{ balance?: number }>(`wallets/${uid}`),
    ]);
    return { inv: inv ?? {}, level: Number(prof?.level ?? 1), equipped: prof?.equipped ?? {}, ach: ach ?? {}, balance: Number(wallet?.balance ?? 0) };
  }

  async function catalog(uid: string) {
    const st = await state(uid);
    const items = CATALOG.map((i) => {
      const owned = isDefaultItem(i.id) || !!st.inv[i.id];
      const equipped = (st.equipped[i.slot] ?? DEFAULTS[i.slot]) === i.id;
      let lockedReason: string | null = null;
      if (!owned) {
        if (i.requires?.achievement && !st.ach[i.requires.achievement]) lockedReason = "Se desbloquea con una insignia";
        else if (i.requires?.level && st.level < i.requires.level) lockedReason = `Requiere nivel ${i.requires.level}`;
      }
      return { id: i.id, slot: i.slot, name: i.name, desc: i.desc, price: i.price, css: i.css ?? null, emoji: i.emoji ?? null, owned, equipped, lockedReason, buyable: !owned && i.price > 0 && !i.requires?.achievement && !lockedReason };
    });
    return { balance: st.balance, items, owned: items.filter((i) => i.owned).length };
  }

  async function buy(uid: string, itemId: string) {
    await assertFeature(store, "shop");
    const item = itemById(itemId);
    if (!item) throw new ApiError("Elemento no encontrado.", 404);
    const st = await state(uid);
    if (isDefaultItem(item.id) || st.inv[item.id]) throw new ApiError("Ya tienes este elemento.", 409);
    if (item.requires?.achievement) throw new ApiError("Este elemento se obtiene al desbloquear una insignia.", 400);
    if (item.requires?.level && st.level < item.requires.level) throw new ApiError(`Requiere nivel ${item.requires.level}.`, 400);
    if (item.price <= 0) throw new ApiError("Este elemento no está a la venta.", 400);
    const res = await applyWalletOp(store, uid, `shop:${uid}:${item.id}`, -item.price, "shop_purchase", `Colección: ${item.name}`, { itemId: item.id }, clock());
    if (res === "insufficient") throw new ApiError("No tienes monedas suficientes.", 400);
    // "applied" o "duplicate" (cobro previo interrumpido): en ambos casos se entrega el elemento una sola vez.
    await progress.giveItem(uid, item.id, "purchase");
    if (res === "applied") await bump(store, clock(), "purchases");
    await progress.refreshAchievements(uid);
  }

  async function equip(uid: string, slot: Slot, itemId: string | null) {
    if (!["frame", "theme", "title"].includes(slot)) throw new ApiError("Ranura no válida.");
    if (itemId === null || itemId === DEFAULTS[slot]) { await store.set(`profiles/${uid}/equipped/${slot}`, null); return; }
    const item = itemById(itemId);
    if (!item || item.slot !== slot) throw new ApiError("Elemento no válido para esa ranura.");
    const st = await state(uid);
    if (!isDefaultItem(item.id) && !st.inv[item.id]) throw new ApiError("Todavía no tienes este elemento.", 403);
    await store.set(`profiles/${uid}/equipped/${slot}`, item.id);
  }

  return { catalog, buy, equip };
}
