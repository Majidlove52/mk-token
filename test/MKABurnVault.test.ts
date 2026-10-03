import { expect } from "chai";
import { ethers } from "hardhat";

describe("MKABurnVault", function () {
  async function deployVault() {
    const [treasury, caller, anotherCaller] = await ethers.getSigners();
    const token = await ethers.deployContract("MKAToken", [treasury.address]);
    await token.waitForDeployment();
    const vault = await ethers.deployContract("MKABurnVault", [await token.getAddress()]);
    await vault.waitForDeployment();
    return { token, vault, treasury, caller, anotherCaller };
  }

  it("burns the exact pending balance and reduces total supply", async function () {
    const { token, vault, treasury, caller } = await deployVault();
    const amount = ethers.parseEther("250");
    await token.connect(treasury).getFunction("transfer")(await vault.getAddress(), amount);
    const supplyBefore = await token.totalSupply();

    await expect(vault.connect(caller).getFunction("burnAll")())
      .to.emit(vault, "Burned")
      .withArgs(caller.address, amount);

    expect(await token.totalSupply()).to.equal(supplyBefore - amount);
    expect(await vault.getFunction("pendingBurn")()).to.equal(0n);
    expect(await vault.getFunction("totalBurnedByVault")()).to.equal(amount);
  });

  it("reverts when no MKA is pending", async function () {
    const { vault, caller } = await deployVault();

    await expect(vault.connect(caller).getFunction("burnAll")())
      .to.be.revertedWith("MKABurnVault: no tokens to burn");
  });

  it("allows any caller to burn and accumulates totals across burns", async function () {
    const { token, vault, treasury, caller, anotherCaller } = await deployVault();
    const firstAmount = ethers.parseEther("12");
    const secondAmount = ethers.parseEther("34");

    await token.connect(treasury).getFunction("transfer")(await vault.getAddress(), firstAmount);
    await vault.connect(caller).getFunction("burnAll")();
    expect(await vault.getFunction("totalBurnedByVault")()).to.equal(firstAmount);

    await token.connect(treasury).getFunction("transfer")(await vault.getAddress(), secondAmount);
    await vault.connect(anotherCaller).getFunction("burnAll")();
    expect(await vault.getFunction("totalBurnedByVault")()).to.equal(
      firstAmount + secondAmount,
    );
    expect(await token.totalSupply()).to.equal(
      ethers.parseEther("1000000000") - firstAmount - secondAmount,
    );
  });

  it("rejects a zero token address", async function () {
    await expect(ethers.deployContract("MKABurnVault", [ethers.ZeroAddress]))
      .to.be.revertedWith("MKABurnVault: token is zero address");
  });

  it("has no owner or token withdrawal function in its ABI", async function () {
    const { vault } = await deployVault();

    expect(vault.interface.hasFunction("owner")).to.equal(false);
    expect(vault.interface.hasFunction("withdraw")).to.equal(false);
    expect(vault.interface.hasFunction("withdrawTokens")).to.equal(false);
    expect(vault.interface.hasFunction("transfer")).to.equal(false);
  });
});