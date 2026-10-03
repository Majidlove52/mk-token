import { expect } from "chai";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { ethers } from "hardhat";

describe("MKZTeamVesting", function () {
  const cliff = 365n * 24n * 60n * 60n;
  const duration = 3n * cliff;
  const allocation = 900n;

  async function deployVesting() {
    const [, beneficiary, other] = await ethers.getSigners();
    const startTimestamp = BigInt(await time.latest()) + 1n;
    const token = await ethers.deployContract("MKZToken", [beneficiary.address]);
    const vesting = await ethers.deployContract("MKZTeamVesting", [
      beneficiary.address,
      startTimestamp,
    ]);
    await token.waitForDeployment();
    await vesting.waitForDeployment();
    await token
      .connect(beneficiary)
      .getFunction("transfer")(await vesting.getAddress(), allocation);

    return { token, vesting, beneficiary, other, startTimestamp };
  }

  it("defines the requested cliff and total vesting duration", async function () {
    const { vesting } = await deployVesting();

    expect(await vesting.CLIFF()).to.equal(cliff);
    expect(await vesting.DURATION()).to.equal(duration);
  });

  it("has nothing releasable before the cliff", async function () {
    const { token, vesting, startTimestamp } = await deployVesting();

    await time.increaseTo(Number(startTimestamp + cliff - 1n));
    expect(await vesting["releasable(address)"](await token.getAddress())).to.equal(0n);
  });

  it("vests one third at the cliff, two thirds at 24 months, and all at 36 months", async function () {
    const { token, vesting, startTimestamp } = await deployVesting();
    const tokenAddress = await token.getAddress();

    await time.increaseTo(Number(startTimestamp + cliff));
    expect(await vesting["releasable(address)"](tokenAddress)).to.equal(300n);
    await vesting["release(address)"](tokenAddress);

    await time.increaseTo(Number(startTimestamp + 2n * cliff));
    expect(await vesting["releasable(address)"](tokenAddress)).to.equal(300n);
    await vesting["release(address)"](tokenAddress);
    expect(await vesting["released(address)"](tokenAddress)).to.equal(600n);

    await time.increaseTo(Number(startTimestamp + duration));
    expect(await vesting["releasable(address)"](tokenAddress)).to.equal(300n);
    await vesting["release(address)"](tokenAddress);
    expect(await vesting["released(address)"](tokenAddress)).to.equal(allocation);
    expect(await token.balanceOf(await vesting.getAddress())).to.equal(0n);
  });

  it("releases vested tokens only to the beneficiary", async function () {
    const { token, vesting, beneficiary, other, startTimestamp } = await deployVesting();
    const beneficiaryBalanceBefore = await token.balanceOf(beneficiary.address);

    await time.increaseTo(Number(startTimestamp + cliff));
    await vesting["release(address)"](await token.getAddress());

    expect(await token.balanceOf(beneficiary.address)).to.equal(
      beneficiaryBalanceBefore + 300n,
    );
    expect(await token.balanceOf(other.address)).to.equal(0n);
    expect(await token.balanceOf(await vesting.getAddress())).to.equal(600n);
  });
});