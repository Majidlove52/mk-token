import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Eip1193Provider, GateClient, GateSession } from "./client";
import { GateProvider, Gated, useGate } from "./react";

const connectedSession: GateSession = {
  address: "0x0000000000000000000000000000000000000003",
  tier: 3,
  features: ["basic-scanner", "premium-signals"],
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
};

function makeClient() {
  let session: GateSession | null = null;
  const listeners = new Set<(value: GateSession | null) => void>();
  const publish = (value: GateSession | null) => {
    session = value;
    for (const listener of listeners) listener(value);
  };
  const client = {
    connectAndSignIn: vi.fn(async () => {
      publish(connectedSession);
      return connectedSession;
    }),
    getSession: vi.fn(async () => session),
    logout: vi.fn(async () => publish(null)),
    hasFeature: (name: string) => session?.features.includes(name) ?? false,
    tier: () => session?.tier ?? 0,
    onChange: vi.fn((callback: (value: GateSession | null) => void) => {
      listeners.add(callback);
      callback(session);
      return () => listeners.delete(callback);
    }),
    authenticatedFetch: vi.fn(),
    dispose: vi.fn(),
  } satisfies GateClient;
  return client;
}

function GateControls() {
  const gate = useGate();
  return <>
    <span data-testid="status">{gate.status}</span>
    <span data-testid="tier">{gate.tier}</span>
    <button onClick={() => void gate.connect()}>Connect</button>
    <button onClick={() => void gate.disconnect()}>Disconnect</button>
    <Gated feature="premium-signals" fallback={<span>Locked for this tier</span>}>
      <span>Premium mock panel</span>
    </Gated>
  </>;
}

describe("Gate SDK React bindings", function () {
  it("exposes gate state, connection actions, and a clear gated fallback", async function () {
    const client = makeClient();
    const wallet: Eip1193Provider = { request: vi.fn(async () => []) };
    render(<GateProvider client={client} provider={wallet}>
      <GateControls />
    </GateProvider>);

    await waitFor(() => expect(screen.getByTestId("status").textContent).to.equal("disconnected"));
    expect(screen.getByText("Locked for this tier")).toBeTruthy();
    fireEvent.click(screen.getByText("Connect"));

    await waitFor(() => expect(screen.getByTestId("status").textContent).to.equal("connected"));
    expect(screen.getByTestId("tier").textContent).to.equal("3");
    expect(screen.getByText("Premium mock panel")).toBeTruthy();
    expect(client.connectAndSignIn).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText("Disconnect"));
    await waitFor(() => expect(screen.getByTestId("status").textContent).to.equal("disconnected"));
    expect(client.logout).toHaveBeenCalledTimes(1);
  });
});