# Release Readiness

This is a release-readiness checklist, not a deployment configuration. Repository deployment scripts are restricted to BSC Testnet (chain ID 97); no mainnet network is configured here. Do not treat a checked item as evidence unless its artifact has been reviewed and linked.

## Phase 1: core release gates

| Item | Owner | Status |
| --- | --- | --- |
| Independent Scope A review of `MKAToken` and `MKATeamVesting`; remediation reviewed | Security lead | Not started |
| Safe Multisig treasury and signer procedures reviewed | Treasury lead | Not started |
| Liquidity lock terms and on-chain evidence independently checked | Treasury lead | Not started |
| Core deployment addresses and constructor parameters verified on BscScan | Release lead | Not started |
| Transparency page limited to token, vesting, and supply data; links checked | Product and security leads | Not started |
| Public documentation, allocation disclosures, and risk language reviewed | Product lead | Not started |
| Legal review of proposed launch, allocation, and jurisdiction requirements | Legal counsel | Not started |
| Slither analysis for the release commit; findings reviewed | Security lead | Not started |
| Incident response contacts verified and reachable | Security lead | Not started |

No audit completion is claimed by this checklist. The audit scope, architecture, FAQ, and invariant package are preparation materials only.

## Phase 2: entry gate (deferred)

Phase 2 includes staking, burn vault, token-gate service, and their dApp integrations. Keep these features disabled until each gate is complete:

| Gate | Owner | Status |
| --- | --- | --- |
| Written Phase 2 specification, threat model, and Scope B audit scope approved | Product and security leads | Not started |
| Independent review of `MKAStaking`, `MKABurnVault`, gate service, SDK, and affected dApp surfaces completed | Security lead | Not started |
| Critical/high findings fixed; remaining findings documented and explicitly accepted | Security lead | Not started |
| Fixes re-reviewed against the identified release commit | Security lead | Not started |
| Contract, server, SDK, dApp, and integration tests pass for the release | Engineering lead | Not started |
| Deployment/resumption, monitoring, incident response, and recovery procedures tested | Operations lead | Not started |
| Legal/product approval and updated public disclosures completed | Product and legal leads | Not started |
| Phase 2 feature flags and deployment profile explicitly approved for release | Release lead | Not started |

Do not enable `DEPLOY_PROFILE=full` or Phase 2 app flags until the gate is documented as complete. See [launch phases](launch-phases.md) and [audit scope](audit-scope.md).
