import {
  BrowserProvider,
  Contract,
  getAddress,
  isAddress,
  JsonRpcProvider,
  parseUnits,
  ZeroAddress,
  type BrowserProvider as BrowserProviderType,
} from "ethers";
import "./style.css";
import {
  calculateTier,
  formatCountdown,
  formatUnitsDisplay,
  nextTierThreshold,
  type TierThresholds,
} from "./lib/utils";

declare global {
  interface Window {
    ethereum?: {
      request(args: { method: string; params?: unknown[] }): Promise<unknown>;
    };
  }
}

const INITIAL_SUPPLY = parseUnits("1000000000", 18);
const TOKEN_ABI = [
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
];
const STAKING_ABI = [
  "function stake(uint256)",
  "function unstake(uint256)",
  "function tierOf(address) view returns (uint8)",
  "function stakedBalance(address) view returns (uint256)",
  "function totalStaked() view returns (uint256)",
  "function lastStakeTimestamp(address) view returns (uint256)",
  "function UNLOCK_DELAY() view returns (uint256)",
  "function tier1Threshold() view returns (uint256)",
  "function tier2Threshold() view returns (uint256)",
  "function tier3Threshold() view returns (uint256)",
];
const VAULT_ABI = [
  "function pendingBurn() view returns (uint256)",
  "function burnAll()",
];
const VESTING_ABI = ["function released(address) view returns (uint256)"];
const BSC_TESTNET_EXPLORER = "https://testnet.bscscan.com/address/";

const environment = import.meta.env;
const chainId = Number(environment.VITE_CHAIN_ID || "97");
const rpcUrl = String(environment.VITE_RPC_URL || "").trim();
const configuredAddresses = {
  token: String(environment.VITE_TOKEN_ADDRESS || "").trim(),
  staking: String(environment.VITE_STAKING_ADDRESS || "").trim(),
  vault: String(environment.VITE_BURN_VAULT_ADDRESS || "").trim(),
  vesting: String(environment.VITE_VESTING_ADDRESS || "").trim(),
};

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing UI element: ${id}`);
  return found as T;
}

const ui = {
  connectButton: element<HTMLButtonElement>("connect-wallet"),
  switchButton: element<HTMLButtonElement>("switch-network"),
  connectionState: element<HTMLDivElement>("connection-state"),
  globalStatus: element<HTMLParagraphElement>("global-status"),
  refreshButton: element<HTMLButtonElement>("refresh-data"),
  contracts: element<HTMLDivElement>("contract-addresses"),
  totalSupply: element<HTMLElement>("metric-total-supply"),
  circulating: element<HTMLElement>("metric-circulating"),
  burned: element<HTMLElement>("metric-burned"),
  totalStaked: element<HTMLElement>("metric-staked"),
  pendingBurn: element<HTMLElement>("metric-pending-burn"),
  vestingReleased: element<HTMLElement>("metric-vesting-released"),
  vestingRemaining: element<HTMLElement>("metric-vesting-remaining"),
  currentTier: element<HTMLElement>("current-tier"),
  walletBalance: element<HTMLElement>("wallet-balance"),
  walletStaked: element<HTMLElement>("wallet-staked"),
  nextTier: element<HTMLElement>("next-tier"),
  unlockCountdown: element<HTMLElement>("unlock-countdown"),
  stakeForm: element<HTMLFormElement>("stake-form"),
  stakeAmount: element<HTMLInputElement>("stake-amount"),
  stakeButton: element<HTMLButtonElement>("stake-button"),
  stakeStatus: element<HTMLParagraphElement>("stake-status"),
  unstakeForm: element<HTMLFormElement>("unstake-form"),
  unstakeAmount: element<HTMLInputElement>("unstake-amount"),
  unstakeButton: element<HTMLButtonElement>("unstake-button"),
  unstakeStatus: element<HTMLParagraphElement>("unstake-status"),
  burnPanelPending: element<HTMLElement>("burn-panel-pending"),
  burnButton: element<HTMLButtonElement>("burn-button"),
  burnStatus: element<HTMLParagraphElement>("burn-status"),
};

function configuredAddress(value: string): string | null {
  if (!value || !isAddress(value)) return null;
  try {
    const address = getAddress(value);
    return address === ZeroAddress ? null : address;
  } catch {
    return null;
  }
}

const addresses = {
  token: configuredAddress(configuredAddresses.token),
  staking: configuredAddress(configuredAddresses.staking),
  vault: configuredAddress(configuredAddresses.vault),
  vesting: configuredAddress(configuredAddresses.vesting),
};
const addressesReady = Object.values(addresses).every((address) => address !== null);

let readProvider: JsonRpcProvider | undefined;
let browserProvider: BrowserProvider | undefined;
let connectedAddress = "";
let walletOnTargetChain = false;
let walletStaked = 0n;
let walletBalance = 0n;
let unlockAt = 0n;
let vaultPending = 0n;
let tierThresholds: TierThresholds | undefined;

function showStatus(message: string, error = false): void {
  ui.globalStatus.textContent = message;
  ui.globalStatus.classList.toggle("error", error);
}

function setActionStatus(target: HTMLElement, message: string, kind: "error" | "success" | "plain" = "plain"): void {
  target.textContent = message;
  target.classList.toggle("error", kind === "error");
  target.classList.toggle("success", kind === "success");
}

function errorMessage(error: unknown): string {
  if (error && typeof error === "object") {
    const details = error as { shortMessage?: unknown; message?: unknown; error?: { message?: unknown } };
    if (typeof details.shortMessage === "string" && details.shortMessage) return details.shortMessage;
    if (typeof details.error?.message === "string" && details.error.message) return details.error.message;
    if (typeof details.message === "string" && details.message) return details.message;
  }
  return String(error);
}

function isUserRejection(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const details = error as { code?: unknown; error?: { code?: unknown } };
  return details.code === 4001 || details.code === "ACTION_REJECTED" || details.error?.code === 4001;
}

function exactTransactionError(error: unknown): string {
  const message = errorMessage(error);
  return isUserRejection(error) ? message : message;
}

function updateActionButtons(): void {
  const walletReady = Boolean(connectedAddress && walletOnTargetChain && addressesReady);
  ui.stakeButton.disabled = !walletReady;
  ui.unstakeButton.disabled = !walletReady || walletStaked === 0n || BigInt(Math.floor(Date.now() / 1000)) < unlockAt;
  ui.burnButton.disabled = !walletReady || vaultPending === 0n;
  ui.switchButton.hidden = !connectedAddress || walletOnTargetChain;
}

function createContractRow(label: string, address: string | null): HTMLElement {
  const row = document.createElement("div");
  row.className = "contract-item";
  const title = document.createElement("span");
  title.className = "contract-label";
  title.textContent = label;
  const value = document.createElement("div");
  value.className = "contract-value";
  const code = document.createElement("code");
  code.textContent = address ?? "Not configured";
  value.append(code);

  if (address) {
    const actions = document.createElement("span");
    actions.className = "contract-actions";
    const copy = document.createElement("button");
    copy.type = "button";
    copy.textContent = "Copy";
    copy.setAttribute("aria-label", `Copy ${label} address`);
    copy.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(address);
        showStatus(`${label} address copied.`);
      } catch (error) {
        showStatus(errorMessage(error), true);
      }
    });
    const explorer = document.createElement("a");
    explorer.href = `${BSC_TESTNET_EXPLORER}${address}`;
    explorer.target = "_blank";
    explorer.rel = "noreferrer";
    explorer.textContent = "BscScan ↗";
    explorer.setAttribute("aria-label", `View ${label} on BSC Testnet BscScan`);
    actions.append(copy, explorer);
    value.append(actions);
  }

  row.append(title, value);
  return row;
}

function renderContractAddresses(): void {
  ui.contracts.replaceChildren(
    createContractRow("MKA token", addresses.token),
    createContractRow("Staking", addresses.staking),
    createContractRow("Burn vault", addresses.vault),
    createContractRow("Team vesting", addresses.vesting),
  );
}

function missingConfiguration(): string[] {
  const missing = Object.entries({
    VITE_TOKEN_ADDRESS: addresses.token,
    VITE_STAKING_ADDRESS: addresses.staking,
    VITE_BURN_VAULT_ADDRESS: addresses.vault,
    VITE_VESTING_ADDRESS: addresses.vesting,
  })
    .filter(([, value]) => !value)
    .map(([name]) => name);
  if (!rpcUrl) missing.push("VITE_RPC_URL");
  return missing;
}

async function loadTransparency(): Promise<void> {
  const missing = missingConfiguration();
  if (chainId !== 97) {
    showStatus("This app supports BSC Testnet only. Set VITE_CHAIN_ID=97.", true);
    return;
  }
  if (missing.length > 0) {
    showStatus(`Configure ${missing.join(", ")} in app/.env before loading contract data.`, true);
    return;
  }

  try {
    readProvider = new JsonRpcProvider(rpcUrl);
    const network = await readProvider.getNetwork();
    if (network.chainId !== BigInt(chainId)) {
      throw new Error(`Read-only RPC is on chain ${network.chainId}; expected BSC Testnet (${chainId}).`);
    }

    const token = new Contract(addresses.token!, TOKEN_ABI, readProvider);
    const staking = new Contract(addresses.staking!, STAKING_ABI, readProvider);
    const vault = new Contract(addresses.vault!, VAULT_ABI, readProvider);
    const vesting = new Contract(addresses.vesting!, VESTING_ABI, readProvider);
    const [supply, vestingBalance, staked, pending, released] = await Promise.all([
      token.getFunction("totalSupply")(),
      token.getFunction("balanceOf")(addresses.vesting!),
      staking.getFunction("totalStaked")(),
      vault.getFunction("pendingBurn")(),
      vesting.getFunction("released")(addresses.token!),
    ]);
    const circulating = BigInt(supply) - BigInt(vestingBalance) - BigInt(staked) - BigInt(pending);
    const burned = INITIAL_SUPPLY > BigInt(supply) ? INITIAL_SUPPLY - BigInt(supply) : 0n;
    vaultPending = BigInt(pending);

    ui.totalSupply.textContent = formatUnitsDisplay(BigInt(supply));
    ui.circulating.textContent = formatUnitsDisplay(circulating < 0n ? 0n : circulating);
    ui.burned.textContent = formatUnitsDisplay(burned);
    ui.totalStaked.textContent = formatUnitsDisplay(BigInt(staked));
    ui.pendingBurn.textContent = formatUnitsDisplay(vaultPending);
    ui.burnPanelPending.textContent = formatUnitsDisplay(vaultPending);
    ui.vestingReleased.textContent = formatUnitsDisplay(BigInt(released));
    ui.vestingRemaining.textContent = formatUnitsDisplay(BigInt(vestingBalance));
    updateActionButtons();
    if ((ui.globalStatus.textContent ?? "").startsWith("Configure ")) showStatus("");
  } catch (error) {
    showStatus(errorMessage(error), true);
  }
}

async function updateConnectionState(): Promise<void> {
  if (!browserProvider || !connectedAddress) {
    walletOnTargetChain = false;
    ui.connectionState.textContent = "Read-only view";
    ui.connectButton.textContent = "Connect wallet";
    updateActionButtons();
    return;
  }

  try {
    const network = await browserProvider.getNetwork();
    walletOnTargetChain = network.chainId === BigInt(chainId) && chainId === 97;
    ui.connectionState.textContent = walletOnTargetChain
      ? `${connectedAddress.slice(0, 6)}…${connectedAddress.slice(-4)}`
      : `Wrong network · chain ${network.chainId}`;
    ui.connectButton.textContent = "Wallet connected";
    updateActionButtons();
  } catch (error) {
    walletOnTargetChain = false;
    ui.connectionState.textContent = "Network unavailable";
    showStatus(errorMessage(error), true);
  }
}

async function refreshWallet(): Promise<void> {
  if (!browserProvider || !connectedAddress || !addressesReady || !walletOnTargetChain) {
    ui.walletBalance.textContent = connectedAddress ? "Switch to BSC Testnet" : "Connect wallet";
    ui.walletStaked.textContent = "—";
    ui.currentTier.textContent = "Tier —";
    ui.nextTier.textContent = "—";
    ui.unlockCountdown.textContent = "—";
    walletStaked = 0n;
    unlockAt = 0n;
    updateActionButtons();
    return;
  }

  try {
    const token = new Contract(addresses.token!, TOKEN_ABI, browserProvider);
    const staking = new Contract(addresses.staking!, STAKING_ABI, browserProvider);
    const [balance, staked, tier, lastStake, delay, tier1, tier2, tier3] = await Promise.all([
      token.getFunction("balanceOf")(connectedAddress),
      staking.getFunction("stakedBalance")(connectedAddress),
      staking.getFunction("tierOf")(connectedAddress),
      staking.getFunction("lastStakeTimestamp")(connectedAddress),
      staking.getFunction("UNLOCK_DELAY")(),
      staking.getFunction("tier1Threshold")(),
      staking.getFunction("tier2Threshold")(),
      staking.getFunction("tier3Threshold")(),
    ]);

    walletBalance = BigInt(balance);
    walletStaked = BigInt(staked);
    tierThresholds = { tier1: BigInt(tier1), tier2: BigInt(tier2), tier3: BigInt(tier3) };
    unlockAt = BigInt(lastStake) === 0n ? 0n : BigInt(lastStake) + BigInt(delay);

    ui.walletBalance.textContent = `${formatUnitsDisplay(walletBalance)} MKA`;
    ui.walletStaked.textContent = `${formatUnitsDisplay(walletStaked)} MKA`;
    ui.currentTier.textContent = `Tier ${Number(tier)}`;
    const next = nextTierThreshold(walletStaked, tierThresholds);
    if (next === null) {
      ui.nextTier.textContent = "Highest tier";
    } else {
      const remaining = next - walletStaked;
      ui.nextTier.textContent = `${formatUnitsDisplay(remaining)} MKA to Tier ${calculateTier(walletStaked, tierThresholds) + 1}`;
    }
    renderUnlockCountdown();
    updateActionButtons();
  } catch (error) {
    showStatus(errorMessage(error), true);
  }
}

function renderUnlockCountdown(): void {
  ui.unlockCountdown.textContent = unlockAt === 0n
    ? "No active lock"
    : formatCountdown(unlockAt, BigInt(Math.floor(Date.now() / 1000)));
  updateActionButtons();
}

async function connectWallet(): Promise<void> {
  if (!window.ethereum) {
    showStatus("No injected wallet was found. Install or enable an EIP-1193 wallet.", true);
    return;
  }

  try {
    browserProvider = new BrowserProvider(
      window.ethereum as ConstructorParameters<typeof BrowserProvider>[0],
    );
    const accounts = await browserProvider.send("eth_requestAccounts", []) as string[];
    if (!accounts[0] || !isAddress(accounts[0])) throw new Error("Wallet returned no valid account.");
    connectedAddress = getAddress(accounts[0]);
    await updateConnectionState();
    await refreshWallet();
    showStatus(walletOnTargetChain ? "Wallet connected." : "Wallet connected. Switch to BSC Testnet to submit transactions.");
  } catch (error) {
    showStatus(exactTransactionError(error), true);
  }
}

async function switchToTestnet(): Promise<void> {
  if (!window.ethereum) return;
  const requestedChainId = `0x${chainId.toString(16)}`;
  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: requestedChainId }],
    });
  } catch (error) {
    const details = error as { code?: number };
    if (details.code !== 4902) {
      showStatus(exactTransactionError(error), true);
      return;
    }
    try {
      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [{
          chainId: requestedChainId,
          chainName: "BNB Smart Chain Testnet",
          nativeCurrency: { name: "tBNB", symbol: "tBNB", decimals: 18 },
          rpcUrls: [rpcUrl],
          blockExplorerUrls: ["https://testnet.bscscan.com"],
        }],
      });
    } catch (addError) {
      showStatus(exactTransactionError(addError), true);
      return;
    }
  }

  if (window.ethereum) {
    browserProvider = new BrowserProvider(
      window.ethereum as ConstructorParameters<typeof BrowserProvider>[0],
    );
  }
  await updateConnectionState();
  await refreshWallet();
}

async function writeContracts(): Promise<{ token: Contract; staking: Contract; vault: Contract }> {
  if (!browserProvider || !connectedAddress) throw new Error("Connect a wallet first.");
  await updateConnectionState();
  if (!walletOnTargetChain) throw new Error("Switch to BSC Testnet before submitting this transaction.");
  const signer = await browserProvider.getSigner();
  return {
    token: new Contract(addresses.token!, TOKEN_ABI, signer),
    staking: new Contract(addresses.staking!, STAKING_ABI, signer),
    vault: new Contract(addresses.vault!, VAULT_ABI, signer),
  };
}

function amountFromInput(input: HTMLInputElement): bigint {
  const text = input.value.trim();
  if (!text || !/^\d+(\.\d{1,18})?$/.test(text)) {
    throw new Error("Enter a positive MKA amount with no more than 18 decimal places.");
  }
  const amount = parseUnits(text, 18);
  if (amount <= 0n) throw new Error("Amount must be greater than zero.");
  return amount;
}

ui.connectButton.addEventListener("click", () => void connectWallet());
ui.switchButton.addEventListener("click", () => void switchToTestnet());
ui.refreshButton.addEventListener("click", () => {
  void loadTransparency();
  void refreshWallet();
});

ui.stakeForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  ui.stakeButton.disabled = true;
  try {
    const amount = amountFromInput(ui.stakeAmount);
    const { token, staking } = await writeContracts();
    const allowance = BigInt(await token.getFunction("allowance")(connectedAddress, addresses.staking!));
    if (allowance < amount) {
      setActionStatus(ui.stakeStatus, "Step 1/2: approve the exact stake amount in your wallet.");
      const approval = await token.getFunction("approve")(addresses.staking!, amount);
      setActionStatus(ui.stakeStatus, `Step 1/2 submitted: ${approval.hash}. Waiting for confirmation.`);
      await approval.wait();
    } else {
      setActionStatus(ui.stakeStatus, "Step 1/2: existing allowance is sufficient.");
    }

    setActionStatus(ui.stakeStatus, "Step 2/2: confirm stake in your wallet.");
    const transaction = await staking.getFunction("stake")(amount);
    setActionStatus(ui.stakeStatus, `Step 2/2 submitted: ${transaction.hash}. Waiting for confirmation.`);
    await transaction.wait();
    setActionStatus(ui.stakeStatus, `Stake confirmed: ${transaction.hash}`, "success");
    ui.stakeAmount.value = "";
    await Promise.all([refreshWallet(), loadTransparency()]);
  } catch (error) {
    setActionStatus(ui.stakeStatus, exactTransactionError(error), "error");
  } finally {
    updateActionButtons();
  }
});

ui.unstakeForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  ui.unstakeButton.disabled = true;
  try {
    const amount = amountFromInput(ui.unstakeAmount);
    if (amount > walletStaked) throw new Error("Unstake amount exceeds your staked balance.");
    if (BigInt(Math.floor(Date.now() / 1000)) < unlockAt) {
      throw new Error(`Stake remains locked until ${new Date(Number(unlockAt) * 1000).toLocaleString()}.`);
    }
    const { staking } = await writeContracts();
    setActionStatus(ui.unstakeStatus, "Confirm unstake in your wallet.");
    const transaction = await staking.getFunction("unstake")(amount);
    setActionStatus(ui.unstakeStatus, `Unstake submitted: ${transaction.hash}. Waiting for confirmation.`);
    await transaction.wait();
    setActionStatus(ui.unstakeStatus, `Unstake confirmed: ${transaction.hash}`, "success");
    ui.unstakeAmount.value = "";
    await Promise.all([refreshWallet(), loadTransparency()]);
  } catch (error) {
    setActionStatus(ui.unstakeStatus, exactTransactionError(error), "error");
  } finally {
    updateActionButtons();
  }
});

ui.burnButton.addEventListener("click", async () => {
  ui.burnButton.disabled = true;
  try {
    if (vaultPending <= 0n) throw new Error("The burn vault has no pending MKA.");
    const { vault } = await writeContracts();
    setActionStatus(ui.burnStatus, "Confirm public vault burn in your wallet.");
    const transaction = await vault.getFunction("burnAll")();
    setActionStatus(ui.burnStatus, `Burn submitted: ${transaction.hash}. Waiting for confirmation.`);
    await transaction.wait();
    setActionStatus(ui.burnStatus, `Burn confirmed: ${transaction.hash}`, "success");
    await loadTransparency();
  } catch (error) {
    setActionStatus(ui.burnStatus, exactTransactionError(error), "error");
  } finally {
    updateActionButtons();
  }
});

renderContractAddresses();
void loadTransparency();
setInterval(renderUnlockCountdown, 1_000);
setInterval(() => {
  void loadTransparency();
  if (connectedAddress) void refreshWallet();
}, 30_000);