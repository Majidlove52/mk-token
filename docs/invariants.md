# Tested Invariants

The seeded property suite uses deterministic pseudo-random sequences and checks the stated properties after each of at least 200 steps per test. The current scenarios each execute exactly 200 steps.

| Contract | Invariant checked after each step | Test |
| --- | --- | --- |
| `MKAToken` | Total supply never exceeds 1,000,000,000 MKA, never increases, and equals the sum of all tracked test-account balances after transfers and burns. | [`test/properties/contract-properties.test.ts`](../test/properties/contract-properties.test.ts) |
| `MKAStaking` | Contract token balance equals `totalStaked` and the sum of tracked user stakes; failed over-unstakes leave state unchanged; each `tierOf` result matches configured thresholds; locked positions cannot be unstaked early. | [`test/properties/contract-properties.test.ts`](../test/properties/contract-properties.test.ts) |
| `MKABurnVault` | `totalBurnedByVault` equals the model's cumulative burned amount; after each successful `burnAll`, the vault token balance is zero. | [`test/properties/contract-properties.test.ts`](../test/properties/contract-properties.test.ts) |
| `MKATeamVesting` | The released amount is monotonic and never exceeds the funded allocation; it remains zero before the cliff. | [`test/properties/contract-properties.test.ts`](../test/properties/contract-properties.test.ts) |

These tests are reproducible regression checks, not a formal proof, exhaustive state-space exploration, or substitute for an independent audit.