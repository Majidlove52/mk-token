import "dotenv/config";
import { Contract, getAddress, isAddress, JsonRpcProvider, ZeroAddress } from "ethers";
import { createGateApp } from "./app";
import { DEFAULT_CORS_ORIGIN, DEFAULT_TIER_CACHE_MS } from "../config";
import { MemorySessionStore, SessionStore } from "./session-store";

function positiveInteger(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error("GATE_TIER_CACHE_MS must be a positive integer");
  }
  return parsed;
}

async function configuredSessionStore(): Promise<SessionStore> {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) return new MemorySessionStore();
  const { RedisSessionStore } = await import("./redis-session-store");
  return new RedisSessionStore(redisUrl);
}

function requiredEnvironmentValue(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Set ${name} in .env`);
  }
  return value;
}

async function main(): Promise<void> {
  const rpcUrl = requiredEnvironmentValue("BSC_TESTNET_RPC_URL");
  const stakingAddressValue = requiredEnvironmentValue("STAKING_ADDRESS");
  if (!isAddress(stakingAddressValue)) {
    throw new Error("STAKING_ADDRESS must be a valid address");
  }
  const stakingAddress = getAddress(stakingAddressValue);
  if (stakingAddress === ZeroAddress) {
    throw new Error("STAKING_ADDRESS cannot be the zero address");
  }

  const port = Number(process.env.GATE_PORT ?? "3001");
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("GATE_PORT must be a valid TCP port");
  }

  const provider = new JsonRpcProvider(rpcUrl);
  const chain = await provider.getNetwork();
  if (chain.chainId !== 97n) {
    await provider.destroy();
    throw new Error("The gate service is restricted to BSC testnet (chain ID 97)");
  }

  const staking = new Contract(
    stakingAddress,
    [
      "function tierOf(address) view returns (uint8)",
      "function stakedBalance(address) view returns (uint256)",
    ],
    provider,
  );
  const app = createGateApp({
    corsOrigin: process.env.GATE_CORS_ORIGIN || DEFAULT_CORS_ORIGIN,
    allowedDomains: (process.env.GATE_ALLOWED_DOMAINS || "")
      .split(",")
      .map((domain) => domain.trim())
      .filter(Boolean),
    tierCacheMs: positiveInteger(process.env.GATE_TIER_CACHE_MS, DEFAULT_TIER_CACHE_MS),
    sessionStore: await configuredSessionStore(),
    readStaking: async (address) => {
      const [tier, stakedWei] = await Promise.all([
        staking.getFunction("tierOf")(address),
        staking.getFunction("stakedBalance")(address),
      ]);
      return { tier: Number(tier), stakedWei: BigInt(stakedWei) };
    },
  });

  app.listen(port, () => console.log(`MKA gate listening on port ${port}`));
}

main().catch(() => {
  console.error("Gate service failed to start; check testnet configuration and RPC connectivity.");
  process.exitCode = 1;
});