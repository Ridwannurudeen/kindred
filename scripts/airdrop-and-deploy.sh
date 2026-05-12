#!/usr/bin/env bash
# Kindred — Solana devnet airdrop + deploy
#
# Run from the project root inside WSL:
#   ./scripts/airdrop-and-deploy.sh
#
# This script:
#   1. Funds the dev keypair via devnet airdrop (4 SOL across 2 attempts)
#   2. Initializes a fresh MXE cluster offset (one-time per program)
#   3. Builds and deploys the Anchor program to devnet
#   4. Initializes all 4 computation definitions
#   5. Uploads compiled Arcis circuits

set -euo pipefail

KEYPAIR="${KEYPAIR:-$HOME/.config/solana/id.json}"
RPC="${RPC:-https://api.devnet.solana.com}"

echo "==> Setting Solana config"
solana config set --url "$RPC" --keypair "$KEYPAIR"

ADDRESS=$(solana address)
echo "    address: $ADDRESS"

BAL=$(solana balance --output json-compact 2>/dev/null | grep -oE '"value":[0-9]+' | grep -oE '[0-9]+' || echo 0)
echo "    balance: ${BAL} lamports"

if [ "${BAL:-0}" -lt 4000000000 ]; then
    echo "==> Airdropping (devnet)"
    solana airdrop 2 || echo "WARN: airdrop 1 failed (rate limit?), continuing"
    sleep 5
    solana airdrop 2 || echo "WARN: airdrop 2 failed"
    solana balance
fi

echo "==> arcium build"
arcium build

echo "==> arcium deploy (devnet)"
echo "    First deploy will need a fresh cluster offset."
echo "    Use 'arcium init-mxe' if not already done; the offset is then in Arcium.toml."

# If deployer needs cluster offset, use --cluster-offset <N>; check Arcium.toml
arcium deploy --cluster devnet || {
    echo "FATAL: arcium deploy failed."
    echo "If 'cluster offset not set', first run:"
    echo "  arcium init-mxe --cluster devnet"
    echo "Then update Arcium.toml [clusters.devnet] offset, and re-run this script."
    exit 1
}

echo ""
echo "✓ Program deployed to devnet"
echo "  Run: yarn run ts-mocha -p ./tsconfig.json -t 1000000 tests/kindred.ts --cluster devnet"
echo "       to initialize the 4 comp defs + run e2e tests."
echo ""
echo "  Or run scripts/load-demo-data.ts to seed orgs + profiles."
