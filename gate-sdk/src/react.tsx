import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";
import {
  Eip1193Provider,
  GateClient,
  GateSession,
} from "./client";

declare global {
  interface Window {
    ethereum?: Eip1193Provider;
  }
}

export interface GateProviderProps {
  client: GateClient;
  provider?: Eip1193Provider;
  children: ReactNode;
}

export interface GateState {
  status: "loading" | "disconnected" | "connecting" | "connected" | "error";
  address: string | null;
  tier: number;
  features: string[];
  connect(): Promise<GateSession>;
  disconnect(): Promise<void>;
  hasFeature(name: string): boolean;
}

const GateContext = createContext<GateState | null>(null);

export function GateProvider({ client, provider, children }: GateProviderProps) {
  const [session, setSession] = useState<GateSession | null>(null);
  const [status, setStatus] = useState<GateState["status"]>("loading");

  useEffect(() => {
    let active = true;
    const unsubscribe = client.onChange((next) => {
      if (!active) return;
      setSession(next);
      setStatus(next ? "connected" : "disconnected");
    });
    void client.getSession().then((next) => {
      if (!active) return;
      setSession(next);
      setStatus(next ? "connected" : "disconnected");
    }).catch(() => {
      if (active) setStatus("error");
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [client]);

  async function connect(): Promise<GateSession> {
    const wallet = provider ?? (typeof window !== "undefined" ? window.ethereum : undefined);
    setStatus("connecting");
    try {
      if (!wallet) throw new Error("No injected EIP-1193 wallet is available");
      return await client.connectAndSignIn(wallet);
    } catch (error) {
      setStatus("error");
      throw error;
    }
  }

  async function disconnect(): Promise<void> {
    await client.logout();
  }

  const value: GateState = {
    status,
    address: session?.address ?? null,
    tier: session?.tier ?? 0,
    features: session?.features ?? [],
    connect,
    disconnect,
    hasFeature: (name) => session?.features.includes(name) ?? false,
  };

  return <GateContext.Provider value={value}>{children}</GateContext.Provider>;
}

export function useGate(): GateState {
  const value = useContext(GateContext);
  if (!value) throw new Error("useGate must be used within a GateProvider");
  return value;
}

export interface GatedProps {
  feature: string;
  fallback?: ReactNode;
  children: ReactNode;
}

export function Gated({ feature, fallback = null, children }: GatedProps) {
  const gate = useGate();
  return gate.hasFeature(feature) ? children : fallback;
}