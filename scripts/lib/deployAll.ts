import { getAddress, getCreateAddress, isAddress, parseUnits, ZeroAddress } from "ethers";
import type { Signer } from "ethers";

export const BSC_TESTNET_CHAIN_ID = 97n;
export const CORE_CONTRACT_ORDER = [
  "MKAToken",
  "MKATeamVesting",
] as const;
export const CONTRACT_ORDER = [
  ...CORE_CONTRACT_ORDER,
  "MKAStaking",
  "MKABurnVault",
] as const;

export type DeploymentProfile = "core" | "full";
export type DeploymentContractName = (typeof CONTRACT_ORDER)[number];
export type ConstructorArgument = string | number;

export interface DeploymentEnvironment {
  rpcUrl: string;
  treasuryAddress: string;
  teamBeneficiary: string;
  tier1?: string;
  tier2?: string;
  tier3?: string;
}

export interface DeploymentEntry {
  address: string;
  constructorArguments: ConstructorArgument[];
}

export interface DeploymentRecord {
  chainId: number;
  timestamp: number;
  deployer: string;
  profile?: DeploymentProfile;
  contracts: Partial<Record<DeploymentContractName, DeploymentEntry>>;
}

export interface DeploymentHandle {
  address: string;
  waitForConfirmations(confirmations: number): Promise<void>;
}

export interface DeploymentPlanItem {
  contractName: DeploymentContractName;
  address: string;
  constructorArguments: ConstructorArgument[];
  estimatedGas: bigint;
  verifyCommand: string;
}

export interface DeployAllOptions {
  chainId: bigint;
  environment: DeploymentEnvironment;
  signer: Signer;
  profile?: DeploymentProfile;
  dryRun?: boolean;
  confirmations?: number;
  existingRecord?: DeploymentRecord;
  latestTimestamp(): Promise<number>;
  estimateGas(
    contractName: DeploymentContractName,
    constructorArguments: ConstructorArgument[],
  ): Promise<bigint>;
  deploy(
    contractName: DeploymentContractName,
    constructorArguments: ConstructorArgument[],
  ): Promise<DeploymentHandle>;
  saveRecord(record: DeploymentRecord): Promise<void>;
  log?: (message: string) => void;
}

export interface DeployAllResult {
  dryRun: boolean;
  record: DeploymentRecord;
  plan: DeploymentPlanItem[];
}

interface ValidatedEnvironment {
  rpcUrl: string;
  treasuryAddress: string;
  teamBeneficiary: string;
  tier1?: bigint;
  tier2?: bigint;
  tier3?: bigint;
}

export function getContractOrder(profile: DeploymentProfile): readonly DeploymentContractName[] {
  return profile === "core" ? CORE_CONTRACT_ORDER : CONTRACT_ORDER;
}

export function resolveDeploymentProfile(value?: string): DeploymentProfile {
  const profile = (value ?? "core").trim().toLowerCase();
  if (profile !== "core" && profile !== "full") {
    throw new Error("DEPLOY_PROFILE must be either core or full");
  }
  return profile;
}

export function getRecordProfile(record: DeploymentRecord): DeploymentProfile {
  if (record.profile !== undefined && record.profile !== "core" && record.profile !== "full") {
    throw new Error(`Deployment record has unsupported profile ${String(record.profile)}`);
  }
  return record.profile ?? "full";
}

function requireAddress(name: string, value: string): string {
  if (!isAddress(value)) throw new Error(`${name} must be a valid address`);
  const address = getAddress(value);
  if (address === ZeroAddress) throw new Error(`${name} cannot be the zero address`);
  return address;
}

function requireWholeMka(name: string, value: string): bigint {
  if (!/^\d+$/.test(value)) throw new Error(`${name} must be a whole number of MKA`);
  return parseUnits(value, 18);
}

function validateEnvironment(
  environment: DeploymentEnvironment,
  profile: DeploymentProfile,
): ValidatedEnvironment {
  let rpc: URL;
  try {
    rpc = new URL(environment.rpcUrl);
  } catch {
    throw new Error("BSC_TESTNET_RPC_URL must be a valid HTTP(S) URL");
  }
  if (rpc.protocol !== "http:" && rpc.protocol !== "https:") {
    throw new Error("BSC_TESTNET_RPC_URL must use HTTP or HTTPS");
  }

  let tier1: bigint | undefined;
  let tier2: bigint | undefined;
  let tier3: bigint | undefined;
  if (profile === "full") {
    if (!environment.tier1) throw new Error("Set TIER1 for the full deployment profile");
    if (!environment.tier2) throw new Error("Set TIER2 for the full deployment profile");
    if (!environment.tier3) throw new Error("Set TIER3 for the full deployment profile");
    tier1 = requireWholeMka("TIER1", environment.tier1);
    tier2 = requireWholeMka("TIER2", environment.tier2);
    tier3 = requireWholeMka("TIER3", environment.tier3);
    if (!(tier1 > 0n && tier2 > tier1 && tier3 > tier2)) {
      throw new Error("TIER1, TIER2, and TIER3 must be non-zero and strictly ascending");
    }
  }

  return {
    rpcUrl: rpc.toString(),
    treasuryAddress: requireAddress("TREASURY_ADDRESS", environment.treasuryAddress),
    teamBeneficiary: requireAddress("TEAM_BENEFICIARY", environment.teamBeneficiary),
    tier1,
    tier2,
    tier3,
  };
}

export function assertBscTestnetChainId(chainId: bigint): void {
  if (chainId !== BSC_TESTNET_CHAIN_ID) {
    throw new Error(`Refusing deployment on chain ID ${chainId}; expected BSC Testnet chain ID 97`);
  }
}

function verifyCommand(
  address: string,
  constructorArguments: ConstructorArgument[],
): string {
  const args = constructorArguments.map((argument) => String(argument)).join(" ");
  return `npx hardhat verify --network bscTestnet ${address}${args ? ` ${args}` : ""}`;
}

function argumentsFor(
  contractName: DeploymentContractName,
  environment: ValidatedEnvironment,
  tokenAddress: string | undefined,
  timestamp: number,
): ConstructorArgument[] {
  if (contractName === "MKAToken") return [environment.treasuryAddress];
  if (contractName === "MKATeamVesting") {
    return [environment.teamBeneficiary, timestamp];
  }
  if (!tokenAddress) throw new Error(`Cannot plan ${contractName} before MKAToken`);
  if (contractName === "MKAStaking") {
    if (environment.tier1 === undefined || environment.tier2 === undefined || environment.tier3 === undefined) {
      throw new Error("Tier thresholds are required for the full deployment profile");
    }
    return [tokenAddress, environment.tier1.toString(), environment.tier2.toString(), environment.tier3.toString()];
  }
  return [tokenAddress];
}

function validateExistingRecord(
  record: DeploymentRecord | undefined,
  profile: DeploymentProfile,
): void {
  if (!record) return;
  if (record.chainId !== Number(BSC_TESTNET_CHAIN_ID)) {
    throw new Error(`Deployment record chain ID must be 97, received ${record.chainId}`);
  }
  if (getRecordProfile(record) !== profile) {
    throw new Error(`Deployment record profile ${getRecordProfile(record)} does not match requested profile ${profile}`);
  }
  if (
    profile === "core" &&
    CONTRACT_ORDER.slice(CORE_CONTRACT_ORDER.length).some((contractName) => record.contracts[contractName])
  ) {
    throw new Error("Core deployment record cannot contain Phase 2 contract addresses");
  }
  let foundGap = false;
  for (const contractName of getContractOrder(profile)) {
    const entry = record.contracts[contractName];
    if (!entry) {
      foundGap = true;
      continue;
    }
    if (foundGap) {
      throw new Error(`Deployment record is not resumable: ${contractName} exists after a missing earlier deployment`);
    }
    requireAddress(`${contractName} deployment record address`, entry.address);
    if (!Array.isArray(entry.constructorArguments)) {
      throw new Error(`${contractName} deployment record has invalid constructor arguments`);
    }
  }
}

/** Validates the deployment plan and either estimates gas or deploys contracts in order. */
export async function runDeployAll(options: DeployAllOptions): Promise<DeployAllResult> {
  assertBscTestnetChainId(options.chainId);
  const profile = resolveDeploymentProfile(options.profile ?? process.env.DEPLOY_PROFILE);
  const environment = validateEnvironment(options.environment, profile);
  validateExistingRecord(options.existingRecord, profile);
  const dryRun = options.dryRun ?? true;
  const confirmations = options.confirmations ?? 5;
  const log = options.log ?? ((message: string) => console.log(message));
  const deployer = getAddress(await options.signer.getAddress());
  const timestamp = options.existingRecord?.timestamp ?? (await options.latestTimestamp());
  const record: DeploymentRecord = options.existingRecord
    ? {
        ...options.existingRecord,
        profile,
        contracts: { ...options.existingRecord.contracts },
      }
    : {
        chainId: Number(BSC_TESTNET_CHAIN_ID),
        timestamp,
        deployer,
        profile,
        contracts: {},
      };

  if (!Number.isSafeInteger(timestamp) || timestamp <= 0) {
    throw new Error("Deployment timestamp is invalid");
  }

  const plan: DeploymentPlanItem[] = [];
  let tokenAddress = record.contracts.MKAToken?.address;
  const deployerNonce = await options.signer.getNonce();
  let pendingNonce = deployerNonce;

  if (dryRun) log("DRY RUN: estimating gas only; no deployment transaction will be sent.");

  for (const contractName of getContractOrder(profile)) {
    const existing = record.contracts[contractName];
    if (existing) {
      log(`Skipping ${contractName}: already recorded at ${existing.address}`);
      if (contractName === "MKAToken") tokenAddress = existing.address;
      continue;
    }

    const predictedAddress = getCreateAddress({ from: deployer, nonce: pendingNonce });
    const constructorArguments = argumentsFor(
      contractName,
      environment,
      tokenAddress ?? (contractName === "MKAToken" ? predictedAddress : undefined),
      timestamp,
    );
    const estimatedGas = await options.estimateGas(contractName, constructorArguments);

    if (dryRun) {
      const item = {
        contractName,
        address: predictedAddress,
        constructorArguments,
        estimatedGas,
        verifyCommand: verifyCommand(predictedAddress, constructorArguments),
      };
      plan.push(item);
      log(`${contractName}: ${predictedAddress}`);
      log(`  constructor arguments: ${JSON.stringify(constructorArguments)}`);
      log(`  estimated gas: ${estimatedGas.toString()}`);
      log(`  verify: ${item.verifyCommand}`);
      if (contractName === "MKAToken") tokenAddress = predictedAddress;
      pendingNonce += 1;
      continue;
    }

    const deployment = await options.deploy(contractName, constructorArguments);
    await deployment.waitForConfirmations(confirmations);
    const address = getAddress(deployment.address);
    const item = {
      contractName,
      address,
      constructorArguments,
      estimatedGas,
      verifyCommand: verifyCommand(address, constructorArguments),
    };
    plan.push(item);
    record.contracts[contractName] = { address, constructorArguments };
    await options.saveRecord(record);
    log(`${contractName} confirmed at ${address}`);
    log(`  verify: ${item.verifyCommand}`);
    if (contractName === "MKAToken") tokenAddress = address;
    pendingNonce += 1;
  }

  if (dryRun) {
    log("Dry-run complete. Set DRY_RUN=false to submit testnet deployments.");
  }

  return { dryRun, record, plan };
}