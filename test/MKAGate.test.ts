import { expect } from "chai";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import type { Express } from "express";
import { ethers } from "hardhat";
import { createGateApp, GateDependencies } from "../gate/src/app";
import { NONCE_TTL_MS } from "../gate/config";

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
});