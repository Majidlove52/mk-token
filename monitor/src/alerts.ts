import { formatUnits, Interface, Log } from "ethers";

export const tokenInterface = new Interface([
  "event Transfer(address indexed from, address indexed to, uint256 value)",
]);
export const stakingInterface = new Interface([
  "event Staked(address indexed user, uint256 amount)",
  "event Unstaked(address indexed user, uint256 amount)",
]);
export const burnVaultInterface = new Interface([
  "event Burned(address indexed caller, uint256 amount)",
]);
export const vestingInterface = new Interface([
  "event ERC20Released(address indexed token, uint256 amount)",
]);

export type AlertKind = "large-transfer" | "burned" | "staked" | "unstaked" | "vesting-release";

export interface MonitorAlert {
  kind: AlertKind;
  amount: bigint;
  address: string;
  transactionHash: string;
  blockNumber: number;
  from?: string;
  to?: string;
  account?: string;
}

export interface MonitorAddresses {
  token: string;
  staking: string;
  burnVault: string;
  vesting: string;
}

export function exceedsTransferThreshold(amount: bigint, threshold: bigint): boolean {
  return amount > threshold;
}

export function parseMonitorLogs(
  logs: readonly Log[],
  addresses: MonitorAddresses,
  threshold: bigint,
): MonitorAlert[] {
  const result: MonitorAlert[] = [];
  const normalized = Object.fromEntries(
    Object.entries(addresses).map(([key, address]) => [key, address.toLowerCase()]),
  );

  for (const log of logs) {
    const address = log.address.toLowerCase();
    let parsed;
    let kind: AlertKind | undefined;

    if (address === normalized.token) {
      parsed = tokenInterface.parseLog(log);
      if (parsed?.name === "Transfer") {
        const amount = parsed.args.value as bigint;
        if (!exceedsTransferThreshold(amount, threshold)) continue;
        result.push({
          kind: "large-transfer",
          amount,
          address: log.address,
          transactionHash: log.transactionHash,
          blockNumber: log.blockNumber,
          from: parsed.args.from as string,
          to: parsed.args.to as string,
        });
      }
      continue;
    }

    if (address === normalized.burnVault) {
      parsed = burnVaultInterface.parseLog(log);
      if (parsed?.name === "Burned") {
        kind = "burned";
        result.push({
          kind,
          amount: parsed.args.amount as bigint,
          address: log.address,
          transactionHash: log.transactionHash,
          blockNumber: log.blockNumber,
          account: parsed.args.caller as string,
        });
      }
      continue;
    }

    if (address === normalized.staking) {
      parsed = stakingInterface.parseLog(log);
      if (parsed?.name === "Staked" || parsed?.name === "Unstaked") {
        result.push({
          kind: parsed.name.toLowerCase() as "staked" | "unstaked",
          amount: parsed.args.amount as bigint,
          address: log.address,
          transactionHash: log.transactionHash,
          blockNumber: log.blockNumber,
          account: parsed.args.user as string,
        });
      }
      continue;
    }

    if (address === normalized.vesting) {
      parsed = vestingInterface.parseLog(log);
      if (parsed?.name === "ERC20Released" &&
          (parsed.args.token as string).toLowerCase() === normalized.token) {
        result.push({
          kind: "vesting-release",
          amount: parsed.args.amount as bigint,
          address: log.address,
          transactionHash: log.transactionHash,
          blockNumber: log.blockNumber,
        });
      }
    }
  }

  return result;
}

export function formatAlert(alert: MonitorAlert, chainId: bigint): string {
  const amount = `${formatUnits(alert.amount, 18)} MKA`;
  const subject = alert.account ? ` ${shortAddress(alert.account)}` : "";
  const details = alert.kind === "large-transfer"
    ? ` ${shortAddress(alert.from!)} -> ${shortAddress(alert.to!)}`
    : subject;
  const title: Record<AlertKind, string> = {
    "large-transfer": "Large transfer",
    burned: "Vault burn",
    staked: "Staked",
    unstaked: "Unstaked",
    "vesting-release": "Vesting release",
  };
  const explorer = chainId === 97n ? "https://testnet.bscscan.com" : "https://bscscan.com";
  return `${title[alert.kind]}: ${amount}${details}\n${explorer}/tx/${alert.transactionHash}`;
}

function shortAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}