# Gated App Example

Minimal React/Vite frontend and Express API for BSC Testnet chain ID 97. Both protected API endpoints enforce Gate features on the server and return clearly labeled mock data only.

## Run Locally

From the repository root:

```sh
npm ci
npm run build:gate-sdk
cp examples/gated-app/.env.example examples/gated-app/.env
npm run start:gate
npm run start:gated-app-server
npm run dev --workspace @mka/gated-app
```

The browser app defaults to `http://localhost:5173`; the Gate uses port 3001 and the example API uses port 3002. Configure root `.env` with a BSC Testnet `BSC_TESTNET_RPC_URL`, verified `STAKING_ADDRESS`, and `GATE_ALLOWED_DOMAINS` including `http://localhost:5173`. Set `VITE_STAKING_APP_URL` in the example `.env` to the reviewed staking dApp URL. The injected wallet must be on chain ID 97.

The frontend uses `createGateClient`, `<GateProvider>`, `useGate()`, and `<Gated>`. Its protected requests go through the Vite `/api` proxy to Express, where `requireFeature` independently validates the bearer against the Gate. The sample payloads are not live market or signal data.

## Tests and Build

```sh
npm test --workspace @mka/gated-app
npm run build:gated-app
```

Integration tests use a local mocked Gate and prove 401 without a token, 403 below the feature tier, and 200 at the required tier. No RPC transaction is part of the example tests.