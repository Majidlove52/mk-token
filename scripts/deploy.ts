import { ethers } from "hardhat";

async function main() {
  const treasury = process.env.TREASURY_ADDRESS;
  const beneficiary = process.env.TEAM_BENEFICIARY;
  if (!treasury || !beneficiary) {
    throw new Error("Set TREASURY_ADDRESS and TEAM_BENEFICIARY in .env");
  }

  const latestBlock = await ethers.provider.getBlock("latest");
  if (!latestBlock) {
    throw new Error("Could not read the latest block timestamp");
  }
  const startTimestamp = latestBlock.timestamp;

  const token = await ethers.deployContract("MKAToken", [treasury]);
  await token.waitForDeployment();
  const vesting = await ethers.deployContract("MKATeamVesting", [
    beneficiary,
    startTimestamp,
  ]);
  await vesting.waitForDeployment();

  const tokenAddress = await token.getAddress();
  const vestingAddress = await vesting.getAddress();
  console.log(`MKAToken: ${tokenAddress}`);
  console.log(`MKATeamVesting: ${vestingAddress}`);
  console.log(`Vesting start timestamp: ${startTimestamp}`);
  console.log("Verify commands:");
  console.log(
    `npx hardhat verify --network bscTestnet ${tokenAddress} ${treasury}`,
  );
  console.log(
    `npx hardhat verify --network bscTestnet ${vestingAddress} ${beneficiary} ${startTimestamp}`,
  );

  // Mainnet requires an external audit, a Multisig treasury, and a liquidity lock first.
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});