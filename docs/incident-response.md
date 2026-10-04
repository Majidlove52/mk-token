# Incident Response Runbook

This runbook coordinates communication and mitigation. The contracts have no pause control, so responders cannot freeze transfers or recover tokens through an administrator. Do not promise recovery, reversals, or outcomes that the team cannot deliver.

## Contacts To Fill In

Before production use, publish and verify these contacts in the team's approved internal contact system:

| Role | Contact status |
| --- | --- |
| Incident lead / security owner | TBD (contact not provided; fill in the approved internal contact system) |
| Contract and infrastructure operator | TBD (contact not provided; fill in the approved internal contact system) |
| Communications lead | TBD (contact not provided; fill in the approved internal contact system) |
| Legal counsel / privacy lead | TBD (contact not provided; fill in the approved internal contact system) |
| Hosting, RPC, and domain providers | TBD (provider contacts not provided) |
| Relevant exchanges or platforms | TBD (verified security contacts not provided, if applicable) |

Maintain an out-of-band contact method. Never publish passwords, API credentials, private keys, seed phrases, or sensitive personal information in incident channels.

## First Response

1. Notify the incident lead and security owner through the verified out-of-band channel. Assign one incident commander and record UTC times, observed transaction hashes, affected services, and decisions.
2. Preserve evidence: RPC responses, transaction and block links, service logs, phishing URLs, screenshots, and provider notices. Restrict evidence access and avoid modifying originals.
3. Verify chain ID, contract address, transaction receipt, and event data using an independent trusted source. Treat unverified social posts and direct messages as untrusted.
4. Notify communications, legal/privacy, and affected infrastructure contacts as relevant. Publish concise factual updates through verified official channels; distinguish confirmed facts from investigation and provide a next-update time.
5. Do not request wallet secrets or ask users to sign an unexplained message or transaction. Do not claim that a transfer can be reversed or that funds can be recovered.

## Suspicious Transfers or Contract Activity

- Verify the event and transaction independently, then notify the incident lead and security owner with the chain, address, block, transaction hash, and observed impact.
- There is no contract pause. Publish verified affected addresses and safe user guidance through official channels; ask users not to interact with suspicious requests. Escalate to RPC providers, explorers, exchanges, or platforms only through their verified incident channels.
- Do not label an ordinary transfer malicious based solely on size. Keep the monitoring alert as a lead, not a conclusion.

## Phishing Clones

- Capture the URL, hosting/provider details, page content, and wallet prompts without connecting a production wallet or signing anything.
- Alert users through the verified canonical site and official accounts. Ask hosting, registrar, search, and social platforms to review the impersonation using their abuse processes.
- Reconfirm official URLs and contract addresses via more than one trusted official channel. Never direct users to an unverified replacement site.

## Compromised Social Accounts

- Notify the incident lead using the out-of-band route and preserve suspicious posts and access notifications.
- Use the platform's account-recovery and security process from a clean device; rotate sessions and credentials after containment. Enable or restore strong multifactor authentication.
- Warn users from other verified channels that the affected account is compromised. Explicitly reject requests for seed phrases, private keys, payments, or urgent wallet signatures.
- Publish a correction and incident summary only after account ownership and facts are re-verified. Record timeline, user impact, decisions, and follow-up owners.