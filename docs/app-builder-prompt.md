# App Builder Prompt

Copy the prompt below into Shogo, Bolt, or another app builder. Configuration values below are not provided and must remain unset until the separately audited Phase 2 deployment is approved.

```text
Build or update a BNB Chain Testnet (chain ID 97) app to use the MK Alpha token-gate SDK for access based only on the connected wallet's on-chain staked MKA tier.

Configuration:
- Gate URL: TBD (not provided; Phase 2 deployment is deferred)
- Gate domain: the app host from window.location.host
- Required feature identifiers: TBD (not provided; map to approved released features)
- Staking dApp URL: TBD (not provided; Phase 2 deployment is deferred)

Implementation requirements:
1. Install/use @mka/gate-sdk for the framework-free client, @mka/gate-sdk/react for React bindings when applicable, and @mka/gate-sdk/server for Express route enforcement.
2. Create the client with createGateClient({ gateUrl: "TBD: configure after the approved Phase 2 deployment", domain: window.location.host, chainId: 97 }). Connect through the injected EIP-1193 wallet and call connectAndSignIn(provider). The SDK requests GET /nonce/:address, asks the wallet for an EIP-191 personal_sign signature, POSTs { address, message, signature } to /verify, then reads GET /session.
3. The signed message must remain exactly structured as:
   MK Alpha Gate Sign-In
   Domain: <app host>
   Address: <wallet address>
   Chain ID: 97
   Nonce: <single-use nonce>
   Issued At: <ISO-8601 timestamp>
   Expiration Time: <ISO-8601 timestamp>
   Do not construct a different message or skip any field check.
4. Display the current tier and a clear locked state for each missing feature. Client-side hasFeature(), useGate(), and <Gated> are presentation only and must never be treated as security enforcement.
5. Enforce every protected API route on the server with requireFeature(featureName) or requireTier(minTier). Return 401 for missing/invalid sessions and 403 when the on-chain tier lacks the feature. Never return protected data based only on a browser check.
6. Use gate.authenticatedFetch() for same-origin API calls, or attach the bearer only in trusted app code. Never put tokens in URLs, HTML, analytics, or logs. Never log tokens, signatures, or nonce messages.
7. Provide Connect Wallet and Disconnect controls, show the current tier, and link to a staking dApp URL only after one is provided and the Phase 2 release is approved. Handle wrong chain, user rejection, expired sessions, and Gate/network errors with clear states.
8. Use sample/demo responses only unless real data sources are separately configured and identified. Do not add payments, rewards, financial claims, or predictions.
9. Keep secrets out of source and frontend build variables. Do not request, create, or store private keys or seed phrases. Require HTTPS outside local development and allow-list the exact app domain in GATE_ALLOWED_DOMAINS.
10. Add tests proving anonymous requests get 401, insufficient tier gets 403, and the required on-chain feature gets 200. Include UI tests for locked and unlocked states.
```