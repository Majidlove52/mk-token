import { getAddress, isAddress, ZeroAddress } from "ethers";
import { resolve } from "node:path";
import { ethers, network } from "hardhat";

async function main(): Promise<void> {
  if (network.name !== "bscTestnet") {
    throw new Error("MKABurnVault deployment is restricted to BSC testnet");
  }

  const chain = await ethers.provider.getNetwork();
  if (chain.chainId !== 97n) {
    throw new Error("MKABurnVault deployment requires chain ID 97");
  }

  const tokenAddressInput = process.env.TOKEN_ADDRESS;
  if (!tokenAddressInput || !isAddress(tokenAddressInput)) {
    throw new Error("Set a valid TOKEN_ADDRESS in .env");
  }
  const tokenAddress = getAddress(tokenAddressInput);
  if (tokenAddress === ZeroAddress) {
    throw new Error("TOKEN_ADDRESS cannot be the zero address");
  }

  const vault = await ethers.deployContract("MKABurnVault", [tokenAddress]);
  await vault.waitForDeployment();

  const vaultAddress = await vault.getAddress();
  console.log(`MKABurnVault: ${vaultAddress}`);
  console.log(
    `Verify command: npx hardhat verify --network bscTestnet ${vaultAddress} ${tokenAddress}`,
  );

  // Any mainnet deployment requires a completed external audit first.
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(__filename)) {
  main().catch(() => {
    console.error("MKABurnVault deployment failed; check testnet configuration and transaction status.");
    process.exitCode = 1;
  });
}