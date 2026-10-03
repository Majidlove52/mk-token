import { getAddress, getCreateAddress, isAddress, parseUnits, ZeroAddress } from "ethers";
import type { Signer } from "ethers";

export const BSC_TESTNET_CHAIN_ID = 97n;
export const CONTRACT_ORDER = [
  "MKAToken",
  "MKATeamVesting",
  "MKAStaking",
  "MKABurnVault",
] as const;

export type DeploymentContractName = (typeof CONTRACT_ORDER)[number];
export type ConstructorArgument = string | number;

export interface DeploymentEnvironment {
  rpcUrl: string;
  treasuryAddress: string;
  teamBeneficiary: string;
  tier1: string;
  tier2: string;
  tier3: string;
}

export interface DeploymentEntry {
  address: string;
  constructorArguments: ConstructorArgument[];
}

export interface DeploymentRecord {
  chainId: number;
  timestamp: number;
  deployer: string;
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
  tier1: bigint;
  tier2: bigint;
  tier3: bigint;
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

function validateEnvironment(environment: DeploymentEnvironment): ValidatedEnvironment {
  let rpc: URL;
  try {
    rpc = new URL(environment.rpcUrl);
  } catch {
    throw new Error("BSC_TESTNET_RPC_URL must be a valid HTTP(S) URL");
  }
  if (rpc.protocol !== "http:" && rpc.protocol !== "https:") {
    throw new Error("BSC_TESTNET_RPC_URL must use HTTP or HTTPS");
  }

  const tier1 = requireWholeMka("TIER1", environment.tier1);
  const tier2 = requireWholeMka("TIER2", environment.tier2);
  const tier3 = requireWholeMka("TIER3", environment.tier3);
  if (!(tier1 > 0n && tier2 > tier1 && tier3 > tier2)) {
    throw new Error("TIER1, TIER2, and TIER3 must be non-zero and strictly ascending");
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
    return [tokenAddress, environment.tier1.toString(), environment.tier2.toString(), environment.tier3.toString()];
  }
  return [tokenAddress];
}

function validateExistingRecord(record: DeploymentRecord | undefined): void {
  if (!record) return;
  if (record.chainId !== Number(BSC_TESTNET_CHAIN_ID)) {
    throw new Error(`Deployment record chain ID must be 97, received ${record.chainId}`);
  }
  let foundGap = false;
  for (const contractName of CONTRACT_ORDER) {
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
  const environment = validateEnvironment(options.environment);
  validateExistingRecord(options.existingRecord);

  const dryRun = options.dryRun ?? true;
  const confirmations = options.confirmations ?? 5;
  const log = options.log ?? ((message: string) => console.log(message));
  const deployer = getAddress(await options.signer.getAddress());
  const timestamp = options.existingRecord?.timestamp ?? (await options.latestTimestamp());
  const record: DeploymentRecord = options.existingRecord
    ? {
        ...options.existingRecord,
        contracts: { ...options.existingRecord.contracts },
      }
    : {
        chainId: Number(BSC_TESTNET_CHAIN_ID),
        timestamp,
        deployer,
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

  for (const contractName of CONTRACT_ORDER) {
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