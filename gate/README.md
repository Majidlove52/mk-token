# MKA Token-Gate Service

Minimal TypeScript/Express service for checking MKA staking access tiers. It is configured for BSC testnet and does not custody tokens or initiate transactions.

## Setup

From the repository root:

```sh
npm ci
cp .env.example .env
```

Set `BSC_TESTNET_RPC_URL` and `STAKING_ADDRESS` to the testnet RPC and deployed staking contract. Configure `GATE_CORS_ORIGIN` to the exact app origin (for example, `http://localhost:3000`) and optionally `GATE_PORT` (default `3001`). Never place private keys, seed phrases, or API keys in gate configuration. The gate reads chain data only; users sign a message with their own wallet.

Start the service:

```sh
npm run start:gate
```

Run its mocked HTTP and signature tests with the repository test command:

```sh
npm test
```

The service allows 60 requests per IP per minute. Wallet nonces expire after five minutes; successful verification returns an address-bound bearer token valid for 30 minutes. Nonces and sessions are in-memory and disappear on restart, so a multi-instance deployment requires a shared store and additional operational review.

## MK app integration

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