import "dotenv/config";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { getAddress, isAddress, ZeroAddress } from "ethers";
import {
  getRecordProfile,
  type DeploymentContractName,
  type DeploymentRecord,
} from "./lib/deployAll";

const contractNames: DeploymentContractName[] = [
  "MKAToken",
  "MKATeamVesting",
  "MKAStaking",
  "MKABurnVault",
];

function requiredAddress(record: DeploymentRecord, contractName: DeploymentContractName): string {
  const address = record.contracts[contractName]?.address;
  if (!address || !isAddress(address) || getAddress(address) === ZeroAddress) {
    throw new Error(`Deployment record is missing a valid ${contractName} address`);
  }
  return getAddress(address);
}

export function buildAppEnvContents(record: DeploymentRecord, rpcUrl: string): string {
  if (record.chainId !== 97) {
    throw new Error(`Expected a BSC Testnet deployment record (chain ID 97), received ${record.chainId}`);
  }
  const profile = getRecordProfile(record);
  const contractNames = profile === "core"
    ? ["MKAToken", "MKATeamVesting"] as const
    : ["MKAToken", "MKATeamVesting", "MKAStaking", "MKABurnVault"] as const;

  const addresses = Object.fromEntries(contractNames.map((contractName) => [
    contractName,
    requiredAddress(record, contractName),
  ])) as Partial<Record<DeploymentContractName, string>>;
  const parsedRpcUrl = new URL(rpcUrl);
  if (
    (parsedRpcUrl.protocol !== "http:" && parsedRpcUrl.protocol !== "https:") ||
    parsedRpcUrl.username ||
    parsedRpcUrl.password ||
    [...parsedRpcUrl.searchParams.keys()].some((key) => /key|token|secret|auth/i.test(key))
  ) {
    throw new Error("BSC_TESTNET_RPC_URL must be a public URL without credentials or API-key query parameters");
  }

  const contents = [
    `VITE_TOKEN_ADDRESS=${addresses.MKAToken}`,
    `VITE_STAKING_ADDRESS=${addresses.MKAStaking ?? ""}`,
    `VITE_BURN_VAULT_ADDRESS=${addresses.MKABurnVault ?? ""}`,
    `VITE_VESTING_ADDRESS=${addresses.MKATeamVesting}`,
    `VITE_FEATURES_STAKING=${profile === "full"}`,
    `VITE_FEATURES_BURN=${profile === "full"}`,
    "VITE_CHAIN_ID=97",
    `VITE_RPC_URL=${parsedRpcUrl.toString()}`,
    "",
  ].join("\n");

  return contents;
}

function main(): void {
  const recordPath = resolve(process.cwd(), "deployments/bscTestnet.json");
  let record: DeploymentRecord;
  try {
    record = JSON.parse(readFileSync(recordPath, "utf8")) as DeploymentRecord;
  } catch {
    throw new Error("Missing or invalid deployments/bscTestnet.json; run the testnet deploy orchestrator first");
  }
  const rpcUrl = process.env.BSC_TESTNET_RPC_URL;
  if (!rpcUrl) throw new Error("Set BSC_TESTNET_RPC_URL in the root .env file");
  const contents = buildAppEnvContents(record, rpcUrl);
  writeFileSync(resolve(process.cwd(), "app/.env"), contents, { mode: 0o600 });
  console.log("Wrote app/.env with public BSC Testnet contract and RPC configuration.");
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(__filename)) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}