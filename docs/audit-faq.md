# Audit FAQ

## Is the system upgradeable?

No. The project contracts are not proxies and expose no upgrade mechanism. A defect requires a separately deployed replacement and an independently managed migration; existing contract state cannot be moved by an administrator function.

## Are there admin keys or privileged roles?

No project contract defines an owner, admin, role, privileged mint, or privileged withdrawal. The token's treasury receives the initial supply at construction but has no special rights after deployment. The vesting beneficiary is a fixed recipient, not an administrator. Off-chain service and deployment credentials are operational credentials and are outside the contract role model.

## Can contracts be paused?

No. There is deliberately no pause control or privileged operator capable of freezing transfers, staking, vesting, or burns. In an incident, operators must communicate, warn users, coordinate with relevant infrastructure and platforms, and publish verified information; they cannot pause these contracts.

## Are there fees or token rewards?

The project contracts do not charge transfer/staking fees or distribute staking rewards. Staking determines access tiers only. Network gas is paid to the chain and is not a project contract fee.

## How is reentrancy handled?

`MKAStaking.stake`, `MKAStaking.unstake`, and `MKABurnVault.burnAll` use OpenZeppelin `ReentrancyGuard` and `SafeERC20` where applicable. Token and vesting behavior relies on the pinned OpenZeppelin implementation and should be checked against the exact dependency version in the audit build. Existing unit tests include a malicious-token callback case for staking.

## What token behavior is assumed?

Staking accounting assumes the configured token transfers exactly the requested amount and does not rebase or charge transfer fees. The intended token is this repository's MKA ERC-20. Verify the deployed address and bytecode; do not treat arbitrary ERC-20 contracts as compatible. Accidental direct transfers to staking are not recoverable through an admin path.

## What are the vesting schedule details?

`MKATeamVesting` sets a one-year cliff and three-year duration from the supplied start timestamp. The OpenZeppelin vesting wallet calculates allocation from its current token balance plus amounts already released; later funding may therefore vest partly or fully according to elapsed time.