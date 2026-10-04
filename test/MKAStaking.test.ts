import { expect } from "chai";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { ethers } from "hardhat";

describe("MKAStaking", function () {
  const tier1 = ethers.parseEther("100");
  const tier2 = ethers.parseEther("500");
  const tier3 = ethers.parseEther("1000");

  async function deployStaking() {
    const [treasury, staker, other] = await ethers.getSigners();
    const token = await ethers.deployContract("MKAToken", [treasury.address]);
    await token.waitForDeployment();
    const staking = await ethers.deployContract("MKAStaking", [
      await token.getAddress(),
      tier1,
      tier2,
      tier3,
    ]);
    await staking.waitForDeployment();
    await token
      .connect(treasury)
      .getFunction("transfer")(staker.address, ethers.parseEther("2000"));
    await token
      .connect(staker)
      .getFunction("approve")(await staking.getAddress(), ethers.MaxUint256);

    return { token, staking, treasury, staker, other };
  }

  it("stakes and unstakes with exact balances and aggregate accounting", async function () {
    const { token, staking, staker } = await deployStaking();
    const amount = ethers.parseEther("4");
    const stakingAddress = await staking.getAddress();

    await expect(staking.connect(staker).getFunction("stake")(amount))
      .to.emit(staking, "Staked")
      .withArgs(staker.address, amount);
    expect(await token.balanceOf(staker.address)).to.equal(ethers.parseEther("1996"));
    expect(await token.balanceOf(stakingAddress)).to.equal(amount);
    expect(await staking.getFunction("stakedBalance")(staker.address)).to.equal(amount);
    expect(await staking.getFunction("totalStaked")()).to.equal(amount);
    expect(await staking.getFunction("lastStakeTimestamp")(staker.address)).to.equal(
      await time.latest(),
    );

    await time.increase(Number(await staking.getFunction("UNLOCK_DELAY")()));
    await expect(staking.connect(staker).getFunction("unstake")(amount))
      .to.emit(staking, "Unstaked")
      .withArgs(staker.address, amount);

    expect(await token.balanceOf(staker.address)).to.equal(ethers.parseEther("2000"));
    expect(await token.balanceOf(stakingAddress)).to.equal(0n);
    expect(await staking.getFunction("stakedBalance")(staker.address)).to.equal(0n);
    expect(await staking.getFunction("totalStaked")()).to.equal(0n);
    expect(await staking.getFunction("lastStakeTimestamp")(staker.address)).to.equal(0n);
  });

  it("changes tiers below, at, and above each threshold", async function () {
    const { staking, staker } = await deployStaking();

    const stakeAndCheck = async (amount: bigint, expectedTier: bigint) => {
      await staking.connect(staker).getFunction("stake")(amount);
      expect(await staking.getFunction("tierOf")(staker.address)).to.equal(expectedTier);
    };

    await stakeAndCheck(tier1 - 1n, 0n);
    await stakeAndCheck(1n, 1n);
    await stakeAndCheck(tier2 - tier1 - 1n, 1n);
    await stakeAndCheck(1n, 2n);
    await stakeAndCheck(tier3 - tier2 - 1n, 2n);
    await stakeAndCheck(1n, 3n);
    await stakeAndCheck(1n, 3n);
  });

  it("rejects unstaking before seven days and permits it after", async function () {
    const { staking, staker } = await deployStaking();
    const amount = ethers.parseEther("1");

    await staking.connect(staker).getFunction("stake")(amount);
    await expect(staking.connect(staker).getFunction("unstake")(amount))
      .to.be.revertedWith("MKAStaking: stake is locked");

    await time.increase(Number(await staking.getFunction("UNLOCK_DELAY")()));
    await staking.connect(staker).getFunction("unstake")(amount);
    expect(await staking.getFunction("stakedBalance")(staker.address)).to.equal(0n);
  });

  it("rejects zero amounts and unstaking more than the caller's balance", async function () {
    const { staking, staker } = await deployStaking();

    await expect(staking.connect(staker).getFunction("stake")(0n))
      .to.be.revertedWith("MKAStaking: zero amount");
    await expect(staking.connect(staker).getFunction("unstake")(0n))
      .to.be.revertedWith("MKAStaking: zero amount");
    await staking.connect(staker).getFunction("stake")(1n);
    await expect(staking.connect(staker).getFunction("unstake")(2n))
      .to.be.revertedWith("MKAStaking: insufficient staked balance");
  });

  it("resets the seven-day lock when the staker adds more MKA", async function () {
    const { staking, staker } = await deployStaking();
    const amount = ethers.parseEther("1");
    const delay = Number(await staking.getFunction("UNLOCK_DELAY")());

    await staking.connect(staker).getFunction("stake")(amount);
    await time.increase(delay - 24 * 60 * 60);
    await staking.connect(staker).getFunction("stake")(amount);
    await time.increase(24 * 60 * 60);
    await expect(staking.connect(staker).getFunction("unstake")(amount))
      .to.be.revertedWith("MKAStaking: stake is locked");

    await time.increase(delay - 24 * 60 * 60);
    await staking.connect(staker).getFunction("unstake")(amount);
    expect(await staking.getFunction("stakedBalance")(staker.address)).to.equal(amount);
  });

  it("rejects a zero token and zero or non-ascending tier thresholds", async function () {
    const { token } = await deployStaking();
    const tokenAddress = await token.getAddress();

    await expect(
      ethers.deployContract("MKAStaking", [ethers.ZeroAddress, tier1, tier2, tier3]),
    ).to.be.revertedWith("MKAStaking: token is zero address");
    await expect(
      ethers.deployContract("MKAStaking", [tokenAddress, 0n, 1n, 2n]),
    ).to.be.revertedWith("MKAStaking: invalid tier thresholds");
    await expect(
      ethers.deployContract("MKAStaking", [tokenAddress, 1n, 1n, 2n]),
    ).to.be.revertedWith("MKAStaking: invalid tier thresholds");
    await expect(
      ethers.deployContract("MKAStaking", [tokenAddress, 1n, 2n, 2n]),
    ).to.be.revertedWith("MKAStaking: invalid tier thresholds");
  });

  it("does not expose administrative withdrawals or allow withdrawing another user's stake", async function () {
    const { staking, staker, other } = await deployStaking();
    expect(staking.interface.hasFunction("withdraw")).to.equal(false);
    expect(staking.interface.hasFunction("emergencyWithdraw")).to.equal(false);
    expect(staking.interface.hasFunction("rescueTokens")).to.equal(false);
    expect(staking.interface.hasFunction("owner")).to.equal(false);
    expect(staking.interface.hasFunction("withdrawFor")).to.equal(false);
    expect(staking.interface.getFunction("unstake")?.inputs.map((input) => input.type))
      .to.deep.equal(["uint256"]);

    await staking.connect(staker).getFunction("stake")(ethers.parseEther("1"));
    await time.increase(Number(await staking.getFunction("UNLOCK_DELAY")()));
    await expect(staking.connect(other).getFunction("unstake")(1n))
      .to.be.revertedWith("MKAStaking: insufficient staked balance");
    expect(await staking.getFunction("stakedBalance")(staker.address)).to.equal(
      ethers.parseEther("1"),
    );
  });

  it("blocks a malicious token's reentrant stake callback", async function () {
    const [treasury, staker] = await ethers.getSigners();
    const token = await ethers.deployContract("ReentrantERC20Mock");
    await token.waitForDeployment();
    const staking = await ethers.deployContract("MKAStaking", [
      await token.getAddress(),
      10n,
      20n,
      30n,
    ]);
    await staking.waitForDeployment();

    await token.getFunction("setStakingContract")(await staking.getAddress());
    await token.connect(treasury).getFunction("transfer")(staker.address, 100n);
    await token.connect(staker).getFunction("approve")(await staking.getAddress(), 100n);
    await staking.connect(staker).getFunction("stake")(10n);

    expect(await token.getFunction("attemptedReentry")()).to.equal(true);
    expect(await token.getFunction("reentrySucceeded")()).to.equal(false);
    expect(await staking.getFunction("stakedBalance")(staker.address)).to.equal(10n);
    expect(await staking.getFunction("totalStaked")()).to.equal(10n);
  });
});