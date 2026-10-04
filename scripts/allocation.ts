export const TOTAL_SUPPLY = 1_000_000_000n * 10n ** 18n;
export const BASIS_POINTS_PER_PERCENT = 100n;
export const TOTAL_BASIS_POINTS = 10_000n;

export const ALLOCATION_PERCENTAGES = {
  publicSale: 30n,
  liquidity: 20n,
  team: 15n,
  ecosystem: 15n,
  marketing: 10n,
  reserve: 10n,
} as const;

export type AllocationPercentages = {
  [Key in keyof typeof ALLOCATION_PERCENTAGES]: bigint;
};

export function percentageToBasisPoints(percentage: bigint): bigint {
  if (percentage < 0n) {
    throw new Error("Allocation percentages cannot be negative");
  }

  return percentage * BASIS_POINTS_PER_PERCENT;
}

export function amountForBasisPoints(
  totalSupply: bigint,
  basisPoints: bigint,
): bigint {
  if (totalSupply < 0n || basisPoints < 0n) {
    throw new Error("Supply and basis points cannot be negative");
  }

  return (totalSupply * basisPoints) / TOTAL_BASIS_POINTS;
}

export function sumAllocationPercentages(
  percentages: AllocationPercentages,
): bigint {
  return Object.values(percentages).reduce(
    (sum, percentage) => sum + percentage,
    0n,
  );
}