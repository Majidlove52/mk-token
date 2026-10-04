import { expect } from "chai";
import { buildAppEnvContents } from "../scripts/generateAppEnv";
import {
  getContractOrder,
  getRecordProfile,
  resolveDeploymentProfile,
  type DeploymentRecord,
} from "../scripts/lib/deployAll";

const coreRecord: DeploymentRecord = {
  chainId: 97,
  timestamp: 1_700_000_000,
  deployer: "0x0000000000000000000000000000000000000001",
  profile: "core",
  contracts: {
    MKAToken: {
      address: "0x0000000000000000000000000000000000000002",
      constructorArguments: ["0x0000000000000000000000000000000000000001"],
    },
    MKATeamVesting: {
      address: "0x0000000000000000000000000000000000000003",
      constructorArguments: ["0x0000000000000000000000000000000000000004", 1_700_000_000],
    },
  },
};

const fullRecord: DeploymentRecord = {
  ...coreRecord,
  profile: "full",
  contracts: {
    ...coreRecord.contracts,
    MKAStaking: {
      address: "0x0000000000000000000000000000000000000005",
      constructorArguments: [
        "0x0000000000000000000000000000000000000002",
        "100",
        "500",
        "1000",
      ],
    },
    MKABurnVault: {
      address: "0x0000000000000000000000000000000000000006",
      constructorArguments: ["0x0000000000000000000000000000000000000002"],
    },
  },
};

describe("deployment profiles", function () {
  it("defaults to core and rejects unsupported profile names", function () {
    expect(resolveDeploymentProfile()).to.equal("core");
    expect(resolveDeploymentProfile(" FULL ")).to.equal("full");
    expect(() => resolveDeploymentProfile("mainnet")).to.throw("DEPLOY_PROFILE");
    expect(getContractOrder("core")).to.deep.equal(["MKAToken", "MKATeamVesting"]);
    expect(getContractOrder("full")).to.deep.equal([
      "MKAToken",
      "MKATeamVesting",
      "MKAStaking",
      "MKABurnVault",
    ]);
  });

  it("emits empty Phase 2 addresses and disabled flags for a core app config", function () {
    const contents = buildAppEnvContents(coreRecord, "https://bsc-testnet.example/rpc");

    expect(contents).to.include("VITE_STAKING_ADDRESS=\n");
    expect(contents).to.include("VITE_BURN_VAULT_ADDRESS=\n");
    expect(contents).to.include("VITE_FEATURES_STAKING=false\n");
    expect(contents).to.include("VITE_FEATURES_BURN=false\n");
    expect(contents).to.include(`VITE_TOKEN_ADDRESS=${coreRecord.contracts.MKAToken!.address}\n`);
    expect(contents).to.include(`VITE_VESTING_ADDRESS=${coreRecord.contracts.MKATeamVesting!.address}\n`);
  });

  it("keeps Phase 2 addresses enabled for a full app config", function () {
    const contents = buildAppEnvContents(fullRecord, "https://bsc-testnet.example/rpc");

    expect(contents).to.include(`VITE_STAKING_ADDRESS=${fullRecord.contracts.MKAStaking!.address}\n`);
    expect(contents).to.include(`VITE_BURN_VAULT_ADDRESS=${fullRecord.contracts.MKABurnVault!.address}\n`);
    expect(contents).to.include("VITE_FEATURES_STAKING=true\n");
    expect(contents).to.include("VITE_FEATURES_BURN=true\n");
  });

  it("treats pre-profile deployment records as legacy full profiles", function () {
    const legacyRecord: DeploymentRecord = { ...fullRecord, profile: undefined };
    expect(getRecordProfile(legacyRecord)).to.equal("full");
    expect(() => buildAppEnvContents(legacyRecord, "https://bsc-testnet.example/rpc")).not.to.throw();
  });
});
