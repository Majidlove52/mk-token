import { expect } from "chai";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { ethers } from "hardhat";

const steps = 200;
const supplyCap = 1_000_000_000n * 10n ** 18n;

function randomFrom(seed: number) {
  let state = seed >>> 0;
  return (limit: number) => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state % limit;
  };
}

describe("Seeded contract properties", function () {
  it("keeps MKAToken supply bounded, non-increasing, and reconciled", async function () {
    const signers = await ethers.getSigners();
    const accounts = signers.slice(0, 5);
    const token = await ethers.deployContract("MKAToken", [accounts[0].address]);
    await token.waitForDeployment();
    const balances = new Map(accounts.map((account) => [account.address, 0n]));
    balances.set(accounts[0].address, supplyCap);
    const next = randomFrom(0x4d4b4101);
    let previousSupply = supplyCap;

    for (let step = 0; step < steps; step += 1) {
      const senderIndex = next(accounts.length);
      const recipientIndex = (senderIndex + 1 + next(accounts.length - 1)) % accounts.length;
      const sender = accounts[senderIndex];
      const recipient = accounts[recipientIndex];
      const senderBalance = balances.get(sender.address)!;

      if (senderBalance > 0n && next(4) === 0) {
        const amount = BigInt(next(Number(senderBalance < 1000n ? senderBalance : 1000n)) + 1);
        await token.connect(sender).getFunction("burn")(amount);
        balances.set(sender.address, senderBalance - amount);
      } else if (senderBalance > 0n) {
        const amount = BigInt(next(Number(senderBalance < 1000n ? senderBalance : 1000n)) + 1);
        await token.connect(sender).getFunction("transfer")(recipient.address, amount);
        balances.set(sender.address, senderBalance - amount);
        balances.set(recipient.address, balances.get(recipient.address)! + amount);
      }

      const currentSupply = await token.totalSupply();
      expect(currentSupply <= supplyCap).to.equal(true);
      expect(currentSupply <= previousSupply).to.equal(true);
      expect([...balances.values()].reduce((sum, balance) => sum + balance, 0n))
        .to.equal(currentSupply);
      for (const account of accounts) {
        expect(await token.balanceOf(account.address)).to.equal(balances.get(account.address));
      }
      previousSupply = currentSupply;
    }
  });

  it("keeps MKAStaking accounting, tiers, and unlock rules consistent", async function () {
    const [treasury, ...signers] = await ethers.getSigners();
    const users = signers.slice(0, 3);
    const token = await ethers.deployContract("MKAToken", [treasury.address]);
    await token.waitForDeployment();
    const staking = await ethers.deployContract("MKAStaking", [
      await token.getAddress(), 100n, 250n, 500n,
    ]);
    await staking.waitForDeployment();

    const stakes = new Map(users.map((user) => [user.address, 0n]));
    const unlockAt = new Map(users.map((user) => [user.address, 0]));
    for (const user of users) {
      await token.connect(treasury).getFunction("transfer")(user.address, 10_000n);
      await token.connect(user).getFunction("approve")(await staking.getAddress(), ethers.MaxUint256);
    }

    const next = randomFrom(0x4d4b4102);
    const unlockDelay = Number(await staking.UNLOCK_DELAY());
    for (let step = 0; step < steps; step += 1) {
      const user = users[next(users.length)];
      const currentStake = stakes.get(user.address)!;
      const action = next(4);

      if (action === 0) {
        const amount = BigInt(next(10) + 1);
        await staking.connect(user).getFunction("stake")(amount);
        stakes.set(user.address, currentStake + amount);
        unlockAt.set(user.address, Number(await time.latest()) + unlockDelay);
      } else if (action === 1 && currentStake > 0n) {
        if (Number(await time.latest()) < unlockAt.get(user.address)!) {
          await expect(staking.connect(user).getFunction("unstake")(1n))
            .to.be.revertedWith("MKAStaking: stake is locked");
        } else {
          const amount = BigInt(next(Number(currentStake > 20n ? 20n : currentStake)) + 1);
          await staking.connect(user).getFunction("unstake")(amount);
          stakes.set(user.address, currentStake - amount);
          if (currentStake === amount) unlockAt.set(user.address, 0);
        }
      } else if (action === 2) {
        await time.increase(next(unlockDelay * 2 + 1));
      } else {
        await expect(staking.connect(user).getFunction("unstake")(currentStake + 1n))
          .to.be.revertedWith("MKAStaking: insufficient staked balance");
      }

      const expectedTotal = [...stakes.values()].reduce((sum, amount) => sum + amount, 0n);
      expect(await staking.totalStaked()).to.equal(expectedTotal);
      expect(await token.balanceOf(await staking.getAddress())).to.equal(expectedTotal);
      for (const account of users) {
        const amount = stakes.get(account.address)!;
        const expectedTier = amount >= 500n ? 3n : amount >= 250n ? 2n : amount >= 100n ? 1n : 0n;
        expect(await staking.stakes(account.address)).to.equal(amount);
        expect(await staking.tierOf(account.address)).to.equal(expectedTier);
        if (amount > 0n && Number(await time.latest()) < unlockAt.get(account.address)!) {
          expect(Number(await time.latest())).to.be.lessThan(unlockAt.get(account.address)!);
        }
      }
    }
  });

  it("accounts for every MKABurnVault burn and empties after burnAll", async function () {
    const [treasury, caller] = await ethers.getSigners();
    const token = await ethers.deployContract("MKAToken", [treasury.address]);
    await token.waitForDeployment();
    const vault = await ethers.deployContract("MKABurnVault", [await token.getAddress()]);
    await vault.waitForDeployment();
    const next = randomFrom(0x4d4b4103);
    let expectedBurned = 0n;

    for (let step = 0; step < steps; step += 1) {
      const pending = await vault.pendingBurn();
      if (pending > 0n && next(3) !== 0) {
        await vault.connect(caller).getFunction("burnAll")();
        expectedBurned += pending;
        expect(await token.balanceOf(await vault.getAddress())).to.equal(0n);
      } else {
        await token.connect(treasury).getFunction("transfer")(
          await vault.getAddress(), BigInt(next(1000) + 1),
        );
      }
      expect(await vault.totalBurnedByVault()).to.equal(expectedBurned);
      expect(await vault.pendingBurn()).to.equal(await token.balanceOf(await vault.getAddress()));
    }
  });

  it("keeps MKATeamVesting releases within allocation and zero before cliff", async function () {
    const [, beneficiary] = await ethers.getSigners();
    const startTimestamp = BigInt(await time.latest()) + 10n;
    const cliff = 365n * 24n * 60n * 60n;
    const allocation = 1_000_000n;
    const token = await ethers.deployContract("MKAToken", [beneficiary.address]);
    await token.waitForDeployment();
    const vesting = await ethers.deployContract("MKATeamVesting", [
      beneficiary.address, startTimestamp,
    ]);
    await vesting.waitForDeployment();
    const tokenAddress = await token.getAddress();
    await token.connect(beneficiary).getFunction("transfer")(
      await vesting.getAddress(), allocation,
    );

    const next = randomFrom(0x4d4b4104);
    let currentTimestamp = startTimestamp;
    let previousReleased = 0n;
    for (let step = 0; step < steps; step += 1) {
      currentTimestamp += BigInt(next(30 * 24 * 60 * 60) + 1);
      await time.increaseTo(Number(currentTimestamp));
      if (next(3) !== 0) await vesting["release(address)"](tokenAddress);

      const released = await vesting["released(address)"](tokenAddress);
      expect(released >= previousReleased).to.equal(true);
      expect(released <= allocation).to.equal(true);
      if (currentTimestamp < startTimestamp + cliff) expect(released).to.equal(0n);
      previousReleased = released;
    }
  });
});