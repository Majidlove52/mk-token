# BSC Testnet Guide

This guide describes deployment and allocation testing on BNB Smart Chain Testnet only. Never put a private key or API key in source control.

## 1. Prepare `.env`

Install dependencies and copy the placeholders:

```sh
npm ci
cp .env.example .env
```

Set `BSC_TESTNET_RPC_URL`, `DEPLOYER_PRIVATE_KEY`, `TREASURY_ADDRESS`, and `TEAM_BENEFICIARY`; set `BSCSCAN_API_KEY` only if verification is needed. `DEPLOY_PROFILE=core` is the default. The core profile does not require tier thresholds. Keep `DRY_RUN=true` until the plan has been reviewed. Use a dedicated testnet key only.

## 2. Fund the testnet signer

Request test BNB from the [BNB Chain testnet faucet](https://www.bnbchain.org/en/testnet-faucet). Confirm the funded account matches `DEPLOYER_PRIVATE_KEY`; the signer is the treasury for the deployment and distribution commands.

## 3. Compile and test

```sh
npm run compile
npm test
```

## 4. Deploy to testnet

Set the treasury and team beneficiary in `.env`, then review the core dry run:

```sh
DEPLOY_PROFILE=core DRY_RUN=true npx hardhat run scripts/deployAll.ts --network bscTestnet
```

The plan includes `MKAToken` and `MKATeamVesting` only. The token supply is minted to the treasury; the team wallet is not funded until a separately reviewed distribution step. Follow [the deployment runbook](deployment-runbook.md) before any separately authorized testnet transaction.

## 5. Verify on BscScan

Use the exact verify commands printed by the deployment script. They follow this form:

```sh
npx hardhat verify --network bscTestnet <MKAToken-address> <treasury-address>
npx hardhat verify --network bscTestnet <MKATeamVesting-address> <beneficiary-address> <start-timestamp>
```

Confirm the verified source and constructor arguments on [BSC Testnet BscScan](https://testnet.bscscan.com/).

## 6. Review and execute distribution

Set `TOKEN_ADDRESS`, `TEAM_VESTING_ADDRESS`, and all five destination wallet addresses in `.env`. The first configured signer must be the token treasury. Keep `DRY_RUN=true`, then review the recipients, percentage split, and amounts:

```sh
npx hardhat run scripts/distribute.ts --network bscTestnet
```

The script validates every address, uniqueness, the 100% allocation total, and treasury balance before proceeding. For actual testnet transfers, explicitly set `DRY_RUN=false` in `.env` and rerun the command. Save the printed transaction hashes and final balance table. Do not use this script for mainnet; mainnet transfers must be executed through the treasury Safe Multisig.

## Manual testing checklist

- [ ] Transfer MKA between test accounts and confirm balances on BscScan.
- [ ] Approve a spender, call `transferFrom`, and confirm allowance decreases.
- [ ] Burn MKA and confirm both holder balance and total supply decrease.
- [ ] Use the vesting time-travel tests to confirm `releasable(token)` is zero before the cliff and positive at/after the cliff.
- [ ] Review the distribution dry-run output before setting `DRY_RUN=false`.
- [ ] Confirm the team vesting wallet holds exactly 150,000,000 MKA after distribution.

Staking and burn-vault deployment and QA are deferred to Phase 2; see [launch phases](launch-phases.md).