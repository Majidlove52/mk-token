import express from "express";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { createGatedApp } from "../server";

const servers: Array<ReturnType<ReturnType<typeof express> ["listen"]>> = [];

async function startMockGate(): Promise<string> {
  const gate = express();
  gate.get("/session", (req, res) => {
    const token = req.header("authorization");
    if (!token || token === "Bearer invalid") {
      res.status(401).json({ error: "Wallet verification required" });
      return;
    }

    const snapshots: Record<string, { tier: number; features: string[] }> = {
      "Bearer tier-zero": { tier: 0, features: [] },
      "Bearer tier-one": { tier: 1, features: ["basic-scanner"] },
      "Bearer tier-two": { tier: 2, features: ["basic-scanner", "advanced-indicators"] },
      "Bearer tier-three": { tier: 3, features: ["basic-scanner", "advanced-indicators", "premium-signals"] },
    };
    const snapshot = snapshots[token];
    if (!snapshot) {
      res.status(401).json({ error: "Unknown mock token" });
      return;
    }
    res.json({
      address: "0x0000000000000000000000000000000000000001",
      ...snapshot,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
  });
  const server = gate.listen(0);
  servers.push(server);
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  })));
});

describe("Gated app API routes", function () {
  it("rejects requests without a session and denies tiers without the feature", async function () {
    const gateUrl = await startMockGate();
    const app = createGatedApp({ gateUrl });

    const missing = await request(app).get("/api/scanner/basic");
    expect(missing.status).to.equal(401);

    const belowTier = await request(app).get("/api/scanner/basic")
      .set("authorization", "Bearer tier-zero");
    expect(belowTier.status).to.equal(403);
    expect(belowTier.body.code).to.equal("GATE_FORBIDDEN");

    const belowPremium = await request(app).get("/api/signals/premium")
      .set("authorization", "Bearer tier-two");
    expect(belowPremium.status).to.equal(403);
  });

  it("returns clearly labeled mock payloads at or above the required tiers", async function () {
    const gateUrl = await startMockGate();
    const app = createGatedApp({ gateUrl });

    const basic = await request(app).get("/api/scanner/basic")
      .set("authorization", "Bearer tier-one");
    expect(basic.status).to.equal(200);
    expect(basic.body.source).to.equal("MOCK DATA");
    expect(basic.body.feature).to.equal("basic-scanner");

    const premium = await request(app).get("/api/signals/premium")
      .set("authorization", "Bearer tier-three");
    expect(premium.status).to.equal(200);
    expect(premium.body.source).to.equal("MOCK DATA");
    expect(premium.body.feature).to.equal("premium-signals");
  });
});