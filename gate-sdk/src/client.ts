import { getAddress, hexlify, isAddress, toUtf8Bytes } from "ethers";

export interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
}

export interface GateSession {
  address: string;
  tier: number;
  features: string[];
  expiresAt: string;
}

export interface GateClientOptions {
  gateUrl: string;
  domain: string;
  chainId: number;
  sessionStorage?: boolean;
  refreshBeforeMs?: number;
  fetch?: typeof fetch;
  now?: () => number;
}

export interface GateClient {
  connectAndSignIn(provider: Eip1193Provider): Promise<GateSession>;
  getSession(): Promise<GateSession | null>;
  logout(): Promise<void>;
  hasFeature(name: string): boolean;
  tier(): number;
  onChange(callback: (session: GateSession | null) => void): () => void;
  authenticatedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
  dispose(): void;
}

interface NonceResponse {
  address: string;
  nonce: string;
  message: string;
  expiresAt: string;
}

interface VerifyResponse {
  verified: boolean;
  address: string;
  accessToken: string;
  expiresAt: string;
}

interface SignInFields {
  domain?: string;
  address?: string;
  chainId?: string;
  nonce?: string;
  issuedAt?: string;
  expiresAt?: string;
}

export class GateClientError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "GateClientError";
  }
}

function normalizeDomain(value: string): string {
  try {
    const url = value.includes("://") ? new URL(value) : new URL(`https://${value}`);
    if (url.pathname !== "/" || url.search || url.hash || url.username) {
      throw new Error("Domain must not include a path or credentials");
    }
    return url.host.toLowerCase();
  } catch (error) {
    throw new GateClientError(`Invalid gate domain: ${(error as Error).message}`);
  }
}

function parseSignInMessage(message: string): SignInFields | undefined {
  const lines = message.split("\n");
  if (lines.length !== 7 || lines[0] !== "MK Alpha Gate Sign-In") return undefined;
  const fields = new Map<string, string>();
  for (const line of lines.slice(1)) {
    const separator = line.indexOf(": ");
    if (separator < 1 || fields.has(line.slice(0, separator))) return undefined;
    fields.set(line.slice(0, separator), line.slice(separator + 2));
  }
  if (fields.size !== 6) return undefined;
  return {
    domain: fields.get("Domain"),
    address: fields.get("Address"),
    chainId: fields.get("Chain ID"),
    nonce: fields.get("Nonce"),
    issuedAt: fields.get("Issued At"),
    expiresAt: fields.get("Expiration Time"),
  };
}

async function jsonResponse<T>(response: Response): Promise<T> {
  let body: { error?: string };
  try {
    body = await response.json() as { error?: string };
  } catch {
    body = {};
  }
  if (!response.ok) {
    throw new GateClientError(body.error ?? `Gate request failed (${response.status})`, response.status);
  }
  return body as T;
}

export function createGateClient(options: GateClientOptions): GateClient {
  if (!Number.isSafeInteger(options.chainId) || options.chainId !== 97) {
    throw new GateClientError("The MKA gate supports chain ID 97 only");
  }
  const domain = normalizeDomain(options.domain);
  const gateUrl = options.gateUrl.replace(/\/+$/, "");
  const fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
  const now = options.now ?? Date.now;
  const refreshBeforeMs = options.refreshBeforeMs ?? 60_000;
  const storageKey = `mka-gate:${new URL(gateUrl).origin}:${domain}`;
  let accessToken: string | undefined;
  let session: GateSession | null = null;
  let refreshTimer: ReturnType<typeof setTimeout> | undefined;
  const listeners = new Set<(value: GateSession | null) => void>();

  function storage(): Storage | undefined {
    if (!options.sessionStorage || typeof window === "undefined") return undefined;
    try {
      return window.sessionStorage;
    } catch {
      return undefined;
    }
  }

  try {
    accessToken = storage()?.getItem(storageKey) ?? undefined;
  } catch {
    accessToken = undefined;
  }

  function updateSession(value: GateSession | null): void {
    session = value;
    for (const listener of listeners) listener(session);
    scheduleRefresh();
  }

  function saveToken(value: string | undefined): void {
    accessToken = value;
    try {
      if (value) storage()?.setItem(storageKey, value);
      else storage()?.removeItem(storageKey);
    } catch {
      accessToken = value;
    }
  }

  function scheduleRefresh(): void {
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = undefined;
    if (!session || !accessToken) return;
    const expiration = Date.parse(session.expiresAt);
    if (!Number.isFinite(expiration)) return;
    const delay = Math.max(0, expiration - now() - refreshBeforeMs);
    refreshTimer = setTimeout(() => {
      void getSession().catch(() => {
        const remaining = Date.parse(session?.expiresAt ?? "") - now();
        if (accessToken && remaining > 0) {
          refreshTimer = setTimeout(() => void getSession().catch(() => {
            saveToken(undefined);
            updateSession(null);
          }), Math.min(10_000, remaining));
        } else {
          saveToken(undefined);
          updateSession(null);
        }
      });
    }, delay);
  }

  async function connectAndSignIn(provider: Eip1193Provider): Promise<GateSession> {
    const chainValue = await provider.request({ method: "eth_chainId" });
    let walletChainId: bigint;
    try {
      walletChainId = BigInt(chainValue as string);
    } catch {
      throw new GateClientError("Wallet returned an invalid chain ID");
    }
    if (walletChainId !== BigInt(options.chainId)) {
      throw new GateClientError("Switch your wallet to BNB Chain Testnet (chain ID 97)");
    }

    const accounts = await provider.request({ method: "eth_requestAccounts" });
    const account = Array.isArray(accounts) ? accounts[0] : undefined;
    if (typeof account !== "string" || !isAddress(account)) {
      throw new GateClientError("Wallet did not provide a valid address");
    }
    const address = getAddress(account);
    const nonceResponse = await fetcher(`${gateUrl}/nonce/${encodeURIComponent(address)}`);
    const challenge = await jsonResponse<NonceResponse>(nonceResponse);
    const fields = parseSignInMessage(challenge.message);
    const issuedAt = fields?.issuedAt ? Date.parse(fields.issuedAt) : Number.NaN;
    const expiresAt = fields?.expiresAt ? Date.parse(fields.expiresAt) : Number.NaN;
    if (
      !fields || fields.domain?.toLowerCase() !== domain ||
      fields.address?.toLowerCase() !== address.toLowerCase() ||
      challenge.address?.toLowerCase() !== address.toLowerCase() ||
      fields.chainId !== String(options.chainId) || fields.nonce !== challenge.nonce ||
      !Number.isFinite(issuedAt) || issuedAt > now() || !Number.isFinite(expiresAt) ||
      expiresAt <= now() || Date.parse(challenge.expiresAt) !== expiresAt
    ) {
      throw new GateClientError("Gate returned an invalid or expired sign-in message");
    }

    const signature = await provider.request({
      method: "personal_sign",
      params: [hexlify(toUtf8Bytes(challenge.message)), address],
    });
    if (typeof signature !== "string") throw new GateClientError("Wallet returned an invalid signature");
    const verifiedResponse = await fetcher(`${gateUrl}/verify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ address, message: challenge.message, signature }),
    });
    const verified = await jsonResponse<VerifyResponse>(verifiedResponse);
    if (!verified.verified || verified.address.toLowerCase() !== address.toLowerCase() || !verified.accessToken) {
      throw new GateClientError("Gate did not verify the wallet session");
    }
    saveToken(verified.accessToken);
    const current = await getSession();
    if (!current) throw new GateClientError("Gate session is unavailable");
    return current;
  }

  async function getSession(): Promise<GateSession | null> {
    if (!accessToken) {
      updateSession(null);
      return null;
    }
    const response = await fetcher(`${gateUrl}/session`, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    if (response.status === 401) {
      saveToken(undefined);
      updateSession(null);
      return null;
    }
    const next = await jsonResponse<GateSession>(response);
    if (
      !isAddress(next.address) || !Number.isInteger(next.tier) ||
      !Array.isArray(next.features) || !next.features.every((feature) => typeof feature === "string") ||
      !Number.isFinite(Date.parse(next.expiresAt)) || Date.parse(next.expiresAt) <= now()
    ) {
      throw new GateClientError("Gate returned an invalid session");
    }
    updateSession({ ...next, address: getAddress(next.address), features: [...next.features] });
    return session;
  }

  async function logout(): Promise<void> {
    const token = accessToken;
    try {
      if (token) {
        const response = await fetcher(`${gateUrl}/logout`, {
          method: "POST",
          headers: { authorization: `Bearer ${token}` },
        });
        if (!response.ok && response.status !== 401) await jsonResponse(response);
      }
    } finally {
      saveToken(undefined);
      updateSession(null);
    }
  }

  function authenticatedFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
    if (typeof window === "undefined") {
      throw new GateClientError("Authenticated app requests require a browser origin");
    }
    const target = new URL(input instanceof Request ? input.url : String(input), window.location.origin);
    if (target.origin !== window.location.origin) {
      throw new GateClientError("Authenticated requests are restricted to the current app origin");
    }
    const headers = new Headers(init.headers);
    if (accessToken) headers.set("authorization", `Bearer ${accessToken}`);
    return fetcher(target, { ...init, headers });
  }

  function onChange(callback: (value: GateSession | null) => void): () => void {
    listeners.add(callback);
    callback(session);
    return () => listeners.delete(callback);
  }

  function dispose(): void {
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = undefined;
    listeners.clear();
  }

  return {
    connectAndSignIn,
    getSession,
    logout,
    hasFeature: (name) => session?.features.includes(name) ?? false,
    tier: () => session?.tier ?? 0,
    onChange,
    authenticatedFetch,
    dispose,
  };
}