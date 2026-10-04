import "dotenv/config";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { ethers, network } from "hardhat";
import {
  assertBscTestnetChainId,
  resolveDeploymentProfile,
  runDeployAll,
  type DeploymentProfile,
  type DeploymentContractName,
  type DeploymentEnvironment,
  type DeploymentRecord,
} from "./lib/deployAll";

function requiredEnvironmentValue(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Set ${name} in .env`);
  return value;
}

function deploymentProfile(): DeploymentProfile {
  return resolveDeploymentProfile(process.env.DEPLOY_PROFILE);
}

function readDeploymentRecord(path: string): DeploymentRecord | undefined {
  if (!existsSync(path)) return undefined;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as DeploymentRecord;
  } catch {
    throw new Error(`Could not parse deployment record at ${path}`);
  }
}

async function main(): Promise<void> {
  if (network.name !== "bscTestnet") {
    throw new Error("Deployment orchestration is restricted to the bscTestnet network");
  }

  const chain = await ethers.provider.getNetwork();
  assertBscTestnetChainId(chain.chainId);
  const profile = deploymentProfile();

  const dryRunSetting = (process.env.DRY_RUN ?? "true").toLowerCase();
  if (dryRunSetting !== "true" && dryRunSetting !== "false") {
    throw new Error("DRY_RUN must be either true or false");
  }
  const dryRun = dryRunSetting !== "false";
  const environment: DeploymentEnvironment = {
    rpcUrl: requiredEnvironmentValue("BSC_TESTNET_RPC_URL"),
    treasuryAddress: requiredEnvironmentValue("TREASURY_ADDRESS"),
    teamBeneficiary: requiredEnvironmentValue("TEAM_BENEFICIARY"),
    ...(profile === "full"
      ? {
          tier1: requiredEnvironmentValue("TIER1"),
          tier2: requiredEnvironmentValue("TIER2"),
          tier3: requiredEnvironmentValue("TIER3"),
        }
      : {}),
  };
  const [signer] = await ethers.getSigners();
  if (!signer) throw new Error("No deployer signer is configured");

  const recordPath = resolve(process.cwd(), "deployments/bscTestnet.json");
  const factoryFor = (name: DeploymentContractName) =>
    ethers.getContractFactory(name, signer);

  await runDeployAll({
    chainId: chain.chainId,
    environment,
    signer,
    profile,
    dryRun,
    existingRecord: readDeploymentRecord(recordPath),
    latestTimestamp: async () => {
      const block = await ethers.provider.getBlock("latest");
      if (!block) throw new Error("Could not read latest testnet block timestamp");
      return block.timestamp;
    },
    estimateGas: async (contractName, constructorArguments) => {
      const factory = await factoryFor(contractName);
      const transaction = await factory.getDeployTransaction(...constructorArguments);
      return ethers.provider.estimateGas({
        ...transaction,
        from: await signer.getAddress(),
      });
    },
    deploy: async (contractName, constructorArguments) => {
      const factory = await factoryFor(contractName);
      const contract = await factory.deploy(...constructorArguments);
      const transaction = contract.deploymentTransaction();
      if (!transaction) throw new Error(`No deployment transaction for ${contractName}`);
      return {
        address: await contract.getAddress(),
        waitForConfirmations: async (confirmations) => {
          const receipt = await transaction.wait(confirmations);
          if (!receipt || receipt.status !== 1) {
            throw new Error(`${contractName} deployment was not confirmed successfully`);
          }
        },
      };
    },
    saveRecord: async (record) => {
      mkdirSync(resolve(process.cwd(), "deployments"), { recursive: true });
      const temporaryPath = `${recordPath}.tmp`;
      writeFileSync(temporaryPath, `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600 });
      renameSync(temporaryPath, recordPath);
    },
  });
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(__filename)) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}