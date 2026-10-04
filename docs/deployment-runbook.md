# BSC Testnet Deployment Runbook

This runbook is for BSC Testnet only. It submits real testnet transactions only in the explicitly selected real-run step. The assistant and CI do not execute that step. Never put private keys, seed phrases, or API keys in source control.

## 1. Prepare the root `.env`

```sh
npm ci
cp .env.example .env
```

Configure `BSC_TESTNET_RPC_URL`, a funded testnet-only `DEPLOYER_PRIVATE_KEY`, `TREASURY_ADDRESS`, `TEAM_BENEFICIARY`, and whole-token `TIER1`, `TIER2`, and `TIER3` values in strictly ascending order. Keep `DRY_RUN=true`. Add `BSCSCAN_API_KEY` only to the ignored local `.env` if source verification will be run. Do not commit `.env`.

## 2. Fund the testnet deployer

Request test BNB from the [BNB Chain testnet faucet](https://www.bnbchain.org/en/testnet-faucet). Confirm the deployer address matches the local testnet key and has enough test BNB for the planned deployments and verification-related operations.

## 3. Review the dry run

Run the single orchestration command with its safe default:

```sh
npx hardhat run scripts/deployAll.ts --network bscTestnet
```

The script validates the environment and chain ID 97, prints the deployment order, constructor arguments, predicted addresses, gas estimates, and verify commands. It sends no transactions and writes no deployment record. Review addresses and thresholds before proceeding.

## 4. Deploy on testnet

Only after review, explicitly disable dry-run in the ignored local `.env`:

```dotenv
DRY_RUN=false
```

Run the same command:

```sh
npx hardhat run scripts/deployAll.ts --network bscTestnet
```

The order is MKA token, team vesting, staking, then burn vault. Each deployment waits for five confirmations, prints its address and exact BscScan verify command, and is recorded immediately in the ignored `deployments/bscTestnet.json`. If interrupted, rerun with the same record to skip completed contracts and continue. Do not edit a partial record manually; review it and its on-chain addresses before resuming.

## 5. Verify contracts

After setting `BSCSCAN_API_KEY` in the local `.env`, run:

```sh
npx hardhat run scripts/verifyAll.ts --network bscTestnet
```

The script queries BscScan, skips already verified addresses, verifies remaining recorded deployments with their stored constructor arguments, and prints a summary.

## 6. Generate app configuration

Once all four addresses are present in the deployment record, generate the ignored app environment:

```sh
npx ts-node scripts/generateAppEnv.ts
```

This writes only public Vite address, chain, and RPC settings to `app/.env`. Use a public RPC URL without credentials or API-key query parameters because Vite configuration is embedded in the static client build.

## 7. Check the local dApp

```sh
npm --prefix app test
npm --prefix app run dev
npm --prefix app run build
```

Confirm read-only metrics against the verified testnet contracts. Connect a test wallet, switch to BSC Testnet, inspect the exact approval amount, stake, tier, and unlock countdown, then test eligible unstaking and the public vault burn. Never use a mainnet wallet for this testnet dApp configuration.

## 8. Publish the static site manually

Set these **repository variables**, not secrets, in GitHub because they are public client build settings: `VITE_TOKEN_ADDRESS`, `VITE_STAKING_ADDRESS`, `VITE_BURN_VAULT_ADDRESS`, `VITE_VESTING_ADDRESS`, and `VITE_RPC_URL`. The workflow fixes `VITE_CHAIN_ID=97` and builds with `VITE_BASE_PATH=/app/`.

Enable GitHub Pages for the repository, then manually run **Publish GitHub Pages** from Actions. It publishes `website/` at the Pages root and the dApp from `app/dist/` under `/app/`. The workflow has no push or pull-request trigger.

## Manual testnet QA checklist

- [ ] Transfer MKA between test wallets and compare BscScan balances.
- [ ] Burn MKA from a holder and confirm total supply decreases.
- [ ] Stake MKA and confirm wallet balance, staked balance, and tier.
- [ ] Cross a configured tier threshold and confirm the tier changes at the boundary.
- [ ] Confirm early unstake is unavailable and unstake succeeds after the seven-day lock.
- [ ] Send MKA to the burn vault, call `burnAll`, and confirm the event and supply delta.
- [ ] Check team vesting releasable balance before the cliff and after the cliff using the Hardhat time-travel test.
- [ ] Reconcile dashboard total/circulating supply, burned, staked, pending burn, and vesting values with on-chain reads.
- [ ] Confirm wrong-network writes are blocked and every displayed address matches its verified BscScan source.

No mainnet deployment is part of this runbook. Mainnet decisions require all owners and evidence in the release checklist to be reviewed separately.