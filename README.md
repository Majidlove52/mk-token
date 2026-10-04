# MK Alpha (MKA)

MKA is a fixed-supply BEP-20 utility token for BNB Chain. The token has no owner privileges, minting after deployment, blacklist, pause, transfer tax, or upgrade mechanism. Holders can transfer and burn tokens; a separate vesting wallet provides a 12-month cliff followed by linear vesting through month 36.

## Requirements

- Node.js 20 or newer
- npm
- A BNB Chain testnet RPC URL for deployment
- A funded BSC testnet account only when deploying

## Setup

```sh
npm ci
cp .env.example .env
```

Set `BSC_TESTNET_RPC_URL`, `DEPLOYER_PRIVATE_KEY`, `TREASURY_ADDRESS`, `TEAM_BENEFICIARY`, and optionally `BSCSCAN_API_KEY` in `.env`. The private key must be a disposable testnet key. Never commit `.env` or send a private key to anyone.

## Compile, test, and coverage

```sh
npm run compile
npm test
npm run coverage
```

The coverage suite targets 100% coverage of both project contracts.

## Testnet deployment

After configuring the environment variables, deploy only to BSC testnet:

```sh
npx hardhat run scripts/deploy.ts --network bscTestnet
```

The script prints contract addresses and BscScan verification commands. It does not deploy to mainnet and does not automatically fund the vesting wallet; transfer the intended team allocation to its address only after reviewing the allocation and operational controls. Mainnet deployment requires an external audit, a Multisig treasury, and a liquidity lock first.

## Testnet workflow

Follow the [testnet guide](docs/testnet-guide.md) for setup, deployment, verification, and distribution. Track outstanding launch gates in the [mainnet readiness checklist](docs/mainnet-readiness.md).

For the one-command testnet release sequence, use the [deployment runbook](docs/deployment-runbook.md) and track final gates in the [release checklist](docs/release-checklist.md).

## Documentation

- [Whitepaper](docs/whitepaper.md)
- [Litepaper](docs/litepaper.md)
- [Launch plan](docs/launch-plan.md)
- [Legal notes](docs/legal-notes.md)
- [Brand and official links](docs/brand-and-links.md)
- [Staking access tiers](docs/staking.md)
- [Staking and gate security notes](docs/security-notes.md)
- [Public burn policy](docs/burn-policy.md)
- [dApp guide](docs/dapp-guide.md)
- [Deployment runbook](docs/deployment-runbook.md)
- [Release checklist](docs/release-checklist.md)
- [Audit scope](docs/audit-scope.md)
- [Architecture](docs/architecture.md)
- [Tested invariants](docs/invariants.md)
- [Audit FAQ](docs/audit-faq.md)
- [Slither report template](docs/slither-report.md)
- [Incident response runbook](docs/incident-response.md)
- [Read-only on-chain monitor](monitor/README.md)
- [Token-gate service setup](gate/README.md)
- [Transparency and staking dApp](app/index.html)
- [Static website](website/index.html)

## Tokenomics and security

See [docs/tokenomics.md](docs/tokenomics.md) for the proposed allocation and utility, and [docs/audit-checklist.md](docs/audit-checklist.md) for pre-mainnet readiness items. Report vulnerabilities according to [SECURITY.md](SECURITY.md).
