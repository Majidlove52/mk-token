import { expect } from "chai";
import { ethers } from "hardhat";
import {
  assertBscTestnetChainId,
  CORE_CONTRACT_ORDER,
  CONTRACT_ORDER,
  runDeployAll,
  type DeploymentContractName,
  type DeploymentEnvironment,
  type DeploymentRecord,
  type DeployAllOptions,
} from "../scripts/lib/deployAll";

const environment: DeploymentEnvironment = {
  rpcUrl: "https://bsc-testnet.example/rpc",
  treasuryAddress: "",
  teamBeneficiary: "",
  tier1: "100",
  tier2: "500",
  tier3: "1000",
};

async function makeOptions(
  overrides: Partial<DeployAllOptions> = {},
): Promise<{ options: DeployAllOptions; deployments: DeploymentContractName[]; saved: DeploymentRecord[] }> {
  const [signer, beneficiary] = await ethers.getSigners();
  environment.treasuryAddress = signer.address;
  environment.teamBeneficiary = beneficiary.address;
  const deployments: DeploymentContractName[] = [];
  const saved: DeploymentRecord[] = [];

  const options: DeployAllOptions = {
    chainId: 97n,
    environment: { ...environment },
    signer,
    profile: "full",
    dryRun: false,
    confirmations: 1,
    latestTimestamp: async () => {
      const block = await ethers.provider.getBlock("latest");
      if (!block) throw new Error("missing test block");
      return block.timestamp;
    },
    estimateGas: async (contractName, constructorArguments) => {
      const factory = await ethers.getContractFactory(contractName, signer);
      const deployment = await factory.getDeployTransaction(...constructorArguments);
      return ethers.provider.estimateGas({ ...deployment, from: signer.address });
    },
    deploy: async (contractName, constructorArguments) => {
      deployments.push(contractName);
      const contract = await ethers.deployContract(contractName, constructorArguments);
      const transaction = contract.deploymentTransaction();
      if (!transaction) throw new Error("missing deployment transaction");
      return {
        address: await contract.getAddress(),
        waitForConfirmations: async (confirmations) => {
          const receipt = await transaction.wait(confirmations);
          if (!receipt || receipt.status !== 1) throw new Error("deployment failed");
        },
      };
    },
    saveRecord: async (record) => {
      saved.push(JSON.parse(JSON.stringify(record)) as DeploymentRecord);
    },
    log: () => undefined,
    ...overrides,
  };

  return { options, deployments, saved };
}

describe("deployAll orchestration", function () {
  it("deploys in order and wires each constructor to its predecessor/configuration", async function () {
    const { options, deployments, saved } = await makeOptions();
    const result = await runDeployAll(options);

    expect(deployments).to.deep.equal([...CONTRACT_ORDER]);
    expect(saved).to.have.lengthOf(4);
    const tokenAddress = result.record.contracts.MKAToken?.address;
    const vestingEntry = result.record.contracts.MKATeamVesting;
    const stakingAddress = result.record.contracts.MKAStaking?.address;
    const vaultAddress = result.record.contracts.MKABurnVault?.address;
    expect(tokenAddress).to.be.a("string");
    expect(stakingAddress).to.be.a("string");
    expect(vaultAddress).to.be.a("string");

    const [signer, beneficiary] = await ethers.getSigners();
    const token = await ethers.getContractAt("MKAToken", tokenAddress!);
    const vesting = await ethers.getContractAt("MKATeamVesting", vestingEntry!.address);
    const staking = await ethers.getContractAt("MKAStaking", stakingAddress!);
    const vault = await ethers.getContractAt("MKABurnVault", vaultAddress!);
    expect(await token.balanceOf(signer.address)).to.equal(await token.totalSupply());
    expect(await vesting.owner()).to.equal(beneficiary.address);
    expect(await vesting.start()).to.equal(vestingEntry!.constructorArguments[1]);
    expect(await staking.getFunction("mkaToken")()).to.equal(tokenAddress);
    expect(await staking.getFunction("tier1Threshold")()).to.equal(ethers.parseEther("100"));
    expect(await staking.getFunction("tier2Threshold")()).to.equal(ethers.parseEther("500"));
    expect(await staking.getFunction("tier3Threshold")()).to.equal(ethers.parseEther("1000"));
    expect(await vault.getFunction("mkaToken")()).to.equal(tokenAddress);
  });

  it("deploys only token and vesting in core profile without tier thresholds", async function () {
    const { options, deployments, saved } = await makeOptions({
      profile: "core",
      environment: {
        ...environment,
        tier1: undefined,
        tier2: undefined,
        tier3: undefined,
      },
    });

    const result = await runDeployAll(options);

    expect(deployments).to.deep.equal([...CORE_CONTRACT_ORDER]);
    expect(result.plan.map(({ contractName }) => contractName)).to.deep.equal([...CORE_CONTRACT_ORDER]);
    expect(result.record.profile).to.equal("core");
    expect(saved).to.have.lengthOf(2);
    const vestingEntry = result.record.contracts.MKATeamVesting;
    const [signer, beneficiary] = await ethers.getSigners();
    const token = await ethers.getContractAt("MKAToken", result.record.contracts.MKAToken!.address);
    const vesting = await ethers.getContractAt("MKATeamVesting", vestingEntry!.address);
    expect(await token.balanceOf(signer.address)).to.equal(await token.totalSupply());
    expect(await vesting.owner()).to.equal(beneficiary.address);
  });

  it("resumes from the first missing deployment and skips recorded contracts", async function () {
    const [signer] = await ethers.getSigners();
    const token = await ethers.deployContract("MKAToken", [signer.address]);
    await token.waitForDeployment();
    const timestamp = await ethers.provider.getBlock("latest").then((block) => block!.timestamp);
    const existingRecord: DeploymentRecord = {
      chainId: 97,
      timestamp,
      deployer: signer.address,
      contracts: {
        MKAToken: {
          address: await token.getAddress(),
          constructorArguments: [signer.address],
        },
      },
    };
    const { options, deployments } = await makeOptions({ existingRecord });

    const result = await runDeployAll(options);

    expect(deployments).to.deep.equal(CONTRACT_ORDER.slice(1));
    expect(result.record.profile).to.equal("full");
    expect(result.record.contracts.MKAToken?.address).to.equal(await token.getAddress());
  });

  it("resumes a core record at vesting without scheduling Phase 2 contracts", async function () {
    const [signer] = await ethers.getSigners();
    const token = await ethers.deployContract("MKAToken", [signer.address]);
    await token.waitForDeployment();
    const timestamp = await ethers.provider.getBlock("latest").then((block) => block!.timestamp);
    const existingRecord: DeploymentRecord = {
      chainId: 97,
      timestamp,
      deployer: signer.address,
      profile: "core",
      contracts: {
        MKAToken: {
          address: await token.getAddress(),
          constructorArguments: [signer.address],
        },
      },
    };
    const { options, deployments } = await makeOptions({
      existingRecord,
      profile: "core",
      environment: {
        ...environment,
        tier1: undefined,
        tier2: undefined,
        tier3: undefined,
      },
    });

    const result = await runDeployAll(options);

    expect(deployments).to.deep.equal(["MKATeamVesting"]);
    expect(result.record.profile).to.equal("core");
    expect(result.record.contracts.MKAToken?.address).to.equal(await token.getAddress());
    expect(result.record.contracts.MKAStaking).to.equal(undefined);
    expect(result.record.contracts.MKABurnVault).to.equal(undefined);
  });

  it("dry-runs every deployment with gas estimates and sends or saves nothing", async function () {
    let estimateCount = 0;
    let deploymentCount = 0;
    let savedCount = 0;
    const [signer] = await ethers.getSigners();
    const nonceBefore = await signer.getNonce();
    const { options } = await makeOptions({
      dryRun: true,
      estimateGas: async () => {
        estimateCount += 1;
        return 123_456n;
      },
      deploy: async () => {
        deploymentCount += 1;
        throw new Error("dry run must not deploy");
      },
      saveRecord: async () => {
        savedCount += 1;
      },
    });

    it("dry-runs core with estimates for exactly two contracts and no writes", async function () {
      let estimateCount = 0;
      let deploymentCount = 0;
      let savedCount = 0;
      const { options } = await makeOptions({
        profile: "core",
        environment: {
          ...environment,
          tier1: undefined,
          tier2: undefined,
          tier3: undefined,
        },
        dryRun: true,
        estimateGas: async () => {
          estimateCount += 1;
          return 123_456n;
        },
        deploy: async () => {
          deploymentCount += 1;
          throw new Error("dry run must not deploy");
        },
        saveRecord: async () => {
          savedCount += 1;
        },
      });

      const result = await runDeployAll(options);

      expect(result.dryRun).to.equal(true);
      expect(result.record.profile).to.equal("core");
      expect(result.plan.map(({ contractName }) => contractName)).to.deep.equal([...CORE_CONTRACT_ORDER]);
      expect(estimateCount).to.equal(2);
      expect(deploymentCount).to.equal(0);
      expect(savedCount).to.equal(0);
    });

    it("requires tier thresholds only for the full profile", async function () {
      const { options: coreOptions } = await makeOptions({
        profile: "core",
        environment: {
          ...environment,
          tier1: undefined,
          tier2: undefined,
          tier3: undefined,
        },
        dryRun: true,
        estimateGas: async () => 1n,
      });
      expect((await runDeployAll(coreOptions)).dryRun).to.equal(true);

      const { options: fullOptions } = await makeOptions({
        environment: { ...environment, tier1: undefined },
      });
      let error: unknown;
      try {
        await runDeployAll(fullOptions);
      } catch (caught) {
        error = caught;
      }
      if (!(error instanceof Error)) throw new Error("expected missing TIER1 validation to fail");
      expect(error.message).to.include("Set TIER1");
    });

    it("rejects resuming a record under a different deployment profile", async function () {
      const [signer] = await ethers.getSigners();
      const existingRecord: DeploymentRecord = {
        chainId: 97,
        timestamp: 1_700_000_000,
        deployer: signer.address,
        profile: "core",
        contracts: {},
      };
      const { options } = await makeOptions({ existingRecord, profile: "full" });

      let error: unknown;
      try {
        await runDeployAll(options);
      } catch (caught) {
        error = caught;
      }
      if (!(error instanceof Error)) throw new Error("expected profile mismatch validation to fail");
      expect(error.message).to.include("does not match requested profile");
    });

    const result = await runDeployAll(options);

    expect(result.dryRun).to.equal(true);
    expect(result.plan).to.have.lengthOf(4);
    expect(estimateCount).to.equal(4);
    expect(deploymentCount).to.equal(0);
    expect(savedCount).to.equal(0);
    expect(await signer.getNonce()).to.equal(nonceBefore);
  });

  it("rejects a chain ID other than BSC Testnet", async function () {
    expect(() => assertBscTestnetChainId(31337n))
      .to.throw("expected BSC Testnet chain ID 97");

    const { options, deployments } = await makeOptions({ chainId: 56n });
    let rejected = false;
    try {
      await runDeployAll(options);
    } catch (error) {
      rejected = error instanceof Error && error.message.includes("expected BSC Testnet chain ID 97");
    }
    expect(rejected).to.equal(true);
    expect(deployments).to.have.lengthOf(0);
  });
});