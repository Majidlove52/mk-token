export const NONCE_TTL_MS = 5 * 60 * 1000;
export const ACCESS_SESSION_TTL_MS = 30 * 60 * 1000;
export const DEFAULT_CORS_ORIGIN = "http://localhost:3000";

export const TIER_FEATURES: Readonly<Record<number, readonly string[]>> = {
  0: [],
  1: ["basic-scanner"],
  2: ["basic-scanner", "advanced-indicators"],
  3: ["basic-scanner", "advanced-indicators", "premium-signals"],
};