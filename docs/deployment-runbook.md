# BSC Testnet Deployment Runbook

This runbook covers BSC Testnet only (chain ID 97). The deployment scripts do not configure mainnet. Core is the default launch profile; Phase 2 is deferred until its independent audit and entry gates are complete. Never commit `.env`, private keys, seed phrases, or API keys.

## 1. Prepare local testnet configuration

```sh
npm ci
cp .env.example .env
```

Set the following in the ignored local `.env`:

- `BSC_TESTNET_RPC_URL`: public HTTP(S) RPC for chain ID 97.
- `DEPLOY_PROFILE=core` (default).
- `DEPLOYER_PRIVATE_KEY`: only a dedicated BSC Testnet deployer key.
- `TREASURY_ADDRESS` and `TEAM_BENEFICIARY`: intended BSC Testnet addresses.
- `DRY_RUN=true`.

The core profile does not require `TIER1`, `TIER2`, or `TIER3`. Keep all credentials local. For a dry run, `BSCSCAN_API_KEY` is not needed.

## 2. Review the core dry run

Fund the dedicated testnet deployer with test BNB from the official [BNB Chain testnet faucet](https://www.bnbchain.org/en/testnet-faucet), then run:

```sh
DEPLOY_PROFILE=core DRY_RUN=true npx hardhat run scripts/deployAll.ts --network bscTestnet
```

The default dry run estimates only the core deployment plan: `MKAToken`, then `MKATeamVesting`. It prints predicted addresses, constructor arguments, gas estimates, and verify commands. It sends no deployment transactions and writes no deployment record. Review every output before any separately approved testnet deployment.

## 3. Deploy the core profile on testnet

Only an operator, after separate explicit authorization and review, may set `DRY_RUN=false` locally and run:

```sh
DEPLOY_PROFILE=core DRY_RUN=false npx hardhat run scripts/deployAll.ts --network bscTestnet
```

This submits testnet transactions for token and vesting only. Each deployment waits for five confirmations and is recorded in the ignored `deployments/bscTestnet.json`, including `profile: "core"`. If interrupted, rerun with the same profile and record; the script resumes at the first missing contract. Never reuse a core record as a full-profile deployment record.

## 4. Verify core deployments and configure the transparency app

After core deployment, set `BSCSCAN_API_KEY` only in the ignored local `.env` if verification is intended. The verifier reads the profile in the record and verifies only contracts in that profile:

```sh
npx hardhat run scripts/verifyAll.ts --network bscTestnet
```

With a core record, generate app configuration:

```sh
npx ts-node scripts/generateAppEnv.ts
```

The generated `app/.env` contains public token and vesting addresses, empty staking and burn-vault addresses, `VITE_FEATURES_STAKING=false`, and `VITE_FEATURES_BURN=false`. The transparency page displays core supply and vesting data and core contract links; staking and burn panels remain hidden behind a “Coming soon after independent audit” card.

Check the local app with:

```sh
npm --prefix app test
npm --prefix app run dev
npm --prefix app run build
```

## 5. Phase 2 testnet profile (deferred)

Do not use the full profile until all Phase 2 entry criteria in [launch phases](launch-phases.md) and the [release readiness checklist](mainnet-readiness.md) are complete and approved. Then, for a separate testnet release only:

1. Confirm an explicit Phase 2 approval and the release commit.
2. Set `DEPLOY_PROFILE=full`, ascending whole-token `TIER1`, `TIER2`, and `TIER3`, and the required testnet-only configuration in `.env`.
3. Run and review `DEPLOY_PROFILE=full DRY_RUN=true npx hardhat run scripts/deployAll.ts --network bscTestnet`.
4. Only after separate authorization, deploy using `DEPLOY_PROFILE=full DRY_RUN=false ... --network bscTestnet`.
5. Verify and generate app configuration. Full profile flags are enabled and require staking and burn-vault addresses.

Records without a `profile` field are treated as legacy full-profile records. Set `DEPLOY_PROFILE=full` to resume a legacy record. Profile mismatch is rejected rather than silently changing the deployment plan.

## 6. Manual testnet QA

- [ ] Confirm total and circulating supply against token and vesting reads.
- [ ] Check vesting released and remaining balances against the verified vesting contract.
- [ ] Confirm displayed links point only to verified core addresses.
- [ ] Confirm core mode does not display staking or burn controls.
- [ ] Confirm the wallet network is BSC Testnet (chain ID 97) before any approved testnet interaction.

Phase 2 staking, burn, and gate QA is deferred until its entry criteria are complete. No mainnet deployment or configuration is provided by this runbook.
