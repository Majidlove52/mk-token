# Audit Scope

This package describes the repository state on the `setup-mkz-hardhat-project` branch. Contract source line counts use `wc -l` and include comments and blank lines; they are not executable-statement counts. Confirm deployed bytecode and constructor parameters independently before reviewing a deployment.

## Contracts

| Contract | Purpose | Source LOC | External dependencies |
| --- | --- | ---: | --- |
| `MKAToken` | ERC-20 MKA token with a one-time fixed supply and holder burn functions | 13 | OpenZeppelin Contracts `5.1.0`: `ERC20`, `ERC20Burnable` |
| `MKAStaking` | Custodies user MKA, enforces a seven-day lock, and reports access tiers without rewards | 115 | OpenZeppelin Contracts `5.1.0`: `IERC20`, `SafeERC20`, `ReentrancyGuard` |
| `MKABurnVault` | Publicly burns MKA transferred to the vault and accounts for cumulative vault burns | 49 | OpenZeppelin Contracts `5.1.0`: `ERC20Burnable`, `ReentrancyGuard` |
| `MKATeamVesting` | Releases funded MKA to one beneficiary after a one-year cliff, linearly through three years | 14 | OpenZeppelin Contracts `5.1.0`: `VestingWallet`, `VestingWalletCliff` |
| **Total** |  | **191** | Solidity `0.8.24`; optimizer enabled for 200 runs |

Versions are taken from the root `package.json`; the exact dependency source is installed from npm and should be verified against the lockfile used for an audit build.

## Trust Assumptions

- The MKA address supplied to staking and the burn vault is the intended deployed token, and the deployed source and constructor arguments are independently verified.
- MKA behaves as the repository's standard, non-rebasing, non-fee ERC-20. Staking's accounting expects the exact requested amount to arrive.
- RPC providers, chain IDs, block timestamps, and explorer links are supplied correctly by operators and clients.
- The vesting beneficiary address and start timestamp are correct. `VestingWallet` computes allocation from the wallet's current token balance plus previously released tokens; tokens funded later can therefore have an already-vested portion.
- Gate and dApp operators configure the intended chain, contracts, origin, and RPC endpoint. These off-chain services are not contract-enforced security boundaries.

## Privileged Roles

There are **no privileged contract roles**: the project contracts define no owner, administrator, role-based access control, privileged pause authority, mint authority, or privileged withdrawal. The vesting beneficiary may receive only the amount made releasable by the vesting schedule. Any account may trigger the burn vault's irreversible burn of its entire pending MKA balance.

## Known Limitations

- Token holders can irreversibly burn their own MKA; the token has no pause, blacklist, transfer fee, or post-deployment minting.
- Staking has no administrator recovery path. Direct transfers to the staking contract are not reflected in user stakes and cannot be recovered through its interface. Every additional stake restarts the caller's seven-day lock.
- The burn vault has no withdrawal path; anyone can trigger destruction of its entire current token balance.
- Vesting releases depend on the wallet being funded. Funding added later is included in the wallet's vesting allocation calculation and may be partially releasable immediately.
- Contracts are immutable and do not support emergency pausing or upgrades. A defect cannot be patched in place.
- Staking supplies access qualification only; it does not distribute rewards or promise financial outcomes. Service availability remains an off-chain dependency.

## Natspec Gaps

No direct public or external function body in these four project contracts is missing NatSpec. The following public constant getters are compiler-generated external ABI functions but their declarations currently lack NatSpec; document them in a later contract-source change:

| Contract getter | Gap |
| --- | --- |
| `MKAToken.TOTAL_SUPPLY()` | Public constant declaration has no NatSpec notice. |
| `MKATeamVesting.CLIFF()` | Public constant declaration has no NatSpec notice. |
| `MKATeamVesting.DURATION()` | Public constant declaration has no NatSpec notice. |

## Out Of Scope

- The token-gate service, dApp, website, monitoring process, deployment scripts, CI infrastructure, and operational RPC/Telegram credentials, except where their interfaces affect contract assumptions.
- BNB Chain consensus, validators, bridges, exchanges, liquidity arrangements, wallet software, external APIs, hosted infrastructure, and third-party services.
- Token economics, market behavior, legal/regulatory conclusions, identity/KYC processes, and any guarantee of product availability or token performance.
- Deployed addresses or bytecode not supplied and independently matched to this repository revision.