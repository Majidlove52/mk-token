import "dotenv/config";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ethers, network, run } from "hardhat";
import {
  getContractOrder,
  getRecordProfile,
  type DeploymentContractName,
  type DeploymentRecord,
} from "./lib/deployAll";

interface BscScanSourceResult {
  SourceCode?: string;
  ABI?: string;
}

interface BscScanResponse {
  status?: string;
  result?: BscScanSourceResult[] | string;
}

function readRecord(): DeploymentRecord {
  try {
    return JSON.parse(
      readFileSync(resolve(process.cwd(), "deployments/bscTestnet.json"), "utf8"),
    ) as DeploymentRecord;
  } catch {
    throw new Error("Missing or invalid deployments/bscTestnet.json");
  }
}

async function isVerified(address: string, apiKey: string): Promise<boolean> {
  const url = new URL("https://api.etherscan.io/v2/api");
  url.search = new URLSearchParams({
    chainid: "97",
    module: "contract",
    action: "getsourcecode",
    address,
    apikey: apiKey,
  }).toString();

  const response = await fetch(url);
  if (!response.ok) throw new Error(`BscScan source status request failed (${response.status})`);
  const payload = (await response.json()) as BscScanResponse;
  if (payload.status === "1" && Array.isArray(payload.result)) {
    const firstResult = payload.result[0];
    return Boolean(
      firstResult?.SourceCode &&
      firstResult.ABI &&
      firstResult.ABI !== "Contract source code not verified",
    );
  }
  if (
    payload.status === "0" &&
    typeof payload.result === "string" &&
    payload.result.toLowerCase().includes("not verified")
  ) {
    return false;
  }
  throw new Error("BscScan returned an unexpected source-verification response");
}

async function main(): Promise<void> {
  if (network.name !== "bscTestnet") {
    throw new Error("Verification is restricted to the bscTestnet network");
  }
  const chain = await ethers.provider.getNetwork();
  if (chain.chainId !== 97n) {
    throw new Error(`Refusing verification on chain ID ${chain.chainId}; expected 97`);
  }
  const apiKey = process.env.BSCSCAN_API_KEY;
  if (!apiKey) throw new Error("Set BSCSCAN_API_KEY in the root .env file");

  const record = readRecord();
  if (record.chainId !== 97) {
    throw new Error(`Deployment record chain ID must be 97, received ${record.chainId}`);
  }
  const contractNames = getContractOrder(getRecordProfile(record));

  const summary = { verified: 0, alreadyVerified: 0, skipped: 0, failed: 0 };
  for (const contractName of contractNames) {
    const entry = record.contracts[contractName];
    if (!entry) {
      console.log(`${contractName}: skipped (no deployment address recorded)`);
      summary.skipped += 1;
      continue;
    }

    try {
      if (await isVerified(entry.address, apiKey)) {
        console.log(`${contractName}: already verified at ${entry.address}`);
        summary.alreadyVerified += 1;
        continue;
      }
      await run("verify:verify", {
        address: entry.address,
        constructorArguments: entry.constructorArguments,
      });
      console.log(`${contractName}: verified at ${entry.address}`);
      summary.verified += 1;
    } catch (error) {
      console.error(`${contractName}: verification failed: ${error instanceof Error ? error.message : String(error)}`);
      summary.failed += 1;
    }
  }

  console.log(
    `Verification summary: ${summary.verified} verified, ${summary.alreadyVerified} already verified, ${summary.skipped} skipped, ${summary.failed} failed.`,
  );
  if (summary.failed > 0) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(__filename)) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}