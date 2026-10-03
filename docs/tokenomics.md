# MKA Tokenomics

## Supply

MKA has a fixed initial supply of **1,000,000,000 tokens**, minted once to the treasury at deployment. The contract has no post-deployment mint function. Holders may burn their own tokens or tokens for which they have allowance, permanently reducing the circulating and total supply.

## Proposed allocation

This allocation is a proposal for planning and is editable before any public launch. It is not enforced by the token contract.

| Allocation | Share | Tokens | Notes |
| --- | ---: | ---: | --- |
| Public sale | 30% | 300,000,000 | Subject to legal review and sale terms |
| DEX liquidity | 20% | 200,000,000 | Liquidity position should be locked and independently verifiable |
| Team | 15% | 150,000,000 | 12-month cliff; 36-month total vesting |
| Ecosystem and rewards | 15% | 150,000,000 | Distribution plan to be published before use |
| Marketing and listings | 10% | 100,000,000 | Expenditures and transfers should be disclosed |
| Reserve | 10% | 100,000,000 | Treasury-held; use should be publicly documented |
| **Total** | **100%** | **1,000,000,000** | |

The deployed team vesting wallet does not receive tokens automatically. The intended team allocation must be transferred to its verified wallet address after deployment.

## Utility

Proposed utility includes subscription discounts, staking tiers, and access to token-gated tools. These features are product and policy proposals, not functionality implemented in the token contract. Any staking product should be separately specified, reviewed, and audited.

## Buyback and burn policy

No buyback is automatic or guaranteed. If a buyback program is approved, publish its funding source, schedule, execution records, and wallet addresses in advance. Tokens may be burned through the standard ERC-20 burn functions; report each burn transaction and updated supply transparently. No administrator has a privileged burn function.

## Transparency measures

- Verify deployed contract source on BscScan and publish deployment addresses and transaction links.
- Use a Safe Multisig for treasury operations and publish signers and transaction policies.
- Lock DEX liquidity with a reputable, independently verifiable locker and disclose unlock dates.
- Publish periodic treasury, allocation, vesting, and burn reports.
- Publish audit reports, material findings, and remediation status before mainnet use.