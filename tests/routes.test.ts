import { describe, expect, it, vi } from "vitest";

// Sin sesión ni administrador: las rutas deben rechazar antes de tocar datos.
vi.mock("@/lib/server/admin", () => ({ requireAdmin: async () => null }));
vi.mock("@/lib/server/session", () => ({ currentUser: async () => null, requireUser: async () => { const { ApiError } = await import("@/lib/server/errors"); throw new ApiError("Inicia sesión.", 401); } }));

const req = (url: string, init: RequestInit = {}) => new Request(`http://localhost${url}`, init);

describe("rutas de administración", () => {
  it("GET manage → 403 sin admin", async () => {
    const { GET } = await import("@/app/api/admin/manage/route");
    expect((await GET(req("/api/admin/manage?section=overview"))).status).toBe(403);
  });
  it("POST manage con origen ajeno → 403", async () => {
    const { POST } = await import("@/app/api/admin/manage/route");
    const r = await POST(req("/api/admin/manage", { method: "POST", headers: { origin: "https://evil.example", "content-type": "application/json" }, body: JSON.stringify({ action: "hideThanks", id: "abc" }) }));
    expect(r.status).toBe(403);
  });
  it("POST manage mismo origen pero sin admin → 403", async () => {
    const { POST } = await import("@/app/api/admin/manage/route");
    const r = await POST(req("/api/admin/manage", { method: "POST", headers: { origin: "http://localhost", host: "localhost", "content-type": "application/json" }, body: JSON.stringify({ action: "hideThanks", id: "abc" }) }));
    expect(r.status).toBe(403);
  });
});

describe("webhook de donaciones", () => {
  it("rechaza cuerpo sin firma válida", async () => {
    const { POST } = await import("@/app/api/donations/webhook/route");
    const r = await POST(req("/api/donations/webhook", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ event: "transaction.updated", data: {}, signature: { checksum: "x", properties: [] }, timestamp: 1 }) }));
    expect([400, 401, 403, 503]).toContain(r.status);
    expect(r.status).not.toBe(200);
  });
  it("rechaza JSON inválido", async () => {
    const { POST } = await import("@/app/api/donations/webhook/route");
    const r = await POST(req("/api/donations/webhook", { method: "POST", body: "no-json" }));
    expect(r.status).toBeGreaterThanOrEqual(400);
  });
});
