# Public Launch Options and Checklist

## Core launch scope

The initial launch profile is Phase 1 core only: `MKAToken`, `MKATeamVesting`, Safe Multisig treasury control, an independently verifiable liquidity lock, and a public token/vesting transparency page. Staking tiers, token gating, the burn vault, buybacks, and dedicated burn workflows are planned, subject to independent audit, and are not available at launch. See [launch phases](launch-phases.md) for Phase 2 entry criteria.

This comparison is qualitative. Provider fees and requirements change; obtain current written terms and independent legal and security review before choosing an option. A platform's review does not replace an independent smart-contract audit.

## Sale and launch options

The approximate launch date is TBD (not provided). The sale method is undecided.

| Option | Cost | Speed | Trust level | Key risks | Audit needs |
| --- | --- | --- | --- | --- | --- |
| Third-party launchpad (for example, PinkSale; subject to due diligence) | Variable platform, listing, and promotion fees | Often faster after acceptance and preparation | Depends on platform controls, disclosure quality, and independent verification; platform branding is not an audit | Platform/custody terms, sale configuration, access restrictions, phishing copies, and jurisdictional obligations | Independent project audit remains required; review launchpad contract and sale configuration |
| Direct PancakeSwap launch with locked liquidity | Variable pool setup, liquidity, and lock-provider costs | Requires more preparation and operational coordination | Verifiable on-chain pool and lock can aid review; trust still depends on disclosed treasury controls and execution | Price volatility, slippage, low or changing liquidity, pool configuration, lock-provider and key-management risks | Audit token and related launch components; independently review liquidity and lock transactions |
| Custom presale contract | Highest and least predictable engineering, audit, and legal cost | Slowest; requires specification, implementation, review, and operational preparation | Low until independently reviewed and publicly verified | Larger attack surface, sale logic errors, fund custody, access-control defects, legal and refund obligations | Full independent audit of custom sale contracts and deployment configuration is required |

**Recommendation:** choose and document a core launch method only after legal advice, independent review of the core contracts, and operational controls are complete. A launchpad review does not replace an independent audit. This is not an endorsement of any provider or a guarantee of safety. **Custom presale contracts are not recommended** for the initial launch because they add contract, custody, and compliance scope.

## Launch checklist

- [ ] Complete an independent audit of the core token and vesting contracts; publish findings and remediation status. Audit completion is a prerequisite and is not claimed here.
- [ ] Establish treasury control in a Safe Multisig with 3 of 5 signers, documented signer procedures, and verified addresses.
- [ ] Confirm allocation, any sale terms, jurisdiction restrictions, and KYC/AML processes with specialist counsel and service providers.
- [ ] Decide the core launch method and obtain written platform or provider terms; do not treat platform screening as an audit.
- [ ] Seed the approved DEX liquidity position and lock it for at least the disclosed period; publish the lock transaction and unlock date.
- [ ] Verify deployed token and vesting source and constructor parameters on BscScan; publish official token, vesting, treasury, and liquidity addresses.
- [ ] Publish a transparency page showing total and circulating supply, vesting released/remaining, and verified core contract links.
- [ ] Keep staking, token gating, burn vault, buyback, and dedicated burn functionality disabled at initial launch.
- [ ] Prepare public tokenomics, risk factors, sale terms, vesting details, privacy notices, and support contacts.
- [ ] Submit listing applications to CoinGecko and CoinMarketCap after the required public information is available. Applications and listings are not guaranteed.
- [ ] Prepare an announcement timeline and incident contacts before launch.
- [ ] Monitor contract events, liquidity, support reports, impersonation attempts, and security alerts after launch; publish material updates through official channels.

## Announcement timeline template

Dates below are planning placeholders. Do not publish a date until approvals and launch dependencies are confirmed.

| Timing | Planned communication | Status |
| --- | --- | --- |
| T-30 days | Publish reviewed documents and risk disclosures | TBD (date not provided) |
| T-14 days | Publish verified addresses, audit status, and launch method | TBD (date not provided) |
| T-7 days | Publish final schedule, eligibility, and support channels | TBD (date not provided) |
| T-0 | Publish transaction links and operational status | TBD (date not provided) |
| T+1 to T+30 | Publish monitoring updates and material incident notices | TBD (date not provided) |