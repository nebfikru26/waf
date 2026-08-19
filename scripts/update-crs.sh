#!/bin/sh
# =============================================================================
# AffiniSecurity WAF — Automated OWASP CRS Updater
# Runs on a schedule, checks GitHub for a new release, and triggers backend sync
# =============================================================================

API_BASE="${BACKEND_API:-http://api-dotnet:8080}"
VERSION_FILE="/data/crs-version.txt"
CHECK_INTERVAL="${CHECK_INTERVAL_SEC:-86400}"  # default: 24h
GITHUB_API="https://api.github.com/repos/coreruleset/coreruleset/releases/latest"

log() { echo "[CRS-UPDATER] $(date -u +'%Y-%m-%dT%H:%M:%SZ') $*"; }

# Wait for the API to be ready before starting
wait_for_api() {
  log "Waiting for API to be ready..."
  for i in $(seq 1 30); do
    if wget -qO- "${API_BASE}/api/auth/ping" > /dev/null 2>&1; then
      log "API is ready."
      return 0
    fi
    sleep 5
  done
  log "WARNING: API not reachable after 150s, running update anyway."
}

# Get the admin JWT token for calling protected endpoints
get_auth_token() {
  TOKEN=$(wget -qO- \
    --post-data "{\"email\":\"${ADMIN_EMAIL:-admin@affinisecurity.io}\",\"password\":\"${ADMIN_PASSWORD:-Password123!}\"}" \
    --header "Content-Type: application/json" \
    "${API_BASE}/api/auth/login" \
    | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
  echo "$TOKEN"
}

# Fetch the latest CRS tag from GitHub
get_latest_tag() {
  wget -qO- \
    --header "User-Agent: AffiniSecurity-CRS-Updater/1.0" \
    "${GITHUB_API}" \
    | grep -o '"tag_name":"[^"]*"' | head -1 | cut -d'"' -f4
}

# Trigger the backend github-sync + commit-sync pipeline
trigger_backend_sync() {
  TOKEN=$1
  log "Triggering GitHub sync via backend API..."

  RESULT=$(wget -qO- \
    --method POST \
    --header "Authorization: Bearer ${TOKEN}" \
    --header "Content-Type: application/json" \
    "${API_BASE}/api/firewall/crs/github-sync" 2>&1)

  log "GitHub sync result: ${RESULT}"
}

# ── Main Loop ──

wait_for_api

while true; do
  log "Checking for new OWASP CRS release..."

  LATEST=$(get_latest_tag)
  if [ -z "$LATEST" ]; then
    log "ERROR: Could not retrieve latest tag from GitHub. Will retry later."
    sleep "$CHECK_INTERVAL"
    continue
  fi

  CURRENT=""
  if [ -f "$VERSION_FILE" ]; then
    CURRENT=$(cat "$VERSION_FILE")
  fi

  log "Installed: '${CURRENT}' | Latest: '${LATEST}'"

  if [ "$LATEST" != "$CURRENT" ]; then
    log "New CRS version detected: ${LATEST}. Starting update..."

    TOKEN=$(get_auth_token)
    if [ -z "$TOKEN" ]; then
      log "ERROR: Could not authenticate with backend. Skipping update."
      sleep "$CHECK_INTERVAL"
      continue
    fi

    trigger_backend_sync "$TOKEN"
    echo "$LATEST" > "$VERSION_FILE"
    log "Update complete. CRS is now at version ${LATEST}."
  else
    log "CRS is already up to date (${CURRENT}). Next check in ${CHECK_INTERVAL}s."
  fi

  sleep "$CHECK_INTERVAL"
done
