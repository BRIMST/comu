import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/** Prueba estática: todos los nodos sensibles son de solo-servidor y los índices necesarios existen. */
const rules = JSON.parse(readFileSync(path.resolve(__dirname, "../database.rules.json"), "utf8")).rules as Record<string, Record<string, unknown>>;

const SERVER_ONLY = [
  "wallets", "walletTransactions", "challenges", "challengeSecrets", "challengeProposals", "donations", "donationEvents", "goalDonations", "userDonations",
  "manualReferences", "reports", "reportDedupe", "auditFeed", "adminAuditLogs", "adminBonuses", "metrics", "rateLimits", "deletedAccounts", "customBadges",
  "communityFeed", "playerEvents", "playerStats", "dailyCaps", "xpLog", "inventory",
];

describe("database.rules.json", () => {
  it("la raíz está cerrada", () => {
    expect(rules[".read"]).toBe(false);
    expect(rules[".write"]).toBe(false);
  });
  it.each(SERVER_ONLY)("%s no es accesible desde el navegador", (node) => {
    const r = rules[node];
    expect(r, `falta ${node}`).toBeDefined();
    expect(r[".write"]).not.toBe(true);
    expect(r[".read"]).not.toBe(true);
  });
  it("ningún nodo permite escritura de clientes", () => {
    const walk = (o: unknown, p: string) => {
      if (!o || typeof o !== "object") return;
      for (const [k, v] of Object.entries(o)) {
        if (k === ".write") expect(v, `${p}/.write`).toBe(false);
        else walk(v, `${p}/${k}`);
      }
    };
    walk(rules, "");
  });
  it("los nodos listados por orderBy tienen índice", () => {
    for (const n of ["auditFeed", "communityFeed", "reports", "customBadges", "donations", "donationGoals", "donationThanks"]) {
      expect(JSON.stringify(rules[n][".indexOn"])).toContain("createdAt");
    }
  });
});
