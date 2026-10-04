# MKA Transparency and Staking dApp Guide

The initial core dApp mode reads public BSC Testnet token and vesting data through an RPC. Staking and burn panels are hidden when their feature flags are false or their contract addresses are empty. Staking, the burn vault, token gating, and related interactions are Phase 2 features, planned subject to independent audit and remediation; they are not available at launch. Do not put secrets in Vite variables; all `VITE_` values are included in the public build.

## Configure

From the repository root:

```sh
cp app/.env.example app/.env
```

Fill in the values after testnet deployment:

| Variable | Value |
| --- | --- |
| `VITE_TOKEN_ADDRESS` | Verified MKA token contract address |
| `VITE_STAKING_ADDRESS` | Phase 2 staking address; empty for core |
| `VITE_BURN_VAULT_ADDRESS` | Phase 2 burn-vault address; empty for core |
| `VITE_VESTING_ADDRESS` | Team vesting wallet address |
| `VITE_FEATURES_STAKING` | `false` for core; Phase 2 opt-in only after its entry gates |
| `VITE_FEATURES_BURN` | `false` for core; Phase 2 opt-in only after its entry gates |
| `VITE_CHAIN_ID` | `97` for BSC Testnet; the app rejects other configured chains |
| `VITE_RPC_URL` | Public or approved BSC Testnet RPC endpoint; no credential-bearing URL |

The app shows an explicit configuration error until required core addresses and the RPC are valid. Core mode leaves Phase 2 addresses empty and flags false. Contract addresses and RPC URLs are public, not secrets.

## Local development and checks

```sh
npm --prefix app install
npm --prefix app test
npm --prefix app run dev
```

Open the local URL printed by Vite. Dashboard reads work without a wallet. To test writes, install an EIP-1193 wallet, switch it to BSC Testnet, and use test tokens only. The dApp checks chain ID 97 and offers a network switch/add action.

Build the static site:

```sh
npm --prefix app run build
```

The production output is `app/dist/`. Deploy only these static files to an HTTPS static host using the reviewed environment values. No API key, private key, or seed phrase is required or should be added. Rebuild after changing an environment value.

## Transaction behavior

In a separately approved Phase 2 deployment, the staking flow first requests approval for exactly the entered amount when current allowance is insufficient, waits for confirmation, then asks for the stake transaction. Unstaking remains disabled until the contract's full-position seven-day lock expires. The burn action calls `burnAll()` for the whole displayed pending vault balance; any wallet on the correct network can trigger this irreversible burn. Check wallet prompts, spender, amount, contract address, network, and transaction details before signing.

## Pre-launch checklist

- [ ] Verify token and vesting deployment addresses and source pages on BscScan.
- [ ] Confirm BSC Testnet chain ID and RPC endpoint; ensure no production secrets are present in build variables.
- [ ] Test core dashboard totals against token and vesting balances; verify circulating supply and total burned calculations.
- [ ] Confirm Phase 2 panels are hidden and the independent-audit notice is visible in core mode.
- [ ] Confirm official site/contract links and anti-phishing guidance before publishing.
- [ ] Serve production over HTTPS and inspect the built `app/dist/` output for placeholders and accidental data.

Staking, burn-vault, and gate interaction QA belongs to Phase 2 and must wait for the independent review and entry criteria in [launch phases](launch-phases.md).