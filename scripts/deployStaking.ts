import { getAddress, isAddress, parseUnits, ZeroAddress } from "ethers";
import { resolve } from "node:path";
import { ethers, network } from "hardhat";

function requiredEnvironmentValue(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Set ${name} in .env`);
  }
  return value;
}

function wholeMkaToBaseUnits(name: string): bigint {
  const value = requiredEnvironmentValue(name);
  if (!/^\d+$/.test(value)) {
    throw new Error(`${name} must be a whole number of MKA`);
  }
  return parseUnits(value, 18);
}

async function main(): Promise<void> {
  if (network.name !== "bscTestnet") {
    throw new Error("MKAStaking deployment is restricted to BSC testnet");
  }

  const chain = await ethers.provider.getNetwork();
  if (chain.chainId !== 97n) {
    throw new Error("MKAStaking deployment requires chain ID 97");
  }

  const tokenAddressInput = requiredEnvironmentValue("TOKEN_ADDRESS");
  if (!isAddress(tokenAddressInput)) {
    throw new Error("TOKEN_ADDRESS must be a valid address");
  }
  const tokenAddress = getAddress(tokenAddressInput);
  if (tokenAddress === ZeroAddress) {
    throw new Error("TOKEN_ADDRESS cannot be the zero address");
  }

  const tier1 = wholeMkaToBaseUnits("TIER1");
  const tier2 = wholeMkaToBaseUnits("TIER2");
  const tier3 = wholeMkaToBaseUnits("TIER3");
  if (!(tier1 > 0n && tier2 > tier1 && tier3 > tier2)) {
    throw new Error("Tier thresholds must be non-zero and strictly ascending");
  }

  const staking = await ethers.deployContract("MKAStaking", [
    tokenAddress,
    tier1,
    tier2,
    tier3,
  ]);
  await staking.waitForDeployment();

  const stakingAddress = await staking.getAddress();
  console.log(`MKAStaking: ${stakingAddress}`);
  console.log(
    `Verify command: npx hardhat verify --network bscTestnet ${stakingAddress} ${tokenAddress} ${tier1} ${tier2} ${tier3}`,
  );

  // Any mainnet deployment requires a completed external audit first.
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(__filename)) {
  main().catch(() => {
    console.error("MKAStaking deployment failed; check testnet configuration and transaction status.");
    process.exitCode = 1;
  });
}