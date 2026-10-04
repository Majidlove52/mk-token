import { describe, expect, it, vi } from "vitest";
import { createGateClient, Eip1193Provider } from "./client";

const address = "0x00000000000000000000000000000000000000a1";

function jsonReply(value: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => value,
  } as Response;
}

function signInMessage(now: number, expiresInMs = 300_000): string {
  return [
    "MK Alpha Gate Sign-In",
    "Domain: localhost:3000",
    `Address: ${address}`,
    "Chain ID: 97",
    "Nonce: sdk-test-nonce",
    `Issued At: ${new Date(now).toISOString()}`,
    `Expiration Time: ${new Date(now + expiresInMs).toISOString()}`,
  ].join("\n");
}

describe("Gate SDK client", function () {
  it("checks chain 97, signs the gate challenge, loads tier features, and logs out", async function () {
    const now = Date.now();
    const requests: Array<{ method: string; params?: unknown[] }> = [];
    const provider: Eip1193Provider = {
      request: vi.fn(async ({ method, params }) => {
        requests.push({ method, params });
        if (method === "eth_chainId") return "0x61";
        if (method === "eth_requestAccounts") return [address];
        if (method === "personal_sign") return "0xsignature";
        throw new Error(`Unexpected wallet method ${method}`);
      }),
    };
    const fetcher = vi.fn()
      .mockResolvedValueOnce(jsonReply({
        address,
        nonce: "sdk-test-nonce",
        message: signInMessage(now),
        expiresAt: new Date(now + 300_000).toISOString(),
      }))
      .mockResolvedValueOnce(jsonReply({
        verified: true,
        address,
        accessToken: "memory-only-token",
        expiresAt: new Date(now + 1_800_000).toISOString(),
      }))
      .mockResolvedValueOnce(jsonReply({
        address,
        tier: 2,
        features: ["basic-scanner", "advanced-indicators"],
        expiresAt: new Date(now + 1_800_000).toISOString(),
      }))
      .mockResolvedValueOnce(jsonReply({ ok: true }))
      .mockResolvedValueOnce(jsonReply({ loggedOut: true }));
    window.sessionStorage.clear();
    const client = createGateClient({
      gateUrl: "https://gate.example/",
      domain: "https://localhost:3000",
      chainId: 97,
      fetch: fetcher,
      now: () => now,
    });

    const session = await client.connectAndSignIn(provider);
    expect(session.tier).to.equal(2);
    expect(client.hasFeature("basic-scanner")).to.equal(true);
    expect(client.hasFeature("premium-signals")).to.equal(false);
    expect(client.tier()).to.equal(2);
    expect(requests.map(({ method }) => method)).to.deep.equal([
      "eth_chainId", "eth_requestAccounts", "personal_sign",
    ]);
    expect(window.sessionStorage.length).to.equal(0);
    expect(requests[2].params?.[0]).toContain("0x4d4b20416c7068612047617465");

    const protectedResponse = await client.authenticatedFetch("/api/scanner/basic");
    expect(protectedResponse.status).to.equal(200);
    expect(new Headers(fetcher.mock.calls[3]?.[1]?.headers).get("authorization"))
      .to.equal("Bearer memory-only-token");

    await client.logout();
    expect(client.tier()).to.equal(0);
    expect(fetcher.mock.calls[4]?.[0]).to.equal("https://gate.example/logout");
    client.dispose();
  });

  it("refreshes the session shortly before expiry", async function () {
    vi.useFakeTimers();
    const now = 10_000_000;
    vi.setSystemTime(now);
    const provider: Eip1193Provider = {
      request: vi.fn(async ({ method }) => {
        if (method === "eth_chainId") return "0x61";
        if (method === "eth_requestAccounts") return [address];
        if (method === "personal_sign") return "0xsig";
        throw new Error("Unexpected wallet call");
      }),
    };
    const fetcher = vi.fn()
      .mockResolvedValueOnce(jsonReply({
        address,
        nonce: "sdk-test-nonce",
        message: signInMessage(now),
        expiresAt: new Date(now + 300_000).toISOString(),
      }))
      .mockResolvedValueOnce(jsonReply({ verified: true, address, accessToken: "refresh-token" }))
      .mockResolvedValueOnce(jsonReply({
        address, tier: 1, features: ["basic-scanner"], expiresAt: new Date(now + 5_000).toISOString(),
      }))
      .mockResolvedValueOnce(jsonReply({
        address, tier: 2, features: ["basic-scanner", "advanced-indicators"],
        expiresAt: new Date(now + 60_000).toISOString(),
      }));
    const client = createGateClient({
      gateUrl: "https://gate.example",
      domain: "localhost:3000",
      chainId: 97,
      fetch: fetcher,
      now: () => Date.now(),
      refreshBeforeMs: 1_000,
    });

    await client.connectAndSignIn(provider);
    await vi.advanceTimersByTimeAsync(4_000);
    expect(fetcher).toHaveBeenCalledTimes(4);
    expect(client.tier()).to.equal(2);
    client.dispose();
    vi.useRealTimers();
  });

  it("rejects wallets on another chain before requesting accounts or signing", async function () {
    const provider: Eip1193Provider = {
      request: vi.fn(async () => "0x38"),
    };
    const client = createGateClient({
      gateUrl: "https://gate.example",
      domain: "localhost:3000",
      chainId: 97,
      fetch: vi.fn(),
    });

    await expect(client.connectAndSignIn(provider)).rejects.toThrow("chain ID 97");
    expect(provider.request).toHaveBeenCalledTimes(1);
    client.dispose();
  });

  it("persists only the bearer token when sessionStorage is explicitly enabled", async function () {
    const now = Date.now();
    const provider: Eip1193Provider = {
      request: vi.fn(async ({ method }) => {
        if (method === "eth_chainId") return "0x61";
        if (method === "eth_requestAccounts") return [address];
        if (method === "personal_sign") return "0xsig";
        throw new Error("Unexpected wallet call");
      }),
    };
    const fetcher = vi.fn()
      .mockResolvedValueOnce(jsonReply({
        address,
        nonce: "sdk-test-nonce",
        message: signInMessage(now),
        expiresAt: new Date(now + 300_000).toISOString(),
      }))
      .mockResolvedValueOnce(jsonReply({ verified: true, address, accessToken: "tab-scoped-token" }))
      .mockResolvedValueOnce(jsonReply({
        address, tier: 1, features: ["basic-scanner"],
        expiresAt: new Date(now + 1_800_000).toISOString(),
      }));
    window.sessionStorage.clear();
    const client = createGateClient({
      gateUrl: "https://gate.example",
      domain: "localhost:3000",
      chainId: 97,
      sessionStorage: true,
      fetch: fetcher,
      now: () => now,
    });

    await client.connectAndSignIn(provider);
    expect([...Array(window.sessionStorage.length)].map((_, index) => window.sessionStorage.key(index)))
      .to.deep.equal(["mka-gate:https://gate.example:localhost:3000"]);
    expect(window.sessionStorage.getItem("mka-gate:https://gate.example:localhost:3000"))
      .to.equal("tab-scoped-token");
    client.dispose();
    window.sessionStorage.clear();
  });
});