import "dotenv/config";
import express, { Express } from "express";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { requireFeature } from "@mka/gate-sdk/server";

export interface GatedAppOptions {
  gateUrl?: string;
  gateFetch?: typeof fetch;
}

export function createGatedApp(options: GatedAppOptions = {}): Express {
  const app = express();
  app.use(express.json({ limit: "8kb" }));

  const gateOptions = {
    gateUrl: options.gateUrl,
    fetch: options.gateFetch,
    cacheMs: 1_000,
  };

  app.get("/api/scanner/basic", requireFeature("basic-scanner", gateOptions), (_request, response) => {
    response.json({
      source: "MOCK DATA",
      feature: "basic-scanner",
      label: "Example scanner response (not live market data)",
      items: [{ symbol: "MOCK-1", signal: "DEMO ONLY" }],
    });
  });

  app.get("/api/signals/premium", requireFeature("premium-signals", gateOptions), (_request, response) => {
    response.json({
      source: "MOCK DATA",
      feature: "premium-signals",
      label: "Example premium route response (not a recommendation)",
      items: [{ id: "mock-signal-1", status: "DEMO ONLY" }],
    });
  });

  return app;
}

async function main(): Promise<void> {
  const port = Number(process.env.PORT ?? 3002);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("PORT must be a valid TCP port");
  }
  const gateUrl = process.env.GATE_URL ?? "http://localhost:3001";
  createGatedApp({ gateUrl }).listen(port, () => {
    console.log(`Mock gated app API listening on port ${port}`);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(() => {
    console.error("Gated app server failed to start; check its local testnet configuration.");
    process.exitCode = 1;
  });
}