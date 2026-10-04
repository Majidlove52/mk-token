# MKA Buyback and Burn Policy

This policy describes a proposed, voluntary process. It is not a commitment to buy tokens, spend revenue, burn on a schedule, or support any token price.

## Process

If approved after legal, tax, and operational review, the team may use **[__%] of net subscription revenue** for voluntary MKA purchases. The percentage, definition of net revenue, deductions, schedule, and execution controls are placeholders until formally approved and published. No purchase is automatic or guaranteed.

For each approved purchase, the team would publish the funding period and calculation, transaction records, and acquired amount. The team may then send MKA to the deployed `MKABurnVault` address. Anyone can call `burnAll()`; the vault burns its full pending MKA balance and emits `Burned(caller, amount)`. The vault does not buy tokens, hold subscription revenue, or give callers a reward.

## On-chain verification

Use the canonical vault address from official channels and its verified BscScan source page. Review token transfers into the vault, `Burned` events, the `totalBurnedByVault()` counter, and the MKA token's `totalSupply()` before and after each burn. Compare transaction hashes and block details from the public explorer. `pendingBurn()` reports MKA currently waiting in the vault. The token supply can also change through the standard holder burn functions, so total supply delta and vault cumulative burn are distinct measures.

## No price or return implication

A purchase or burn does not imply, guarantee, or target a particular price, demand, liquidity, financial return, or future performance. A burn permanently removes tokens but does not establish token value. Digital assets may be volatile or illiquid, and users may lose some or all of the amount spent acquiring them. This document is informational only, not financial, investment, tax, or legal advice.