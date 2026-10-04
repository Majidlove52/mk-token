export interface TierThresholds {
  tier1: bigint;
  tier2: bigint;
  tier3: bigint;
}

export function isFeatureEnabled(address: string, featureFlag?: string): boolean {
  return address.trim().length > 0 && featureFlag?.trim().toLowerCase() !== "false";
}

export function formatUnitsDisplay(
  value: bigint,
  decimals = 18,
  maxFractionDigits = 4,
): string {
  if (!Number.isInteger(decimals) || decimals < 0) {
    throw new RangeError("decimals must be a non-negative integer");
  }
  if (!Number.isInteger(maxFractionDigits) || maxFractionDigits < 0) {
    throw new RangeError("maxFractionDigits must be a non-negative integer");
  }
  if (decimals === 0 || maxFractionDigits === 0) {
    const unit = 10n ** BigInt(decimals);
    const whole = (value < 0n ? -value : value) / unit;
    return `${value < 0n ? "-" : ""}${whole.toString()}`;
  }

  const precision = Math.min(decimals, maxFractionDigits);
  const sign = value < 0n ? "-" : "";
  const magnitude = value < 0n ? -value : value;
  const unit = 10n ** BigInt(decimals);
  const fractionalUnit = 10n ** BigInt(precision);
  const whole = magnitude / unit;
  const fractional = ((magnitude % unit) * fractionalUnit) / unit;
  const trimmedFraction = fractional
    .toString()
    .padStart(precision, "0")
    .replace(/0+$/, "");

  return `${sign}${whole.toString()}${trimmedFraction ? `.${trimmedFraction}` : ""}`;
}

export function calculateTier(balance: bigint, thresholds: TierThresholds): number {
  if (balance >= thresholds.tier3) return 3;
  if (balance >= thresholds.tier2) return 2;
  if (balance >= thresholds.tier1) return 1;
  return 0;
}

export function nextTierThreshold(
  balance: bigint,
  thresholds: TierThresholds,
): bigint | null {
  const tier = calculateTier(balance, thresholds);
  if (tier === 0) return thresholds.tier1;
  if (tier === 1) return thresholds.tier2;
  if (tier === 2) return thresholds.tier3;
  return null;
}

export function formatCountdown(unlockTimestamp: bigint, nowTimestamp: bigint): string {
  const remaining = unlockTimestamp - nowTimestamp;
  if (remaining <= 0n) return "Unlocked";

  const days = remaining / 86_400n;
  const hours = (remaining % 86_400n) / 3_600n;
  const minutes = (remaining % 3_600n) / 60n;
  const seconds = remaining % 60n;
  return `${days}d ${hours}h ${minutes}m ${seconds}s`;
}