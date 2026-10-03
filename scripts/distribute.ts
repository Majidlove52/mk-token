import { Contract, ZeroAddress, formatUnits, getAddress, isAddress } from "ethers";
import { resolve } from "node:path";
import { ethers } from "hardhat";
import {
  ALLOCATION_PERCENTAGES,
  AllocationPercentages,
  amountForBasisPoints,
  percentageToBasisPoints,
  sumAllocationPercentages,
  TOTAL_BASIS_POINTS,
  TOTAL_SUPPLY,
} from "./allocation";

export interface DistributionAddresses {
  tokenAddress: string;
  treasuryAddress: string;
  teamVestingAddress: string;
  publicSaleWallet: string;
  liquidityWallet: string;
  ecosystemWallet: string;
  marketingWallet: string;
  reserveWallet: string;
}

export interface DistributionLine {
  label: string;
  recipient: string;
  basisPoints: bigint;
  amount: bigint;
}

export interface DistributionPlan {
  tokenAddress: string;
  treasuryAddress: string;
  lines: DistributionLine[];
  totalAmount: bigint;
}

type Log = (message: string) => void;

const addressLabels: (keyof DistributionAddresses)[] = [
  "tokenAddress",
  "treasuryAddress",
  "teamVestingAddress",
  "publicSaleWallet",
  "liquidityWallet",
  "ecosystemWallet",
  "marketingWallet",
  "reserveWallet",
];

function validateAddresses(addresses: DistributionAddresses): DistributionAddresses {
  const validated = {} as DistributionAddresses;
  const seen = new Map<string, string>();

  for (const key of addressLabels) {
    const address = addresses[key];
    if (!isAddress(address)) {
      throw new Error(`${key} is not a valid address`);
    }

    const checksumAddress = getAddress(address);
    if (checksumAddress === ZeroAddress) {
      throw new Error(`${key} cannot be the zero address`);
    }

    const normalizedAddress = checksumAddress.toLowerCase();
    const previousLabel = seen.get(normalizedAddress);
    if (previousLabel) {
      throw new Error(`${key} duplicates ${previousLabel}`);
    }

    seen.set(normalizedAddress, key);
    validated[key] = checksumAddress;
  }

  return validated;
}

export function createDistributionPlan(
  addresses: DistributionAddresses,
  percentages: AllocationPercentages = ALLOCATION_PERCENTAGES,
): DistributionPlan {
  const validAddresses = validateAddresses(addresses);
  const percentageValues = Object.values(percentages);
  if (
    percentageValues.some((percentage) => percentage < 0n) ||
    sumAllocationPercentages(percentages) !== 100n
  ) {
    throw new Error("Allocation percentages must be non-negative and sum to 100%");
  }

  const allocations = [
    { key: "publicSale", label: "Public sale", recipient: validAddresses.publicSaleWallet },
    { key: "liquidity", label: "Liquidity", recipient: validAddresses.liquidityWallet },
    { key: "team", label: "Team vesting", recipient: validAddresses.teamVestingAddress },
    { key: "ecosystem", label: "Ecosystem", recipient: validAddresses.ecosystemWallet },
    { key: "marketing", label: "Marketing", recipient: validAddresses.marketingWallet },
    { key: "reserve", label: "Reserve", recipient: validAddresses.reserveWallet },
  ] as const;

  const lines = allocations.map(({ key, label, recipient }) => {
    const basisPoints = percentageToBasisPoints(percentages[key]);
    return {
      label,
      recipient,
      basisPoints,
      amount: amountForBasisPoints(TOTAL_SUPPLY, basisPoints),
    };
  });
  const totalAmount = lines.reduce((sum, line) => sum + line.amount, 0n);

  if (lines.reduce((sum, line) => sum + line.basisPoints, 0n) !== TOTAL_BASIS_POINTS) {
    throw new Error("Allocation basis points must sum to 10,000");
  }
  if (totalAmount !== TOTAL_SUPPLY) {
    throw new Error("Allocation amounts do not equal the fixed token supply");
  }

  return {
    tokenAddress: validAddresses.tokenAddress,
    treasuryAddress: validAddresses.treasuryAddress,
    lines,
    totalAmount,
  };
}

export async function executeDistribution(
  plan: DistributionPlan,
  token: Contract,
  dryRun: boolean,
  log: Log = (message) => console.log(message),
): Promise<void> {
  const treasuryBalance = BigInt(
    await token.getFunction("balanceOf")(plan.treasuryAddress),
  );
  if (treasuryBalance < plan.totalAmount) {
    throw new Error(
      `Insufficient treasury balance: ${formatUnits(treasuryBalance, 18)} MKA available, ${formatUnits(plan.totalAmount, 18)} MKA required`,
    );
  }

  if (dryRun) {
    log("DRY RUN: no transfers will be sent");
    for (const line of plan.lines) {
      log(`${line.label}: ${formatUnits(line.amount, 18)} MKA -> ${line.recipient}`);
    }
    log(`Total: ${formatUnits(plan.totalAmount, 18)} MKA`);
    return;
  }

  for (const line of plan.lines) {
    const transaction = await token.getFunction("transfer")(
      line.recipient,
      line.amount,
    );
    log(`${line.label} transaction hash: ${transaction.hash}`);
    await transaction.wait();
  }

  const balanceRows = [
    { label: "Treasury", address: plan.treasuryAddress },
    ...plan.lines.map(({ label, recipient }) => ({ label, address: recipient })),
  ];
  log("Final MKA balances:");
  for (const row of balanceRows) {
    const balance = BigInt(await token.getFunction("balanceOf")(row.address));
    log(`${row.label} (${row.address}): ${formatUnits(balance, 18)} MKA`);
  }
}

function requiredEnvironmentValue(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Set ${name} in .env`);
  }
  return value;
}

async function main(): Promise<void> {
  const [treasury] = await ethers.getSigners();
  if (!treasury) {
    throw new Error("No treasury signer is configured for this network");
  }

  const plan = createDistributionPlan({
    tokenAddress: requiredEnvironmentValue("TOKEN_ADDRESS"),
    treasuryAddress: await treasury.getAddress(),
    teamVestingAddress: requiredEnvironmentValue("TEAM_VESTING_ADDRESS"),
    publicSaleWallet: requiredEnvironmentValue("PUBLIC_SALE_WALLET"),
    liquidityWallet: requiredEnvironmentValue("LIQUIDITY_WALLET"),
    ecosystemWallet: requiredEnvironmentValue("ECOSYSTEM_WALLET"),
    marketingWallet: requiredEnvironmentValue("MARKETING_WALLET"),
    reserveWallet: requiredEnvironmentValue("RESERVE_WALLET"),
  });

  const token = new Contract(
    plan.tokenAddress,
    [
      "function balanceOf(address) view returns (uint256)",
      "function transfer(address,uint256) returns (bool)",
    ],
    treasury,
  );
  const dryRun = process.env.DRY_RUN?.toLowerCase() !== "false";

  // On mainnet, the treasury must be a Safe Multisig and these transfers must be executed through the Safe, not this script.
  await executeDistribution(plan, token, dryRun);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(__filename)) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}