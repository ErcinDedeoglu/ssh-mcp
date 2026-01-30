#!/usr/bin/env bash
set -euo pipefail

# Priority: CLI arg > SHARDS env var > default (8)
SHARD_COUNT=${1:-${SHARDS:-8}}
PIDS=()
EXIT_CODES=()
TEMP_DIR=$(mktemp -d)
SCRIPT_START=$(date +%s)

cleanup() {
  CLEANUP_START=$(date +%s)
  echo ""
  echo "Cleaning up Docker environments..."
  for ((i=0; i<SHARD_COUNT; i++)); do
    PORT_BASE=$((2+i)) docker compose -f docker-compose.test.yml -p "ssh-mcp-e2e-$i" down -v --remove-orphans 2>/dev/null &
  done
  wait
  rm -rf "$TEMP_DIR"
  CLEANUP_END=$(date +%s)
  echo "Cleanup complete. (Cleanup: $((CLEANUP_END - CLEANUP_START))s, Total: $((CLEANUP_END - SCRIPT_START))s)"
}
trap cleanup EXIT

PHASE1_START=$(date +%s)
echo "=== Phase 1: Starting $SHARD_COUNT Docker environments in parallel ==="
for ((i=0; i<SHARD_COUNT; i++)); do
  PORT_BASE=$((2+i)) docker compose -f docker-compose.test.yml -p "ssh-mcp-e2e-$i" up -d &
done
wait
PHASE1_END=$(date +%s)
echo "All containers started. (Phase 1: $((PHASE1_END - PHASE1_START))s)"

echo ""
PHASE2_START=$(date +%s)
echo "=== Phase 2: Waiting for all containers to be healthy ==="
for ((i=0; i<SHARD_COUNT; i++)); do
  PROJECT="ssh-mcp-e2e-$i"
  echo -n "[Shard $i] Waiting for health..."
  for attempt in {1..30}; do
    RUNNING=$(docker compose -p "$PROJECT" ps --status running -q 2>/dev/null | wc -l)
    if [[ "$RUNNING" -ge 3 ]]; then
      echo " ready (ports $((2+i))222-$((2+i))224)"
      break
    fi
    sleep 1
  done
done
PHASE2_END=$(date +%s)
echo "Health checks complete. (Phase 2: $((PHASE2_END - PHASE2_START))s)"

echo ""
echo "=== Phase 3: Running $SHARD_COUNT test shards in parallel ==="
PHASE3_START=$(date +%s)

for ((i=0; i<SHARD_COUNT; i++)); do
  SHARD_NUM=$((i + 1))
  LOG_FILE="$TEMP_DIR/shard-$i.log"
  
  TEST_SHARD_INDEX=$i SKIP_DOCKER_SETUP=1 npx vitest run \
    --config vitest.config.e2e.ts \
    --shard "$SHARD_NUM/$SHARD_COUNT" \
    > "$LOG_FILE" 2>&1 &
  
  PIDS+=($!)
  echo "[Shard $i] Started (PID: ${PIDS[$i]})"
done

echo ""
echo "Waiting for all test shards..."
echo ""

for ((i=0; i<SHARD_COUNT; i++)); do
  if wait "${PIDS[$i]}"; then
    EXIT_CODES+=("0")
    PASSED=$(grep -oP 'Tests\s+\K\d+(?=\s+passed)' "$TEMP_DIR/shard-$i.log" 2>/dev/null || echo "?")
    echo "[Shard $i] ✓ Passed ($PASSED tests)"
  else
    EXIT_CODES+=("1")
    echo "[Shard $i] ✗ Failed"
  fi
done

PHASE3_END=$(date +%s)
SCRIPT_END=$(date +%s)

echo ""
echo "=== Results ==="
echo "Phase 1 (Docker start):  $((PHASE1_END - PHASE1_START))s"
echo "Phase 2 (Health check):  $((PHASE2_END - PHASE2_START))s"
echo "Phase 3 (Tests):         $((PHASE3_END - PHASE3_START))s"
echo "Total time:              $((SCRIPT_END - SCRIPT_START))s"

FAILED=0
for ((i=0; i<SHARD_COUNT; i++)); do
  if [[ "${EXIT_CODES[$i]}" != "0" ]]; then
    FAILED=1
    echo ""
    echo "[Shard $i] FAILED - Last 50 lines:"
    echo "----------------------------------------"
    tail -50 "$TEMP_DIR/shard-$i.log"
    echo "----------------------------------------"
  fi
done

if [[ $FAILED -eq 0 ]]; then
  echo ""
  echo "All $SHARD_COUNT shards passed!"
  exit 0
else
  echo ""
  echo "Some shards failed!"
  exit 1
fi
