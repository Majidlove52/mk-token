import { createHash } from "node:crypto";
import { isAddress } from "ethers";
import type { Request, RequestHandler, Response } from "express";

export interface GateRequestContext {
  address: string;
  tier: number;
  features: string[];
}

declare global {
  namespace Express {
    interface Request {
      mka?: GateRequestContext;
    }
  }
}

export interface GateMiddlewareOptions {
  gateUrl?: string;
  cacheMs?: number;
  fetch?: typeof fetch;
  now?: () => number;
}

interface SessionResponse extends GateRequestContext {
  expiresAt: string;
}

interface CachedSession {
  value: GateRequestContext;
  expiresAt: number;
}

function unauthorized(response: Response): void {
  response.status(401).json({ error: "Unauthorized", code: "GATE_UNAUTHORIZED" });
}

function unavailable(response: Response): void {
  response.status(503).json({ error: "Gate service unavailable", code: "GATE_UNAVAILABLE" });
}

function forbidden(response: Response, error: string, details: Record<string, unknown>): void {
  response.status(403).json({ error, code: "GATE_FORBIDDEN", ...details });
}

function tokenFrom(request: Request): string | undefined {
  return request.header("authorization")?.match(/^Bearer\s+([^\s]+)$/i)?.[1];
}

function validSession(value: unknown): value is SessionResponse {
  if (!value || typeof value !== "object") return false;
  const session = value as Partial<SessionResponse>;
  return typeof session.address === "string" && isAddress(session.address) &&
    Number.isInteger(session.tier) && session.tier! >= 0 && session.tier! <= 3 &&
    Array.isArray(session.features) && session.features.every((feature) => typeof feature === "string") &&
    typeof session.expiresAt === "string" && Number.isFinite(Date.parse(session.expiresAt));
}

export function requireTier(minTier: number, options: GateMiddlewareOptions = {}): RequestHandler {
  if (!Number.isInteger(minTier) || minTier < 0 || minTier > 3) {
    throw new RangeError("minTier must be an integer from 0 to 3");
  }
  return gateMiddleware(options, (request, response, next) => {
    if (!request.mka || request.mka.tier < minTier) {
      forbidden(response, "Insufficient tier", { requiredTier: minTier, tier: request.mka?.tier ?? 0 });
      return;
    }
    next();
  });
}

export function requireFeature(featureName: string, options: GateMiddlewareOptions = {}): RequestHandler {
  if (!featureName.trim()) throw new TypeError("featureName must not be empty");
  return gateMiddleware(options, (request, response, next) => {
    if (!request.mka?.features.includes(featureName)) {
      forbidden(response, "Feature access denied", { feature: featureName, tier: request.mka?.tier ?? 0 });
      return;
    }
    next();
  });
}

function gateMiddleware(
  options: GateMiddlewareOptions,
  authorize: (request: Request, response: Response, next: (error?: unknown) => void) => void,
): RequestHandler {
  const gateUrl = (options.gateUrl ?? process.env.GATE_URL ?? "http://localhost:3001").replace(/\/+$/, "");
  const cacheMs = Math.max(0, options.cacheMs ?? 2_000);
  const now = options.now ?? Date.now;
  const fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
  const cache = new Map<string, CachedSession>();

  return (request, response, next) => {
    const token = tokenFrom(request);
    if (!token || token.length > 256) {
      unauthorized(response);
      return;
    }
    const cacheKey = createHash("sha256").update(token).digest("hex");
    const cached = cache.get(cacheKey);
    if (cached && cached.expiresAt > now()) {
      request.mka = cached.value;
      authorize(request, response, next);
      return;
    }

    void fetcher(`${gateUrl}/session`, {
      headers: { authorization: `Bearer ${token}` },
    }).then(async (gateResponse) => {
      if (gateResponse.status === 401) {
        cache.delete(cacheKey);
        unauthorized(response);
        return;
      }
      if (!gateResponse.ok) {
        unavailable(response);
        return;
      }
      const value: unknown = await gateResponse.json();
      if (!validSession(value) || Date.parse(value.expiresAt) <= now()) {
        unavailable(response);
        return;
      }
      const context: GateRequestContext = {
        address: value.address,
        tier: value.tier,
        features: [...value.features],
      };
      const cacheExpiry = Math.min(now() + cacheMs, Date.parse(value.expiresAt));
      if (cacheMs > 0 && cacheExpiry > now()) cache.set(cacheKey, { value: context, expiresAt: cacheExpiry });
      request.mka = context;
      authorize(request, response, next);
    }).catch(() => unavailable(response));
  };
}