import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { requireFeature, requireTier } from "./middleware";

function jsonReply(value: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => value,
  } as Response;
}

describe("Gate SDK Express middleware", function () {
  it("returns 401 without a token and 403 when the gate denies access", async function () {
    const gateFetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const token = new Headers(init?.headers).get("authorization");
      if (token === "Bearer invalid") return jsonReply({ error: "Wallet verification required" }, 401);
      return jsonReply({
        address: "0x0000000000000000000000000000000000000001",
        tier: 1,
        features: ["basic-scanner"],
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      });
    });
    const app = express();
    app.get("/premium", requireFeature("premium-signals", {
      gateUrl: "https://gate.example", fetch: gateFetch,
    }), (_request, response) => response.json({ ok: true }));
    app.get("/tier-three", requireTier(3, {
      gateUrl: "https://gate.example", fetch: gateFetch,
    }), (_request, response) => response.json({ ok: true }));

    const missing = await request(app).get("/premium");
    expect(missing.status).to.equal(401);
    expect(missing.body.code).to.equal("GATE_UNAUTHORIZED");
    expect(gateFetch).not.toHaveBeenCalled();

    const invalid = await request(app).get("/premium").set("authorization", "Bearer invalid");
    expect(invalid.status).to.equal(401);

    const deniedFeature = await request(app).get("/premium").set("authorization", "Bearer tier-one");
    expect(deniedFeature.status).to.equal(403);
    expect(deniedFeature.body.feature).to.equal("premium-signals");
    const deniedTier = await request(app).get("/tier-three").set("authorization", "Bearer tier-one");
    expect(deniedTier.status).to.equal(403);
  });

  it("attaches validated gate context and allows matching tier/features", async function () {
    const gateFetch = vi.fn(async () => jsonReply({
      address: "0x0000000000000000000000000000000000000002",
      tier: 3,
      features: ["basic-scanner", "premium-signals"],
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    }));
    const app = express();
    app.get("/premium", requireFeature("premium-signals", {
      gateUrl: "https://gate.example", fetch: gateFetch,
    }), (req, response) => response.json(req.mka));

    const response = await request(app).get("/premium").set("authorization", "Bearer tier-three");
    expect(response.status).to.equal(200);
    expect(response.body).to.deep.equal({
      address: "0x0000000000000000000000000000000000000002",
      tier: 3,
      features: ["basic-scanner", "premium-signals"],
    });
  });

  it("fails closed when the gate cannot validate a session", async function () {
    const app = express();
    app.get("/api", requireFeature("basic-scanner", {
      gateUrl: "https://gate.example",
      fetch: vi.fn().mockRejectedValue(new Error("offline")),
    }), (_request, response) => response.json({ ok: true }));

    const response = await request(app).get("/api").set("authorization", "Bearer token");
    expect(response.status).to.equal(503);
    expect(response.body.code).to.equal("GATE_UNAVAILABLE");
  });
});