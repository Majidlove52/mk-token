# MKA Token-Gate Service

Minimal TypeScript/Express service for checking MKA staking access tiers. It is configured for BSC testnet and does not custody tokens or initiate transactions.

## Setup

From the repository root:

```sh
npm ci
cp .env.example .env
```

Set `BSC_TESTNET_RPC_URL` and `STAKING_ADDRESS` to the testnet RPC and deployed staking contract. Configure comma-separated `GATE_ALLOWED_DOMAINS` for exact app hosts/origins and keep `GATE_CORS_ORIGIN` aligned for older clients. `GATE_TIER_CACHE_MS` defaults to 30000; `GATE_PORT` defaults to 3001. Never place private keys, seed phrases, or API keys in gate configuration. The gate reads chain data only; users sign a message with their own wallet.

Start the service:

```sh
npm run start:gate
```

Run its mocked HTTP and signature tests with the repository test command:

```sh
npm test
```

The service allows 60 requests per IP per minute. Wallet nonces expire after five minutes and are single-use. Sign-in messages bind the domain, address, chain ID 97, nonce, issued-at time, and expiry. Successful verification returns an address-bound bearer token with a 30-minute sliding expiry. `GET /session` re-reads the on-chain tier using the short cache; `POST /logout` invalidates the bearer. The legacy `/nonce/:address`, `/verify`, and `/access/:address` endpoints remain available.

Memory storage is the default and is process-local. Set `REDIS_URL` to select the optional ioredis store for shared sessions/nonces across multiple Gate instances; the Redis implementation is dynamically loaded only when configured. Protect the Redis endpoint and use TLS for production. The tier cache remains per process, so a changed stake can take up to the configured cache duration to affect access.

## SDK and app integration

Build the reusable client, React bindings, and server middleware from the root:

```sh
npm run build:gate-sdk
```

See [the full Gate integration guide](../docs/gate-integration.md) and the [gated-app example](../examples/gated-app/README.md). Client feature checks are UI-only. Enforce protected API routes with `requireFeature` or `requireTier` on the server.

## Legacy endpoint integration

Request a nonce, ask the connected wallet to sign the exact message, verify it, then use the returned bearer token to request the tier:

```ts
const gateUrl = "http://localhost:3001";
const provider = new BrowserProvider(window.ethereum);
const signer = await provider.getSigner();
const address = await signer.getAddress();

const nonceResponse = await fetch(`${gateUrl}/nonce/${address}`);
const { message } = await nonceResponse.json();
const signature = await signer.signMessage(message);

const verificationResponse = await fetch(`${gateUrl}/verify`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ address, message, signature }),
});
const { accessToken } = await verificationResponse.json();

const accessResponse = await fetch(`${gateUrl}/access/${address}`, {
  headers: { authorization: `Bearer ${accessToken}` },
});
const access = await accessResponse.json();
// access: { address, stakedMKA, tier, features }
```

Handle expired nonces and sessions by requesting a new nonce and repeating wallet verification. Do not treat CORS as authorization, do not log bearer tokens, and serve production traffic only over HTTPS. Tier feature identifiers are placeholders in `gate/config.ts` until mapped to shipped app features.