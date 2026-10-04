import { randomBytes } from "node:crypto";
import cors from "cors";
import express, { Express, Request, RequestHandler, Response } from "express";
import { rateLimit } from "express-rate-limit";
import { formatUnits, getAddress, isAddress, verifyMessage, ZeroAddress } from "ethers";
import {
  ACCESS_SESSION_TTL_MS,
  DEFAULT_CORS_ORIGIN,
  DEFAULT_TIER_CACHE_MS,
  GATE_CHAIN_ID,
  NONCE_TTL_MS,
  TIER_FEATURES,
} from "../config";
import { MemorySessionStore, SessionStore } from "./session-store";

export interface StakingSnapshot {
  tier: number;
  stakedWei: bigint;
}

export interface GateDependencies {
  readStaking(address: string): Promise<StakingSnapshot>;
  corsOrigin?: string;
  allowedDomains?: readonly string[];
  tierCacheMs?: number;
  sessionStore?: SessionStore;
  now?: () => number;
  nonceGenerator?: () => string;
  sessionGenerator?: () => string;
}

interface NonceChallenge {
  address: string;
  domain: string;
  nonce: string;
  chainId: number;
  issuedAt: string;
  message: string;
  expiresAt: string;
}

interface AccessSession {
  address: string;
}

interface ParsedSignInMessage {
  domain?: string;
  address?: string;
  chainId?: string;
  nonce?: string;
  issuedAt?: string;
  expiresAt?: string;
}

function nonceStoreKey(address: string): string {
  return `mka-gate:nonce:${address.toLowerCase()}`;
}

function sessionStoreKey(token: string): string {
  return `mka-gate:session:${token}`;
}

function normalizedAddress(value: unknown): string | undefined {
  if (typeof value !== "string" || !isAddress(value)) {
    return undefined;
  }

  const address = getAddress(value);
  return address === ZeroAddress ? undefined : address;
}

function normalizedDomain(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const candidate = value.includes("://") ? new URL(value) : new URL(`https://${value}`);
    if (candidate.pathname !== "/" || candidate.search || candidate.hash || candidate.username) {
      return undefined;
    }
    return candidate.host.toLowerCase();
  } catch {
    return undefined;
  }
}

function parseSignInMessage(message: string): ParsedSignInMessage | undefined {
  const lines = message.split("\n");
  if (lines.length !== 7 || lines[0] !== "MK Alpha Gate Sign-In") return undefined;
  const values = new Map<string, string>();
  for (const line of lines.slice(1)) {
    const separator = line.indexOf(": ");
    if (separator < 1) return undefined;
    const key = line.slice(0, separator);
    if (values.has(key)) return undefined;
    values.set(key, line.slice(separator + 2));
  }
  if (values.size !== 6) return undefined;
  return {
    domain: values.get("Domain"),
    address: values.get("Address"),
    chainId: values.get("Chain ID"),
    nonce: values.get("Nonce"),
    issuedAt: values.get("Issued At"),
    expiresAt: values.get("Expiration Time"),
  };
}

function authorizationToken(request: Request): string | undefined {
  const token = request.header("authorization")?.match(/^Bearer\s+([^\s]+)$/i)?.[1];
  return token && token.length <= 256 ? token : undefined;
}

function asyncRoute(
  handler: (request: Request, response: Response) => Promise<unknown>,
): RequestHandler {
  return (request, response, next) => {
    void handler(request, response).catch(next);
  };
}

export function createGateApp(dependencies: GateDependencies): Express {
  const app = express();
  const now = dependencies.now ?? Date.now;
  const corsOrigin = dependencies.corsOrigin || DEFAULT_CORS_ORIGIN;
  const fallbackDomain = normalizedDomain(corsOrigin)!;
  const requestedDomains = dependencies.allowedDomains?.filter(Boolean);
  const allowedDomains = new Set(
    (requestedDomains?.length ? requestedDomains : [fallbackDomain])
      .map((domain) => normalizedDomain(domain))
      .filter((domain): domain is string => Boolean(domain)),
  );
  const sessionStore = dependencies.sessionStore ?? new MemorySessionStore(now);
  const tierCacheMs = dependencies.tierCacheMs ?? DEFAULT_TIER_CACHE_MS;
  const tierCache = new Map<string, { value: StakingSnapshot; expiresAt: number }>();

  app.use(rateLimit({
    windowMs: 60_000,
    limit: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests" },
  }));
  app.use(cors({
    origin: (origin, callback) => {
      if (!origin || allowedDomains.has(normalizedDomain(origin) ?? "")) callback(null, true);
      else callback(null, false);
    },
  }));
  app.use(express.json({ limit: "8kb" }));

  async function getSession(token: string): Promise<{ address: string; expiresAt: number } | undefined> {
    const entry = await sessionStore.get<AccessSession>(sessionStoreKey(token));
    if (!entry || entry.expiresAt <= now()) return undefined;
    return { address: entry.value.address, expiresAt: entry.expiresAt };
  }

  async function readTier(address: string): Promise<StakingSnapshot> {
    const cacheKey = address.toLowerCase();
    const cached = tierCache.get(cacheKey);
    if (cached && cached.expiresAt > now()) return cached.value;

    const snapshot = await dependencies.readStaking(address);
    if (!TIER_FEATURES[snapshot.tier] || !Number.isInteger(snapshot.tier) || snapshot.stakedWei < 0n) {
      throw new Error("Invalid staking response");
    }
    tierCache.set(cacheKey, { value: snapshot, expiresAt: now() + tierCacheMs });
    return snapshot;
  }

  app.get("/nonce/:address", asyncRoute(async (request, response) => {
    const address = normalizedAddress(request.params.address);
    if (!address) return response.status(400).json({ error: "Invalid wallet address" });

    const domain = normalizedDomain(request.header("origin") ?? corsOrigin);
    if (!domain || !allowedDomains.has(domain)) {
      return response.status(403).json({ error: "Domain is not allowed" });
    }

    const issuedAtMs = now();
    const expiresAtMs = issuedAtMs + NONCE_TTL_MS;
    const nonce = dependencies.nonceGenerator?.() ?? randomBytes(32).toString("hex");
    const issuedAt = new Date(issuedAtMs).toISOString();
    const expiresAt = new Date(expiresAtMs).toISOString();
    const message = [
      "MK Alpha Gate Sign-In",
      `Domain: ${domain}`,
      `Address: ${address}`,
      `Chain ID: ${GATE_CHAIN_ID}`,
      `Nonce: ${nonce}`,
      `Issued At: ${issuedAt}`,
      `Expiration Time: ${expiresAt}`,
    ].join("\n");
    const challenge: NonceChallenge = {
      address, domain, nonce, chainId: GATE_CHAIN_ID, issuedAt, expiresAt, message,
    };
    await sessionStore.set(nonceStoreKey(address), challenge, expiresAtMs);
    return response.json({ address, nonce, message, expiresAt });
  }));

  app.post("/verify", asyncRoute(async (request, response) => {
    const body = request.body as
      | { address?: unknown; message?: unknown; signature?: unknown }
      | undefined;
    const address = normalizedAddress(body?.address);
    if (
      !address || typeof body?.message !== "string" || typeof body.signature !== "string" ||
      body.message.length > 1024 || body.signature.length > 256
    ) {
      return response.status(400).json({ error: "Invalid verification request" });
    }

    const addressKey = address.toLowerCase();
    const nonceKey = nonceStoreKey(addressKey);
    const storedChallenge = await sessionStore.get<NonceChallenge>(nonceKey);
    const challenge = storedChallenge?.value;
    if (!challenge) return response.status(401).json({ error: "Request a new wallet nonce" });
    if (storedChallenge.expiresAt <= now() || Date.parse(challenge.expiresAt) <= now()) {
      await sessionStore.delete(nonceKey);
      return response.status(401).json({ error: "Wallet nonce expired" });
    }

    const parsed = parseSignInMessage(body.message);
    const issuedAtMs = parsed?.issuedAt ? Date.parse(parsed.issuedAt) : Number.NaN;
    const messageExpiry = parsed?.expiresAt ? Date.parse(parsed.expiresAt) : Number.NaN;
    const validFields = Boolean(
      parsed && body.message === challenge.message &&
      normalizedDomain(parsed.domain) === challenge.domain && allowedDomains.has(challenge.domain) &&
      normalizedAddress(parsed.address)?.toLowerCase() === addressKey &&
      parsed.chainId === String(GATE_CHAIN_ID) && challenge.chainId === GATE_CHAIN_ID &&
      parsed.nonce === challenge.nonce && parsed.issuedAt === challenge.issuedAt &&
      Number.isFinite(issuedAtMs) && issuedAtMs <= now() &&
      parsed.expiresAt === challenge.expiresAt && Number.isFinite(messageExpiry) && messageExpiry > now()
    );
    if (!validFields) {
      return response.status(400).json({ error: "Sign-in message fields do not match the request" });
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

    const consumed = await sessionStore.consume<NonceChallenge>(nonceKey);
    if (!consumed || consumed.value.nonce !== challenge.nonce) {
      return response.status(401).json({ error: "Wallet nonce was already used" });
    }

    const accessToken = dependencies.sessionGenerator?.() ?? randomBytes(32).toString("hex");
    const expiresAt = now() + ACCESS_SESSION_TTL_MS;
    await sessionStore.set(sessionStoreKey(accessToken), { address }, expiresAt);
    return response.json({
      verified: true,
      address,
      accessToken,
      expiresAt: new Date(expiresAt).toISOString(),
    });
  }));

  app.get("/access/:address", asyncRoute(async (request, response) => {
    const address = normalizedAddress(request.params.address);
    if (!address) return response.status(400).json({ error: "Invalid wallet address" });
    const token = authorizationToken(request);
    const session = token ? await getSession(token) : undefined;
    if (!token || !session) return response.status(401).json({ error: "Wallet verification required" });
    if (session.address.toLowerCase() !== address.toLowerCase()) {
      return response.status(403).json({ error: "Session address does not match request" });
    }

    try {
      const { tier, stakedWei } = await dependencies.readStaking(address);
      if (!TIER_FEATURES[tier] || !Number.isInteger(tier) || stakedWei < 0n) {
        throw new Error("Invalid staking response");
      }
      return response.json({
        address,
        stakedMKA: formatUnits(stakedWei, 18),
        tier,
        features: [...TIER_FEATURES[tier]],
      });
    } catch {
      return response.status(503).json({ error: "Staking data is unavailable" });
    }
  }));

  app.get("/session", asyncRoute(async (request, response) => {
    const token = authorizationToken(request);
    const session = token ? await getSession(token) : undefined;
    if (!token || !session) return response.status(401).json({ error: "Wallet verification required" });

    try {
      const { tier } = await readTier(session.address);
      const expiresAt = now() + ACCESS_SESSION_TTL_MS;
      const renewed = await sessionStore.renew(sessionStoreKey(token), { address: session.address }, expiresAt);
      if (!renewed) return response.status(401).json({ error: "Wallet verification required" });
      return response.json({
        address: session.address,
        tier,
        features: [...TIER_FEATURES[tier]],
        expiresAt: new Date(expiresAt).toISOString(),
      });
    } catch {
      return response.status(503).json({ error: "Staking data is unavailable" });
    }
  }));

  app.post("/logout", asyncRoute(async (request, response) => {
    const token = authorizationToken(request);
    const session = token ? await getSession(token) : undefined;
    if (!token || !session) return response.status(401).json({ error: "Wallet verification required" });
    await sessionStore.delete(sessionStoreKey(token));
    return response.json({ loggedOut: true });
  }));

  return app;
}