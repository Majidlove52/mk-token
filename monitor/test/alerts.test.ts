import { expect } from "chai";
import { Log } from "ethers";
import {
  burnVaultInterface,
  exceedsTransferThreshold,
  formatAlert,
  parseMonitorLogs,
  stakingInterface,
  tokenInterface,
  vestingInterface,
  MonitorAddresses,
} from "../src/alerts";

const addresses: MonitorAddresses = {
  token: "0x0000000000000000000000000000000000000001",
  staking: "0x0000000000000000000000000000000000000002",
  burnVault: "0x0000000000000000000000000000000000000003",
  vesting: "0x0000000000000000000000000000000000000004",
};
const from = "0x0000000000000000000000000000000000000005";
const to = "0x0000000000000000000000000000000000000006";
const txHash = `0x${"ab".repeat(32)}`;

function mockLog(address: string, contractInterface: typeof tokenInterface, event: string, args: unknown[]): Log {
  const encoded = contractInterface.encodeEventLog(contractInterface.getEvent(event)!, args);
  return {
    address,
    data: encoded.data,
    topics: encoded.topics,
    transactionHash: txHash,
    blockHash: `0x${"cd".repeat(32)}`,
    blockNumber: 123,
    transactionIndex: 0,
    index: 0,
    removed: false,
  } as unknown as Log;
}

describe("Monitor alert helpers", function () {
  it("uses a strict greater-than transfer threshold", function () {
    expect(exceedsTransferThreshold(100n, 100n)).to.equal(false);
    expect(exceedsTransferThreshold(101n, 100n)).to.equal(true);
  });

  it("parses mocked contract logs and ignores below-threshold or unrelated vesting events", function () {
    const logs = [
      mockLog(addresses.token, tokenInterface, "Transfer", [from, to, 100n]),
      mockLog(addresses.token, tokenInterface, "Transfer", [from, to, 101n]),
      mockLog(addresses.burnVault, burnVaultInterface, "Burned", [from, 50n]),
      mockLog(addresses.staking, stakingInterface, "Staked", [to, 70n]),
      mockLog(addresses.staking, stakingInterface, "Unstaked", [to, 20n]),
      mockLog(addresses.vesting, vestingInterface, "ERC20Released", [addresses.token, 30n]),
      mockLog(addresses.vesting, vestingInterface, "ERC20Released", [addresses.staking, 40n]),
    ];

    const alerts = parseMonitorLogs(logs, addresses, 100n);
    expect(alerts.map((alert) => alert.kind)).to.deep.equal([
      "large-transfer", "burned", "staked", "unstaked", "vesting-release",
    ]);
    expect(alerts.map((alert) => alert.amount)).to.deep.equal([101n, 50n, 70n, 20n, 30n]);
  });

  it("formats a concise alert with the BSC testnet transaction link", function () {
    const message = formatAlert({
      kind: "large-transfer",
      amount: 125n * 10n ** 18n,
      address: addresses.token,
      transactionHash: txHash,
      blockNumber: 123,
      from,
      to,
    }, 97n);

    expect(message).to.contain("Large transfer: 125.0 MKA");
    expect(message).to.contain("https://testnet.bscscan.com/tx/");
  });
});