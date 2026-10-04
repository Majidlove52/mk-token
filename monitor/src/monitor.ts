import "dotenv/config";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  JsonRpcProvider,
  Log,
  EventFragment,
  parseUnits,
  isAddress,
} from "ethers";
import {
  burnVaultInterface,
  formatAlert,
  MonitorAddresses,
  parseMonitorLogs,
  stakingInterface,
  tokenInterface,
  vestingInterface,
} from "./alerts";

interface MonitorConfig {
  rpcUrl: string;
  addresses: MonitorAddresses;
  transferThreshold: bigint;
  telegramBotToken?: string;
  telegramChatId?: string;
  stateFile: string;
  pollIntervalMs: number;
}

interface Checkpoint {
  lastProcessedBlock: number;
}

function loadConfig(): MonitorConfig {
  const readRequired = (name: string): string => {
    const value = process.env[name]?.trim();
    if (!value) throw new Error(`Missing required environment variable ${name}`);
    return value;
  };
  const readAddress = (name: string): string => {
    const value = readRequired(name);
    if (!isAddress(value)) throw new Error(`${name} must be a valid EVM address`);
    return value;
  };
  const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN?.trim() || undefined;
  const telegramChatId = process.env.TELEGRAM_CHAT_ID?.trim() || undefined;
  if (Boolean(telegramBotToken) !== Boolean(telegramChatId)) {
    throw new Error("Set both TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID, or neither");
  }
  const transferThreshold = parseUnits(process.env.LARGE_TRANSFER_MKA?.trim() || "1000", 18);
  const pollIntervalMs = Number(process.env.POLL_INTERVAL_MS ?? 15_000);
  if (transferThreshold < 0n) throw new Error("LARGE_TRANSFER_MKA must not be negative");
  if (!Number.isSafeInteger(pollIntervalMs) || pollIntervalMs < 1 || pollIntervalMs > 3_600_000) {
    throw new Error("POLL_INTERVAL_MS must be an integer between 1 and 3600000");
  }

  return {
    rpcUrl: readRequired("RPC_URL"),
    addresses: {
      token: readAddress("TOKEN_ADDRESS"),
      staking: readAddress("STAKING_ADDRESS"),
      burnVault: readAddress("BURN_VAULT_ADDRESS"),
      vesting: readAddress("VESTING_ADDRESS"),
    },
    transferThreshold,
    telegramBotToken,
    telegramChatId,
    stateFile: process.env.MONITOR_STATE_FILE ?? path.resolve("monitor/.monitor-state.json"),
    pollIntervalMs,
  };
}

async function readCheckpoint(file: string): Promise<Checkpoint | undefined> {
  try {
    const checkpoint = JSON.parse(await readFile(file, "utf8")) as Checkpoint;
    if (!Number.isSafeInteger(checkpoint.lastProcessedBlock) || checkpoint.lastProcessedBlock < 0) {
      throw new Error("Invalid monitor checkpoint");
    }
    return checkpoint;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

async function writeCheckpoint(file: string, checkpoint: Checkpoint): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const temporaryFile = `${file}.tmp`;
  await writeFile(temporaryFile, `${JSON.stringify(checkpoint, null, 2)}\n`, { mode: 0o600 });
  await rename(temporaryFile, file);
}

async function fetchLogs(
  provider: JsonRpcProvider,
  addresses: MonitorAddresses,
  fromBlock: number,
  toBlock: number,
): Promise<Log[]> {
  const queries = [
    [addresses.token, tokenInterface],
    [addresses.staking, stakingInterface],
    [addresses.burnVault, burnVaultInterface],
    [addresses.vesting, vestingInterface],
  ] as const;
  const logs: Log[] = [];
  for (const [address, contractInterface] of queries) {
    const topics = contractInterface.fragments
      .filter((fragment): fragment is EventFragment => fragment.type === "event")
      .map((fragment) => fragment.topicHash);
    logs.push(...await provider.getLogs({ address, fromBlock, toBlock, topics: [topics] }));
  }
  return logs.sort((left, right) => left.blockNumber - right.blockNumber || left.index - right.index);
}

async function sendTelegram(config: MonitorConfig, message: string): Promise<void> {
  const response = await fetch(
    `https://api.telegram.org/bot${config.telegramBotToken}/sendMessage`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: config.telegramChatId, text: message, disable_web_page_preview: true }),
    },
  );
  if (!response.ok) throw new Error(`Telegram API returned HTTP ${response.status}`);
}

async function deliver(config: MonitorConfig, message: string, dryRun: boolean): Promise<void> {
  if (dryRun || !config.telegramBotToken) {
    console.log(message);
    return;
  }
  await sendTelegram(config, message);
}

async function delay(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function pollRange(
  provider: JsonRpcProvider,
  config: MonitorConfig,
  fromBlock: number,
  toBlock: number,
  chainId: bigint,
  dryRun: boolean,
): Promise<void> {
  const logs = await fetchLogs(provider, config.addresses, fromBlock, toBlock);
  const alerts = parseMonitorLogs(logs, config.addresses, config.transferThreshold);
  for (const alert of alerts) await deliver(config, formatAlert(alert, chainId), dryRun);
}

async function runMonitor(config: MonitorConfig, dryRun: boolean): Promise<void> {
  const provider = new JsonRpcProvider(config.rpcUrl);
  let checkpoint = await readCheckpoint(config.stateFile);
  let chainId: bigint | undefined;
  let backoffMs = config.pollIntervalMs;
  while (true) {
    try {
      chainId ??= (await provider.getNetwork()).chainId;
      if (!checkpoint) {
        checkpoint = { lastProcessedBlock: await provider.getBlockNumber() };
        await writeCheckpoint(config.stateFile, checkpoint);
        console.log(`Monitoring from block ${checkpoint.lastProcessedBlock + 1}`);
      }
      const head = await provider.getBlockNumber();
      while (checkpoint.lastProcessedBlock < head) {
        const fromBlock = checkpoint.lastProcessedBlock + 1;
        const toBlock = Math.min(fromBlock + 1_999, head);
        await pollRange(provider, config, fromBlock, toBlock, chainId!, dryRun);
        checkpoint = { lastProcessedBlock: toBlock };
        await writeCheckpoint(config.stateFile, checkpoint);
      }
      backoffMs = config.pollIntervalMs;
      await delay(config.pollIntervalMs);
    } catch (error) {
      console.error(`Monitor poll failed: ${(error as Error).message}; retrying in ${backoffMs}ms`);
      await delay(backoffMs);
      backoffMs = Math.min(backoffMs * 2, 60_000);
    }
  }
}

if (require.main === module) {
  const dryRun = process.argv.includes("--dry");
  runMonitor(loadConfig(), dryRun).catch((error: unknown) => {
    console.error(`Monitor could not start: ${(error as Error).message}`);
    process.exitCode = 1;
  });
}