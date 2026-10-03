# MKA Transparency and Staking dApp Guide

The static dApp reads public BSC Testnet contract data through an RPC and uses an injected EIP-1193 wallet for user-authorized staking and public vault burns. It does not require a backend, store private wallet data, or include analytics. Do not put secrets in Vite variables; all `VITE_` values are included in the public build.

## Configure

From the repository root:

```sh
cp app/.env.example app/.env
```

Fill in the values after testnet deployment:

| Variable | Value |
| --- | --- |
| `VITE_TOKEN_ADDRESS` | Verified MKA token contract address |
| `VITE_STAKING_ADDRESS` | MKA staking contract address |
| `VITE_BURN_VAULT_ADDRESS` | Public MKA burn vault address |
| `VITE_VESTING_ADDRESS` | Team vesting wallet address |
| `VITE_CHAIN_ID` | `97` for BSC Testnet; the app rejects other configured chains |
| `VITE_RPC_URL` | Public or approved BSC Testnet RPC endpoint; no credential-bearing URL |

The app shows an explicit configuration error until all addresses and the RPC are valid. Contract addresses and RPC URLs are public, not secrets.

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

The staking flow first requests approval for exactly the entered amount when current allowance is insufficient, waits for confirmation, then asks for the stake transaction. Unstaking remains disabled until the contract's full-position seven-day lock expires. The burn action calls `burnAll()` for the whole displayed pending vault balance; any wallet on the correct network can trigger this irreversible burn. Check wallet prompts, spender, amount, contract address, network, and transaction details before signing.

## Pre-launch checklist

- [ ] Complete independent audit and remediation for the staking contract and burn vault.
- [ ] Complete gate-service and dApp security review; test wrong-network and stale-RPC behavior.
- [ ] Verify all four deployed contract addresses and source pages on BscScan.
- [ ] Confirm BSC Testnet chain ID and RPC endpoint; ensure no production secrets are present in build variables.
- [ ] Test dashboard totals against on-chain balances, including the circulation formula and vault pending amount.
- [ ] Test wallet connect, chain switch, exact approval, stake, lock countdown, eligible unstake, and rejected transactions.
- [ ] Verify the burn amount, `Burned` event, total supply delta, and on-chain transaction links.
- [ ] Confirm official site/contract links and anti-phishing guidance before publishing.
- [ ] Serve production over HTTPS and inspect the built `app/dist/` output for placeholders and accidental data.