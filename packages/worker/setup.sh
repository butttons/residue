#!/bin/bash
# Residue Worker Setup Script
#
# Creates the necessary Cloudflare resources and deploys the worker.
# Run this after cloning the repo.
#
# Prerequisites:
#   - Node.js 18+
#   - Wrangler CLI: npm i -g wrangler
#   - Cloudflare account authenticated: wrangler login
#
# Usage:
#   cd packages/worker
#   bash setup.sh

set -e

echo "=== residue worker setup ==="
echo ""

# Check wrangler is available
if ! command -v wrangler >/dev/null 2>&1; then
  echo "Error: wrangler is not installed."
  echo "Install it with: npm i -g wrangler"
  exit 1
fi

# Check wrangler is authenticated
if ! wrangler whoami >/dev/null 2>&1; then
  echo "Error: wrangler is not authenticated."
  echo "Run: wrangler login"
  exit 1
fi

echo "[1/5] Creating D1 database..."
DB_OUTPUT=$(wrangler d1 create residue-db 2>&1) || true
DB_ID=$(echo "$DB_OUTPUT" | grep -o 'database_id = "[^"]*"' | cut -d'"' -f2)

if [ -z "$DB_ID" ]; then
  echo "  Database may already exist. Trying to find it..."
  DB_ID=$(wrangler d1 list 2>&1 | grep "residue-db" | awk '{print $1}')
fi

if [ -z "$DB_ID" ]; then
  echo "Error: Could not create or find D1 database."
  echo "Create it manually: wrangler d1 create residue-db"
  exit 1
fi

echo "  Database ID: $DB_ID"

# Update wrangler.jsonc with the actual database ID
if [ "$(uname)" = "Darwin" ]; then
  sed -i '' "s/YOUR_D1_DATABASE_ID/$DB_ID/" wrangler.jsonc
else
  sed -i "s/YOUR_D1_DATABASE_ID/$DB_ID/" wrangler.jsonc
fi

echo "[2/5] Running D1 migrations..."
wrangler d1 execute residue-db --remote --file=migrations/0001_init.sql

echo "[3/5] Creating R2 bucket..."
wrangler r2 bucket create residue-sessions 2>&1 || echo "  Bucket may already exist (OK)"

echo "[4/5] Generating auth token..."
AUTH_TOKEN=$(openssl rand -hex 32)
echo "  Token: $AUTH_TOKEN"
echo ""
echo "  Setting as secret..."
echo "$AUTH_TOKEN" | wrangler secret put AUTH_TOKEN

echo "[5/5] Deploying worker..."
wrangler deploy

WORKER_URL=$(wrangler deploy --dry-run 2>&1 | grep -o 'https://[^ ]*workers.dev' | head -1)
if [ -z "$WORKER_URL" ]; then
  WORKER_URL="https://worker.<your-subdomain>.workers.dev"
fi

echo ""
echo "=== setup complete ==="
echo ""
echo "Worker URL: $WORKER_URL"
echo "Auth Token: $AUTH_TOKEN"
echo ""
echo "Now configure the CLI:"
echo "  residue login --url $WORKER_URL --token $AUTH_TOKEN"
echo ""
echo "Then initialize a repo:"
echo "  cd /path/to/your/repo"
echo "  residue init"
