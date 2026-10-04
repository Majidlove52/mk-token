import { expect } from "chai";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import type { Express } from "express";
import { ethers } from "hardhat";
import { createGateApp, GateDependencies } from "../gate/src/app";
import { NONCE_TTL_MS } from "../gate/config";
import { MemorySessionStore } from "../gate/src/session-store";

async function withServer(
  app: Express,
  run: (baseUrl: string) => Promise<void>,
): Promise<void> {
  const server = app.listen(0);
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Test server did not bind a TCP address");
  }

  try {
    await run(`http://127.0.0.1:${(address as AddressInfo).port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

async function authenticate(
  baseUrl: string,
  wallet: Awaited<ReturnType<typeof ethers.getSigners>>[number],
  origin = "https://mk-alpha.example",
): Promise<string> {
  const nonceResponse = await fetch(`${baseUrl}/nonce/${wallet.address}`, {
    headers: { Origin: origin },
  });
  const challenge = (await nonceResponse.json()) as { message: string };
  const signature = await wallet.signMessage(challenge.message);
  const verifyResponse = await fetch(`${baseUrl}/verify`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ address: wallet.address, message: challenge.message, signature }),
  });
  expect(verifyResponse.status).to.equal(200);
  return ((await verifyResponse.json()) as { accessToken: string }).accessToken;
}

describe("MKA token gate", function () {
  it("requires a signed nonce before returning mocked tier access", async function () {
    const [wallet, anotherWallet] = await ethers.getSigners();
    const reads: string[] = [];
    const dependencies: GateDependencies = {
      corsOrigin: "https://mk-alpha.example",
      nonceGenerator: () => "test-nonce",
      sessionGenerator: () => "test-session-token",
      readStaking: async (address) => {
        reads.push(address);
        return { tier: 2, stakedWei: ethers.parseEther("250") };
      },
    };

    await withServer(createGateApp(dependencies), async (baseUrl) => {
      const nonceResponse = await fetch(`${baseUrl}/nonce/${wallet.address}`, {
        headers: { Origin: "https://mk-alpha.example" },
      });
      expect(nonceResponse.status).to.equal(200);
      expect(nonceResponse.headers.get("access-control-allow-origin")).to.equal(
        "https://mk-alpha.example",
      );
      const challenge = (await nonceResponse.json()) as { message: string };
      const signature = await wallet.signMessage(challenge.message);

      const unauthenticated = await fetch(`${baseUrl}/access/${wallet.address}`);
      expect(unauthenticated.status).to.equal(401);
      expect(reads).to.have.lengthOf(0);

      const verifyResponse = await fetch(`${baseUrl}/verify`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          address: wallet.address,
          message: challenge.message,
          signature,
        }),
      });
      expect(verifyResponse.status).to.equal(200);
      const verification = (await verifyResponse.json()) as {
        verified: boolean;
        accessToken: string;
      };
      expect(verification.verified).to.equal(true);

      const accessResponse = await fetch(`${baseUrl}/access/${wallet.address}`, {
        headers: { authorization: `Bearer ${verification.accessToken}` },
      });
      expect(accessResponse.status).to.equal(200);
      expect(await accessResponse.json()).to.deep.equal({
        address: ethers.getAddress(wallet.address),
        stakedMKA: "250.0",
        tier: 2,
        features: ["basic-scanner", "advanced-indicators"],
      });
      expect(reads).to.deep.equal([ethers.getAddress(wallet.address)]);

      const wrongAddressResponse = await fetch(`${baseUrl}/access/${anotherWallet.address}`, {
        headers: { authorization: `Bearer ${verification.accessToken}` },
      });
      expect(wrongAddressResponse.status).to.equal(403);
    });
  });

  it("rejects invalid addresses and signatures from a different wallet", async function () {
    const [wallet, anotherWallet] = await ethers.getSigners();
    const dependencies: GateDependencies = {
      nonceGenerator: () => "mismatched-signer-nonce",
      readStaking: async () => ({ tier: 0, stakedWei: 0n }),
    };

    await withServer(createGateApp(dependencies), async (baseUrl) => {
      expect((await fetch(`${baseUrl}/nonce/not-an-address`)).status).to.equal(400);
      expect((await fetch(`${baseUrl}/access/${ethers.ZeroAddress}`)).status).to.equal(400);

      const nonceResponse = await fetch(`${baseUrl}/nonce/${wallet.address}`);
      const challenge = (await nonceResponse.json()) as { message: string };
      const signature = await anotherWallet.signMessage(challenge.message);
      const verifyResponse = await fetch(`${baseUrl}/verify`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          address: wallet.address,
          message: challenge.message,
          signature,
        }),
      });
      expect(verifyResponse.status).to.equal(401);
    });
  });

  it("rejects expired nonces and does not permit replay after verification", async function () {
    const [wallet] = await ethers.getSigners();
    let currentTime = 1_000_000;
    const dependencies: GateDependencies = {
      now: () => currentTime,
      nonceGenerator: () => "expiring-nonce",
      sessionGenerator: () => "expiring-session",
      readStaking: async () => ({ tier: 1, stakedWei: ethers.parseEther("100") }),
    };

    await withServer(createGateApp(dependencies), async (baseUrl) => {
      const nonceResponse = await fetch(`${baseUrl}/nonce/${wallet.address}`);
      const challenge = (await nonceResponse.json()) as { message: string };
      const signature = await wallet.signMessage(challenge.message);
      currentTime += NONCE_TTL_MS + 1;

      const expiredResponse = await fetch(`${baseUrl}/verify`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          address: wallet.address,
          message: challenge.message,
          signature,
        }),
      });
      expect(expiredResponse.status).to.equal(401);

      const freshNonceResponse = await fetch(`${baseUrl}/nonce/${wallet.address}`);
      const freshChallenge = (await freshNonceResponse.json()) as { message: string };
      const freshSignature = await wallet.signMessage(freshChallenge.message);
      const validPayload = JSON.stringify({
        address: wallet.address,
        message: freshChallenge.message,
        signature: freshSignature,
      });
      const validResponse = await fetch(`${baseUrl}/verify`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: validPayload,
      });
      expect(validResponse.status).to.equal(200);

      const replayResponse = await fetch(`${baseUrl}/verify`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: validPayload,
      });
      expect(replayResponse.status).to.equal(401);
    });
  });

  it("binds sign-in to the allow-listed domain and chain 97", async function () {
    const [wallet] = await ethers.getSigners();
    let nonce = 0;
    const dependencies: GateDependencies = {
      corsOrigin: "https://mk-alpha.example",
      allowedDomains: ["mk-alpha.example"],
      nonceGenerator: () => `domain-chain-nonce-${++nonce}`,
      readStaking: async () => ({ tier: 0, stakedWei: 0n }),
    };

    await withServer(createGateApp(dependencies), async (baseUrl) => {
      const rejectedDomain = await fetch(`${baseUrl}/nonce/${wallet.address}`, {
        headers: { Origin: "https://attacker.example" },
      });
      expect(rejectedDomain.status).to.equal(403);

      const nonceResponse = await fetch(`${baseUrl}/nonce/${wallet.address}`, {
        headers: { Origin: "https://mk-alpha.example" },
      });
      const challenge = (await nonceResponse.json()) as { message: string };
      expect(challenge.message).to.include("Domain: mk-alpha.example");
      expect(challenge.message).to.include(`Address: ${ethers.getAddress(wallet.address)}`);
      expect(challenge.message).to.include("Chain ID: 97");
      expect(challenge.message).to.include("Nonce: domain-chain-nonce-1");
      expect(challenge.message).to.include("Issued At:");
      expect(challenge.message).to.include("Expiration Time:");

      for (const tampered of [
        challenge.message.replace("Domain: mk-alpha.example", "Domain: attacker.example"),
        challenge.message.replace("Chain ID: 97", "Chain ID: 56"),
      ]) {
        const signature = await wallet.signMessage(tampered);
        const response = await fetch(`${baseUrl}/verify`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ address: wallet.address, message: tampered, signature }),
        });
        expect(response.status).to.equal(400);
      }
    });
  });

  it("refreshes tier from staking after the short cache expires", async function () {
    const [wallet] = await ethers.getSigners();
    let currentTime = 2_000_000;
    let currentTier = 3;
    let readCount = 0;
    const dependencies: GateDependencies = {
      now: () => currentTime,
      corsOrigin: "https://mk-alpha.example",
      allowedDomains: ["mk-alpha.example"],
      tierCacheMs: 30_000,
      sessionGenerator: () => "tier-downgrade-session",
      readStaking: async () => {
        readCount += 1;
        return { tier: currentTier, stakedWei: currentTier === 0 ? 0n : ethers.parseEther("1000") };
      },
    };

    await withServer(createGateApp(dependencies), async (baseUrl) => {
      const token = await authenticate(baseUrl, wallet);
      const getSession = () => fetch(`${baseUrl}/session`, {
        headers: { authorization: `Bearer ${token}` },
      });

      const initial = await getSession();
      expect(initial.status).to.equal(200);
      expect((await initial.json() as { tier: number }).tier).to.equal(3);

      currentTier = 0;
      const cached = await getSession();
      expect((await cached.json() as { tier: number }).tier).to.equal(3);
      expect(readCount).to.equal(1);

      currentTime += 30_001;
      const downgraded = await getSession();
      expect(downgraded.status).to.equal(200);
      expect(await downgraded.json()).to.deep.equal({
        address: ethers.getAddress(wallet.address),
        tier: 0,
        features: [],
        expiresAt: new Date(currentTime + 30 * 60 * 1000).toISOString(),
      });
      expect(readCount).to.equal(2);
    });
  });

  it("invalidates an active session on logout", async function () {
    const [wallet] = await ethers.getSigners();
    const dependencies: GateDependencies = {
      corsOrigin: "https://mk-alpha.example",
      allowedDomains: ["mk-alpha.example"],
      readStaking: async () => ({ tier: 1, stakedWei: ethers.parseEther("100") }),
    };

    await withServer(createGateApp(dependencies), async (baseUrl) => {
      const token = await authenticate(baseUrl, wallet);
      const headers = { authorization: `Bearer ${token}` };
      const logout = await fetch(`${baseUrl}/logout`, { method: "POST", headers });
      expect(logout.status).to.equal(200);
      expect(await logout.json()).to.deep.equal({ loggedOut: true });
      expect((await fetch(`${baseUrl}/session`, { headers })).status).to.equal(401);
      expect((await fetch(`${baseUrl}/access/${wallet.address}`, { headers })).status).to.equal(401);
    });
  });

  it("expires and consumes in-memory store entries exactly once", async function () {
    let currentTime = 100;
    const store = new MemorySessionStore(() => currentTime);
    await store.set("nonce:test", { nonce: "once" }, 200);
    expect((await store.get<{ nonce: string }>("nonce:test"))?.value.nonce).to.equal("once");
    expect((await store.consume<{ nonce: string }>("nonce:test"))?.value.nonce).to.equal("once");
    expect(await store.consume("nonce:test")).to.equal(undefined);

    await store.set("session:test", { address: "0x1" }, 200);
    currentTime = 200;
    expect(await store.get("session:test")).to.equal(undefined);
  });
});