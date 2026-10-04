import { describe, expect, it } from "vitest";
import {
  calculateTier,
  formatCountdown,
  formatUnitsDisplay,
  nextTierThreshold,
} from "./utils";

const thresholds = {
  tier1: 100n * 10n ** 18n,
  tier2: 500n * 10n ** 18n,
  tier3: 1_000n * 10n ** 18n,
};

describe("MKA dApp pure utilities", () => {
  it("formats token units without floating-point rounding", () => {
    expect(formatUnitsDisplay(1_234_567_890_123_456_789n)).to.equal("1.2345");
    expect(formatUnitsDisplay(-2_500_000_000_000_000_000n)).to.equal("-2.5");
    expect(formatUnitsDisplay(123n, 0)).to.equal("123");
  });

  it("selects tiers at the exact threshold boundaries", () => {
    expect(calculateTier(thresholds.tier1 - 1n, thresholds)).to.equal(0);
    expect(calculateTier(thresholds.tier1, thresholds)).to.equal(1);
    expect(calculateTier(thresholds.tier2, thresholds)).to.equal(2);
    expect(calculateTier(thresholds.tier3, thresholds)).to.equal(3);
  });

  it("returns the next threshold or no threshold at the top tier", () => {
    expect(nextTierThreshold(0n, thresholds)).to.equal(thresholds.tier1);
    expect(nextTierThreshold(thresholds.tier1, thresholds)).to.equal(thresholds.tier2);
    expect(nextTierThreshold(thresholds.tier2, thresholds)).to.equal(thresholds.tier3);
    expect(nextTierThreshold(thresholds.tier3, thresholds)).to.equal(null);
  });

  it("formats lock countdowns and unlocked timestamps", () => {
    expect(formatCountdown(90_061n, 0n)).to.equal("1d 1h 1m 1s");
    expect(formatCountdown(100n, 100n)).to.equal("Unlocked");
    expect(formatCountdown(99n, 100n)).to.equal("Unlocked");
  });
});