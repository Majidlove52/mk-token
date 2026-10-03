import { randomBytes } from "node:crypto";
import cors from "cors";
import express, { Express } from "express";
import { rateLimit } from "express-rate-limit";
import { formatUnits, getAddress, isAddress, verifyMessage, ZeroAddress } from "ethers";
import {
  ACCESS_SESSION_TTL_MS,
  DEFAULT_CORS_ORIGIN,
  NONCE_TTL_MS,
  TIER_FEATURES,
} from "../config";

export interface StakingSnapshot {
  tier: number;
  stakedWei: bigint;
}

export interface GateDependencies {
  readStaking(address: string): Promise<StakingSnapshot>;
  corsOrigin?: string;
  now?: () => number;
  nonceGenerator?: () => string;
  sessionGenerator?: () => string;
}

interface NonceChallenge {
  message: string;
  expiresAt: number;
}

interface AccessSession {
  address: string;
  expiresAt: number;
}

function normalizedAddress(value: unknown): string | undefined {
  if (typeof value !== "string" || !isAddress(value)) {
    return undefined;
  }

  const address = getAddress(value);
  return address === ZeroAddress ? undefined : address;
}

/** Creates the HTTP API; stateful nonce/session stores are process-local. */
export function createGateApp(dependencies: GateDependencies): Express {
  const app = express();
  const now = dependencies.now ?? Date.now;
  const corsOrigin = dependencies.corsOrigin || DEFAULT_CORS_ORIGIN;
  const challenges = new Map<string, NonceChallenge>();
  const sessions = new Map<string, AccessSession>();

  app.use(
    rateLimit({
      windowMs: 60_000,
      limit: 60,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: "Too many requests" },
    }),
  );
  app.use(cors({ origin: corsOrigin }));
  app.use(express.json({ limit: "8kb" }));

  app.get("/nonce/:address", (request, response) => {
    const address = normalizedAddress(request.params.address);
    if (!address) {
      return response.status(400).json({ error: "Invalid wallet address" });
    }

    const expiresAt = now() + NONCE_TTL_MS;
    const nonce = dependencies.nonceGenerator?.() ?? randomBytes(32).toString("hex");
    const message = [
      "MK Alpha gate access verification",
      `Origin: ${corsOrigin}`,
      `Address: ${address}`,
      `Nonce: ${nonce}`,
      `Expires: ${new Date(expiresAt).toISOString()}`,
    ].join("\n");

    challenges.set(address.toLowerCase(), { message, expiresAt });
    return response.json({ address, nonce, message, expiresAt: new Date(expiresAt).toISOString() });
  });

  app.post("/verify", (request, response) => {
    const body = request.body as
      | { address?: unknown; message?: unknown; signature?: unknown }
      | undefined;
    const address = normalizedAddress(body?.address);
    if (
      !address ||
      typeof body?.message !== "string" ||
      typeof body.signature !== "string" ||
      body.message.length > 512 ||
      body.signature.length > 256
    ) {
      return response.status(400).json({ error: "Invalid verification request" });
    }

    const addressKey = address.toLowerCase();
    const challenge = challenges.get(addressKey);
    if (!challenge) {
      return response.status(401).json({ error: "Request a new wallet nonce" });
    }
    if (now() >= challenge.expiresAt) {
      challenges.delete(addressKey);
      return response.status(401).json({ error: "Wallet nonce expired" });
    }
    if (body.message !== challenge.message) {
      return response.status(400).json({ error: "Wallet message does not match nonce" });
    }

    let recoveredAddress: string;
    try {
      recoveredAddress = getAddress(verifyMessage(body.message, body.signature));
    } catch {
      return response.status(400).json({ error: "Invalid wallet signature" });
    }
    if (recoveredAddress.toLowerCase() !== addressKey) {
      return response.status(401).json({ error: "Signature does not match wallet address" });
    }

    challenges.delete(addressKey);
    const accessToken =
      dependencies.sessionGenerator?.() ?? randomBytes(32).toString("hex");
    const expiresAt = now() + ACCESS_SESSION_TTL_MS;
    sessions.set(accessToken, { address, expiresAt });
    return response.json({
      verified: true,
      address,
      accessToken,
      expiresAt: new Date(expiresAt).toISOString(),
    });
  });

  app.get("/access/:address", async (request, response) => {
    const address = normalizedAddress(request.params.address);
    if (!address) {
      return response.status(400).json({ error: "Invalid wallet address" });
    }

    const authorization = request.header("authorization");
    const accessToken = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
    const session = accessToken ? sessions.get(accessToken) : undefined;
    if (!accessToken || !session || now() >= session.expiresAt) {
      if (accessToken) sessions.delete(accessToken);
      return response.status(401).json({ error: "Wallet verification required" });
    }
    if (session.address.toLowerCase() !== address.toLowerCase()) {
      return response.status(403).json({ error: "Session address does not match request" });
    }

    try {
      const { tier, stakedWei } = await dependencies.readStaking(address);
      const features = TIER_FEATURES[tier];
      if (!features || !Number.isInteger(tier) || stakedWei < 0n) {
        throw new Error("Invalid staking response");
      }
      return response.json({
        address,
        stakedMKA: formatUnits(stakedWei, 18),
        tier,
        features: [...features],
      });
    } catch {
      return response.status(503).json({ error: "Staking data is unavailable" });
    }
  });

  return app;
}