# Staking, Burn Vault, and dApp Security Notes

This is a working threat model for review, not an audit report or a claim that the system is secure. Do not use for mainnet until independent review and remediation are complete.

## Staking contract threat model

### Assets and trust boundaries

- User MKA balances transferred into the staking contract.
- Per-address stake balances, last-stake timestamps, aggregate stake, and tier thresholds.
- External MKA token calls made through OpenZeppelin `SafeERC20`.

The contract has no owner, admin, upgrade path, pause, fee, reward, or privileged withdrawal. Each account may unstake only its own recorded balance. A new stake resets that account's seven-day lock for the full position.

### Threats and controls

| Threat | Control / review focus |
| --- | --- |
| Reentrant token callbacks | `nonReentrant` on stake and unstake; review state updates before token interactions and test malicious token behavior where feasible. |
| Incorrect token or tier configuration | Reject zero token address and zero/non-ascending thresholds; verify constructor arguments against approved deployment values. |
| Unauthorized or premature withdrawal | Caller-bound accounting, seven-day timestamp check, no recipient argument or admin withdrawal path; test direct and ABI-visible methods. |
| Accounting inconsistency or token-call failure | `SafeERC20`, checks-effects-interactions, revert atomicity, and aggregate-balance invariants. |
| Lock reset or boundary errors | Review exact seven-day boundary and confirm every additional stake resets the full position's timer. |
| Lost or mistaken transfers | No rescue function by design; clearly communicate that direct transfers are not recoverable. |

## Gate service threat model

The gate is an application authorization service, not an on-chain custody component. It reads tier and balance from the configured staking contract, validates wallet addresses, and requires a server-issued message signature before returning access information.

- Nonces are random, bound to origin and address, expire after five minutes, and are consumed on successful verification to prevent replay.
- Access tokens are random, address-bound, held in process memory, and expire after 30 minutes. Restarting the service invalidates sessions. Multiple instances require a shared, secure nonce/session store before use.
- Rate limits reduce simple request flooding but do not prevent distributed denial of service. Configure infrastructure-level limits and monitoring for production.
- CORS is browser policy, not authentication. Keep the allowed origin narrow and require HTTPS outside local development.
- RPC outages, stale chain data, a wrong staking address, or an incorrect chain can return incorrect or unavailable access data. The service startup checks for BSC testnet chain ID 97.
- Bearer access tokens must be protected by the client and sent only over TLS. Avoid persistent browser storage where possible; revoke by expiry or process restart.
- Wallet signatures prove control of an address for the challenge; they do not prove identity, eligibility, legal status, or entitlement to any financial product.

## External audit scope

The auditor should review staking constructor validation, tier boundaries, timestamp arithmetic, lock reset semantics, zero/oversized amounts, aggregate accounting, token transfer failure behavior, reentrancy resistance, and the absence of privileged fund movement. Review the gate's nonce generation and expiry, signature/address binding, replay behavior, session expiration and binding, rate limits, CORS, input, RPC outages, and deployment assumptions. Include dependency review and operational controls. Publish findings and remediation status before mainnet use.

## Burn vault threat model

The vault holds only MKA sent to its public address and permits any caller to burn the entire pending balance through the token's standard `burn` method. It has no owner, admin, withdrawal, fee, or arbitrary transfer function. The auditor should verify the immutable token address and zero-address check, zero-balance revert, `nonReentrant` guard, checks-effects-interactions accounting, event attribution, cumulative `totalBurnedByVault`, and inability to redirect vault-held tokens. Verify the deployed token is the intended MKA contract.

## Transparency and staking dApp threat model

- Wrong-network reads or writes can display misleading data or call unintended contracts. The app must check both configured chain ID and provider chain ID before displaying data or enabling writes, and clearly require BSC Testnet.
- Phishing clones can imitate the interface or substitute contract addresses. Publish the canonical site and addresses through verified official channels; verify all configured addresses and BscScan links before release.
- Staking requires token allowance. The app requests only the exact intended stake amount, explains approval and stake as separate transactions, and must never request an unlimited allowance by default. Users should inspect the token, spender, amount, and wallet network before signing.
- Wallet rejection, RPC errors, stale reads, and transaction failures must not be reported as success. The app should display provider errors, wait for receipts, and refresh balances after confirmation.
- The read-only RPC URL and Vite variables are public build-time configuration, not secrets. Do not place credentials in `VITE_` variables; do not persist wallet data, signatures, or private information in browser storage.
- The burn button invokes a public irreversible burn of the entire vault balance. Clearly show the current pending amount and confirmation transaction; verify the vault address before signing.

The dApp review should include wrong-chain enforcement, address validation, malicious configuration, approval scope, rejected/failed transactions, stale data handling, copy/explorer link correctness, phishing presentation, and static hosting/build artifact review. Review the burn vault and dApp alongside the staking contract before mainnet use.