import { expect } from "chai";
import { ethers } from "hardhat";
import {
  assertBscTestnetChainId,
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
    expect(result.record.contracts.MKAToken?.address).to.equal(await token.getAddress());
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