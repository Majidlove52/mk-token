# MKA Staking Access Tiers

**Phase 2 (deferred):** staking tiers are planned, subject to independent audit and remediation. They are not available at the initial core launch. See [launch phases](launch-phases.md) for entry criteria.

MKA staking is an optional access-control mechanism for MK applications. Staked tokens determine a tier that an application can use to offer configured features. **Staking provides access qualification only: it does not generate rewards, emissions, APY, yield, profit sharing, or a financial return.**

## Tiers

Thresholds are constructor parameters set at deployment and are denominated in MKA base units. The corresponding feature names are placeholders in `gate/config.ts` and must be mapped to features actually released by the apps.

| Tier | Minimum staked MKA | Example access |
| --- | ---: | --- |
| 0 | Below tier 1 | No tier-gated features |
| 1 | TBD (threshold not provided) | Basic scanner |
| 2 | TBD (threshold not provided) | Basic scanner and advanced indicators |
| 3 | TBD (threshold not provided) | Tier 2 features and premium signals |

Tier thresholds are fixed for each deployed staking contract. A wallet's current tier is calculated from its current staked balance.

## Seven-day lock

Each new stake sets the caller's last-stake timestamp and starts a seven-day unlock delay for the full position. Adding more MKA resets that timestamp and restarts the delay for the caller's entire staked balance. Once the delay has elapsed, the caller may unstake any amount up to their own balance. The contract returns tokens only to the caller; it has no administrator withdrawal function.

## Risks and limits

- Smart-contract bugs, token incompatibility, wallet compromise, network disruption, or incorrect tier configuration may affect access or recovery of staked tokens. An external audit is required before mainnet use.
- MKA price may fluctuate, and a staker may lose some or all of the amount spent acquiring tokens. Access tiers do not protect against price volatility.
- Access features depend on application availability and server configuration; a tier does not guarantee uninterrupted product access.
- Mistaken token transfers directly to the staking contract are not recoverable through an administrator function.

Staking is not a deposit, savings product, investment service, or promise of token performance. Review the contract, product terms, and relevant legal disclosures before use.