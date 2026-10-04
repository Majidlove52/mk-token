# MKA Read-Only Monitor

This process polls BNB Chain-compatible RPC logs for large MKA transfers, vault burns, staking, unstaking, and MKA released by the team vesting contract. It creates no wallet, loads no signer, and cannot submit transactions. Use a read-only RPC endpoint.

## Setup

From the repository root:

```sh
npm ci
cp monitor/.env.example .env
```

Replace all zero-address and RPC placeholders with the deployed contract addresses and a read-only RPC URL. Telegram is optional; configure both Telegram variables or neither. Never put API credentials in the committed example file.

| Variable | Required | Description |
| --- | --- | --- |
| `RPC_URL` | Yes | Read-only JSON-RPC endpoint |
| `TOKEN_ADDRESS` | Yes | MKA token contract |
| `STAKING_ADDRESS` | Yes | MKA staking contract |
| `BURN_VAULT_ADDRESS` | Yes | MKA burn vault |
| `VESTING_ADDRESS` | Yes | Team vesting wallet |
| `LARGE_TRANSFER_MKA` | No | Strict transfer threshold in MKA; defaults to the placeholder `1000` |
| `TELEGRAM_BOT_TOKEN` | No | Telegram bot credential; never commit it |
| `TELEGRAM_CHAT_ID` | No | Telegram destination; required together with the bot token |
| `MONITOR_STATE_FILE` | No | Checkpoint path; defaults to `monitor/.monitor-state.json` |
| `POLL_INTERVAL_MS` | No | Poll interval; defaults to 15000 milliseconds |

## Run

```sh
npm run monitor
npm run monitor -- --dry
npm run test:monitor
npm run build:monitor
```

The first start records the current chain head and begins with the next block. Each successfully processed range is checkpointed atomically, so a normal restart resumes after the last completed range. RPC and delivery failures use exponential retry, up to 60 seconds. `--dry` prints alerts to stdout even when Telegram is configured, and never sends Telegram messages.

Alerts contain the event, amount, abbreviated participant where relevant, and BscScan transaction link. BSC testnet chain ID 97 uses the testnet explorer; other chain IDs use BscScan main explorer. Verify the RPC chain and contract addresses before service startup.

## systemd

Install the repository and dependencies under `/opt/mka-monitor`, create `/etc/mka-monitor/monitor.env` with the environment values above, and restrict that file to the service account. Keep the checkpoint on persistent local storage.

```ini
[Unit]
Description=MKA read-only chain monitor
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=mka-monitor
Group=mka-monitor
WorkingDirectory=/opt/mka-monitor
EnvironmentFile=/etc/mka-monitor/monitor.env
Environment=MONITOR_STATE_FILE=/var/lib/mka-monitor/state.json
StateDirectory=mka-monitor
StateDirectoryMode=0750
ExecStart=/usr/bin/npm run monitor
Restart=always
RestartSec=10
NoNewPrivileges=true
ProtectSystem=strict

[Install]
WantedBy=multi-user.target
```

Confirm the Node/npm executable paths on the host. The environment file contains a Telegram credential only if notifications are enabled; it does not contain blockchain signing material.

## Docker

Build from the repository root and pass a protected environment file at runtime. Persist the checkpoint directory:

```sh
docker build -f monitor/Dockerfile -t mka-readonly-monitor .
docker run --restart unless-stopped --env-file /secure/path/monitor.env \
  -v mka-monitor-state:/var/lib/mka-monitor mka-readonly-monitor
```

Do not bake `.env` or credentials into the image. Back up the checkpoint with the operational configuration and restrict access to both.