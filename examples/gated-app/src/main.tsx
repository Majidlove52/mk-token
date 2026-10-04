import React from "react";
import { createRoot } from "react-dom/client";
import { createGateClient } from "@mka/gate-sdk";
import { GateProvider, Gated, useGate } from "@mka/gate-sdk/react";
import "./style.css";

const gateClient = createGateClient({
  gateUrl: import.meta.env.VITE_GATE_URL || "http://localhost:3001",
  domain: window.location.host,
  chainId: 97,
});

interface MockPayload {
  source: string;
  label: string;
  items: unknown[];
}

function FeaturePanel({
  title,
  description,
  feature,
  tierLabel,
  endpoint,
}: {
  title: string;
  description: string;
  feature: string;
  tierLabel: string;
  endpoint: string;
}) {
  const [payload, setPayload] = React.useState<MockPayload | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  async function loadMockData() {
    setLoading(true);
    setError(null);
    try {
      const response = await gateClient.authenticatedFetch(endpoint);
      const result = await response.json() as MockPayload & { error?: string };
      if (!response.ok) throw new Error(result.error || `Request failed (${response.status})`);
      setPayload(result);
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return <article className="feature-panel">
    <div className="feature-heading">
      <div>
        <p className="eyebrow">{feature}</p>
        <h3>{title}</h3>
      </div>
      <span className="tier-requirement">{tierLabel}</span>
    </div>
    <p className="feature-description">{description}</p>
    <Gated feature={feature} fallback={
      <div className="locked-state" role="status">
        <span className="lock-mark" aria-hidden="true">×</span>
        <div><strong>Locked</strong><span>Requires {tierLabel}</span></div>
      </div>
    }>
      <div className="unlocked-state">
        <p className="server-note">The protected API checks current gate access on the server.</p>
        <button className="button button-dark" onClick={() => void loadMockData()} disabled={loading}>
          {loading ? "Loading mock data…" : "Load mock response"}
        </button>
      </div>
    </Gated>
    {error && <p className="request-error" role="alert">{error}</p>}
    {payload && <pre className="mock-output">{JSON.stringify(payload, null, 2)}</pre>}
  </article>;
}

function Dashboard() {
  const gate = useGate();
  const [message, setMessage] = React.useState<string | null>(null);

  async function connect() {
    setMessage(null);
    try {
      await gate.connect();
    } catch (error) {
      setMessage((error as Error).message);
    }
  }

  async function disconnect() {
    setMessage(null);
    try {
      await gate.disconnect();
    } catch (error) {
      setMessage((error as Error).message);
    }
  }

  return <>
    <header className="topbar">
      <a className="brand" href="#top" aria-label="MKA Gate Example home">
        <span className="brand-mark">M</span>
        <span>MK ALPHA <small>GATE EXAMPLE</small></span>
      </a>
      <div className="topbar-actions">
        <span className="network-label"><span className="network-dot" />BNB CHAIN TESTNET</span>
        {gate.address ? <>
          <span className="tier-badge">TIER {gate.tier}</span>
          <button className="button button-quiet" onClick={() => void disconnect()}>Disconnect</button>
        </> : <button className="button button-lime" onClick={() => void connect()}>
          {gate.status === "connecting" ? "Check wallet…" : "Connect wallet"}
        </button>}
      </div>
    </header>

    <main id="top" className="page-shell">
      <section className="intro-row">
        <div>
          <p className="eyebrow">ON-CHAIN ACCESS / EXAMPLE APP</p>
          <h1>Feature access follows<br />your staked MKA tier.</h1>
          <p className="intro-copy">A working integration pattern: the browser reflects gate state, and the API independently enforces each feature.</p>
        </div>
        <div className="session-panel" aria-live="polite">
          <span className="session-caption">WALLET SESSION</span>
          <strong>{gate.status === "loading" ? "Checking…" : gate.address ? `${gate.address.slice(0, 6)}…${gate.address.slice(-4)}` : "Not connected"}</strong>
          <span className="session-detail">{gate.address ? `Tier ${gate.tier} · chain 97` : "Connect to inspect access"}</span>
        </div>
      </section>

      {message && <p className="status-error" role="alert">{message}</p>}

      <section className="feature-section" aria-labelledby="features-title">
        <div className="section-heading">
          <div><p className="eyebrow">GATED API DEMO</p><h2 id="features-title">Example features</h2></div>
          <span className="mock-label">MOCK RESPONSES ONLY</span>
        </div>
        <div className="feature-grid">
          <FeaturePanel
            title="Basic scanner"
            description="A tier-one example route returning clearly marked sample data."
            feature="basic-scanner"
            tierLabel="Tier 1"
            endpoint="/api/scanner/basic"
          />
          <FeaturePanel
            title="Premium signals"
            description="A tier-three example route, independently checked by the server."
            feature="premium-signals"
            tierLabel="Tier 3"
            endpoint="/api/signals/premium"
          />
        </div>
      </section>

      <footer className="page-footer">
        <span>Access is read from BSC Testnet staking state.</span>
        <a href={import.meta.env.VITE_STAKING_APP_URL || "http://localhost:5173/"} target="_blank" rel="noreferrer">
          Open staking dApp <span aria-hidden="true">↗</span>
        </a>
      </footer>
    </main>
  </>;
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <GateProvider client={gateClient}>
      <Dashboard />
    </GateProvider>
  </React.StrictMode>,
);