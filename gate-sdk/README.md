# @mka/gate-sdk

Framework-optional TypeScript SDK for the MKA Gate. The root build emits ESM and CommonJS bundles plus declarations. The core client does not import React; React and Express are optional peer dependencies used through separate entry points.

```ts
import { createGateClient } from "@mka/gate-sdk";

const gate = createGateClient({
  gateUrl: "https://gate.example",
  domain: window.location.host,
  chainId: 97,
});

const session = await gate.connectAndSignIn(window.ethereum);
const result = await gate.authenticatedFetch("/api/scanner/basic");
```

Use `@mka/gate-sdk/react` for `GateProvider`, `useGate`, and `Gated`; use `@mka/gate-sdk/server` for Express `requireTier` and `requireFeature` middleware. Browser checks only control display. Protected responses must be gated on the server.

From the repository root, run `npm run build:gate-sdk` to build and `npm run test:gate-sdk` to run mocked-wallet, middleware, and React tests. See [the integration guide](../docs/gate-integration.md) for the message format, server setup, tier mapping, and deployment checklist.