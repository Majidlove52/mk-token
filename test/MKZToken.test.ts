import { expect } from "chai";
import { ethers } from "hardhat";

describe("MKZToken", function () {
  const totalSupply = 1_000_000_000n * 10n ** 18n;

  async function deployToken() {
    const [treasury] = await ethers.getSigners();
    const token = await ethers.deployContract("MKZToken", [treasury.address]);
    await token.waitForDeployment();
    return { token, treasury };
  }

  it("has the expected metadata and fixed supply held by treasury", async function () {
    const { token, treasury } = await deployToken();

    expect(await token.name()).to.equal("MK Zone Token");
    expect(await token.symbol()).to.equal("MKZ");
    expect(await token.decimals()).to.equal(18);
    expect(await token.totalSupply()).to.equal(totalSupply);
    expect(await token.balanceOf(treasury.address)).to.equal(totalSupply);
  });

  it("rejects a zero-address treasury", async function () {
    await expect(ethers.deployContract("MKZToken", [ethers.ZeroAddress]))
      .to.be.revertedWith("MKZ: treasury is zero address");
  });

  it("supports transfer, approve, and transferFrom", async function () {
    const { token, treasury } = await deployToken();
    const [, recipient, spender] = await ethers.getSigners();

    await token.transfer(recipient.address, 100n);
    expect(await token.balanceOf(recipient.address)).to.equal(100n);

    await token.approve(spender.address, 40n);
    expect(await token.allowance(treasury.address, spender.address)).to.equal(40n);
    await token
      .connect(spender)
      .getFunction("transferFrom")(treasury.address, recipient.address, 40n);

    expect(await token.balanceOf(recipient.address)).to.equal(140n);
    expect(await token.allowance(treasury.address, spender.address)).to.equal(0n);
  });

  it("allows holders to burn and approved accounts to burnFrom", async function () {
    const { token, treasury } = await deployToken();
    const [, holder, spender] = await ethers.getSigners();

    await token.transfer(holder.address, 100n);
    await token.connect(holder).getFunction("burn")(10n);
    expect(await token.balanceOf(holder.address)).to.equal(90n);
    expect(await token.totalSupply()).to.equal(totalSupply - 10n);

    await token.connect(holder).getFunction("approve")(spender.address, 20n);
    await token.connect(spender).getFunction("burnFrom")(holder.address, 20n);
    expect(await token.balanceOf(holder.address)).to.equal(70n);
    expect(await token.totalSupply()).to.equal(totalSupply - 30n);
  });

  it("does not expose a mint function", async function () {
    const { token } = await deployToken();

    expect(token.interface.hasFunction("mint")).to.equal(false);
  });
});