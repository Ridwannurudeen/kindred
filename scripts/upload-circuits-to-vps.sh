#!/usr/bin/env bash
# Kindred — upload compiled .arcis circuits to VPS
#
# Off-chain circuit storage: comp_def accounts on Solana hold only the URL
# + SHA-256 hash. Arx nodes fetch the .arcis from this VPS at execution
# time and verify the hash against the on-chain commitment. Mismatch = fail.
#
# Cost: ~0.02 SOL total for 4 comp_defs vs ~64 SOL for on-chain bytecode.
#
# Prereqs:
#   - `arcium build` has emitted build/*.arcis (all 4 circuits)
#   - nginx vhost has the /circuits/ location block from scripts/deploy-vps.sh
#   - scp + ssh access to VPS_HOST
#
# Usage:
#   ./scripts/upload-circuits-to-vps.sh
#   VPS_HOST=user@1.2.3.4 ./scripts/upload-circuits-to-vps.sh

set -euo pipefail

VPS_HOST="${VPS_HOST:-root@gudman.xyz}"
DOMAIN="${DOMAIN:-kindred.gudman.xyz}"
REMOTE_DIR="${REMOTE_DIR:-/opt/kindred/circuits}"

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BUILD_DIR="$ROOT_DIR/build"

CIRCUITS=(init_org_registry_v2 register_profile_v2 intra_org_match_v2 cross_org_match_v2)

echo "==> Verifying build artifacts"
for c in "${CIRCUITS[@]}"; do
    f="$BUILD_DIR/$c.arcis"
    if [[ ! -f "$f" ]]; then
        echo "FATAL: $f not found. Run 'arcium build' first." >&2
        exit 1
    fi
done

echo "==> SHA-256 (must match on-chain comp_def.circuit_source.hash)"
for c in "${CIRCUITS[@]}"; do
    f="$BUILD_DIR/$c.arcis"
    size=$(wc -c < "$f")
    hash=$(sha256sum "$f" | cut -d' ' -f1)
    printf "  %-22s %8d bytes  sha256=%s\n" "$c" "$size" "$hash"
done

echo "==> scp build/*.arcis -> $VPS_HOST:$REMOTE_DIR"
ssh "$VPS_HOST" "mkdir -p $REMOTE_DIR && chmod 755 $REMOTE_DIR"
scp -q \
    "$BUILD_DIR"/init_org_registry_v2.arcis \
    "$BUILD_DIR"/register_profile_v2.arcis \
    "$BUILD_DIR"/intra_org_match_v2.arcis \
    "$BUILD_DIR"/cross_org_match_v2.arcis \
    "$VPS_HOST:$REMOTE_DIR/"
ssh "$VPS_HOST" "chmod 644 $REMOTE_DIR/*.arcis"

echo "==> Verifying reachability over HTTPS"
for c in "${CIRCUITS[@]}"; do
    url="https://$DOMAIN/circuits/$c.arcis"
    status=$(curl -sI -o /dev/null -w "%{http_code}" "$url")
    local_hash=$(sha256sum "$BUILD_DIR/$c.arcis" | cut -d' ' -f1)
    remote_hash=$(curl -s "$url" | sha256sum | cut -d' ' -f1)
    if [[ "$status" != "200" ]]; then
        echo "  FAIL $c: HTTP $status"
        exit 1
    fi
    if [[ "$local_hash" != "$remote_hash" ]]; then
        echo "  FAIL $c: hash mismatch local=$local_hash remote=$remote_hash"
        exit 1
    fi
    echo "  OK   $c  $url"
done

echo ""
echo "Circuits live. Arx nodes will fetch + verify against on-chain hash on next computation."
