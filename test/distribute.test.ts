import { expect } from "chai";
import { Contract } from "ethers";
import { ethers } from "hardhat";
import {
  ALLOCATION_PERCENTAGES,
  amountForBasisPoints,
  percentageToBasisPoints,
  TOTAL_SUPPLY,
} from "../scripts/allocation";
import {
  createDistributionPlan,
  DistributionAddresses,
  executeDistribution,
} from "../scripts/distribute";

describe("MKA distribution", function () {
  async function setupDistribution() {
    const [treasury, publicSale, liquidity, ecosystem, marketing, reserve] =
      await ethers.getSigners();
    const token = await ethers.deployContract("MKAToken", [treasury.address]);
    const vesting = await ethers.deployContract("MKATeamVesting", [
      reserve.address,
      BigInt(await ethers.provider.getBlockNumber()),
    ]);
    await token.waitForDeployment();
    await vesting.waitForDeployment();

    const addresses: DistributionAddresses = {
      tokenAddress: await token.getAddress(),
      treasuryAddress: treasury.address,
      teamVestingAddress: await vesting.getAddress(),
      publicSaleWallet: publicSale.address,
      liquidityWallet: liquidity.address,
      ecosystemWallet: ecosystem.address,
      marketingWallet: marketing.address,
      reserveWallet: reserve.address,
    };
    const plan = createDistributionPlan(addresses);
    const tokenContract = new Contract(
      addresses.tokenAddress,
      token.interface,
      treasury,
    );

    return { addresses, plan, token, tokenContract, treasury };
  }

  it("distributes the exact allocation and leaves total supply unchanged", async function () {
    const { addresses, plan, token, tokenContract } = await setupDistribution();
    const output: string[] = [];

    await executeDistribution(plan, tokenContract, false, (line) => output.push(line));

    expect(await token.balanceOf(addresses.treasuryAddress)).to.equal(0n);
    expect(await token.balanceOf(addresses.publicSaleWallet)).to.equal(
      amountForBasisPoints(TOTAL_SUPPLY, percentageToBasisPoints(30n)),
    );
    expect(await token.balanceOf(addresses.liquidityWallet)).to.equal(
      amountForBasisPoints(TOTAL_SUPPLY, percentageToBasisPoints(20n)),
    );
    expect(await token.balanceOf(addresses.teamVestingAddress)).to.equal(
      150_000_000n * 10n ** 18n,
    );
    expect(await token.balanceOf(addresses.ecosystemWallet)).to.equal(
      amountForBasisPoints(TOTAL_SUPPLY, percentageToBasisPoints(15n)),
    );
    expect(await token.balanceOf(addresses.marketingWallet)).to.equal(
      amountForBasisPoints(TOTAL_SUPPLY, percentageToBasisPoints(10n)),
    );
    expect(await token.balanceOf(addresses.reserveWallet)).to.equal(
      amountForBasisPoints(TOTAL_SUPPLY, percentageToBasisPoints(10n)),
    );
    expect(await token.totalSupply()).to.equal(TOTAL_SUPPLY);
    expect(output.filter((line) => line.includes("transaction hash:"))).to.have.lengthOf(6);
    expect(output.some((line) => line === "Final MKA balances:")).to.equal(true);
  });

  it("prints a dry-run plan without sending transfers", async function () {
    const { addresses, plan, token, tokenContract } = await setupDistribution();
    const output: string[] = [];

    await executeDistribution(plan, tokenContract, true, (line) => output.push(line));

    expect(output[0]).to.equal("DRY RUN: no transfers will be sent");
    expect(output.some((line) => line.includes("transaction hash:"))).to.equal(false);
    expect(await token.balanceOf(addresses.treasuryAddress)).to.equal(TOTAL_SUPPLY);
    expect(await token.balanceOf(addresses.publicSaleWallet)).to.equal(0n);
  });

  it("rejects duplicate, zero, and invalid addresses", async function () {
    const { addresses } = await setupDistribution();

    expect(() =>
      createDistributionPlan({
        ...addresses,
        reserveWallet: addresses.publicSaleWallet,
      }),
    ).to.throw("duplicates");
    expect(() =>
      createDistributionPlan({ ...addresses, liquidityWallet: ethers.ZeroAddress }),
    ).to.throw("zero address");
    expect(() =>
      createDistributionPlan({ ...addresses, marketingWallet: "not-an-address" }),
    ).to.throw("valid address");
  });

  it("rejects percentages that do not sum to 100", async function () {
    const { addresses } = await setupDistribution();

    expect(() =>
      createDistributionPlan(addresses, {
        ...ALLOCATION_PERCENTAGES,
        reserve: 0n,
      }),
    ).to.throw("sum to 100%");
  });

  it("rejects distribution when the treasury balance is insufficient", async function () {
    const { addresses, plan, token, tokenContract, treasury } =
      await setupDistribution();

    await token.connect(treasury).getFunction("burn")(1n);
    let errorMessage = "";
    try {
      await executeDistribution(plan, tokenContract, false, () => undefined);
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
    }
    expect(errorMessage).to.contain("Insufficient treasury balance");
    expect(await token.balanceOf(addresses.publicSaleWallet)).to.equal(0n);
  });
});