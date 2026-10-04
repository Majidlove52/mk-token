# MKA Launch Phases

MKA launches in staged profiles on BNB Chain Testnet (chain ID 97 in this repository). Only the Phase 1 core profile is in scope for the initial public launch. Phase 2 features are not available at launch.

## Phase 1: Core

Phase 1 consists of:

- `MKAToken`, with fixed supply minted once at deployment.
- `MKATeamVesting`, with the documented team vesting schedule.
- Treasury control through a Safe Multisig.
- A disclosed and independently verifiable liquidity lock.
- A public transparency page for total supply, circulating supply, vesting balances, and verified contract links.

Staking, the burn vault, token gating, buybacks, and dedicated buyback-and-burn functionality are not part of the core profile and must not be presented as available at launch. Any utility beyond the core token and vesting is planned, subject to independent audit, separate approvals, and operational readiness.

## Phase 2: Deferred utility

Phase 2 may include:

- `MKAStaking` and its access tiers.
- `MKABurnVault` and any dedicated burn workflow.
- The off-chain token-gate service and integrations.
- Related staking, burn, and token-gated dApp features.
- Any buyback policy or implementation, if separately approved.

All Phase 2 functionality is planned, subject to independent audit; it is deferred until the entry criteria below are met. No audit completion or launch approval is implied here.

### Phase 2 entry criteria

Do not enable or deploy Phase 2 until all of the following are recorded and reviewed:

1. A written Phase 2 specification and confirmed audit scope covering the staking contract, burn vault, gate service, and affected dApp surfaces.
2. An independent security audit of the Phase 2 scope, with all critical/high findings resolved and remaining findings documented with explicit risk acceptance.
3. A focused re-review of fixes and passing contract, service, SDK, dApp, and integration tests for the release commit.
4. Updated threat model, deployment/resumption procedure, access-control review, monitoring, incident response, and recovery procedures.
5. Final product, legal, and operational approval, including updated public documentation and explicit feature enablement for the intended release.

The Phase 2 checklist is a gate, not a claim that any audit or approval is complete.

## Profile mapping

`DEPLOY_PROFILE=core` is the default and deploys only token and vesting. `DEPLOY_PROFILE=full` retains the historical four-contract deployment order and requires `TIER1`, `TIER2`, and `TIER3`. Use the full profile only for the separately approved Phase 2 testnet process. Both profiles are guarded to BSC Testnet chain ID 97, and deployment remains dry-run by default.

Existing deployment records without a `profile` field are treated as legacy `full` records for safe resumability; select `DEPLOY_PROFILE=full` when resuming them.
