#!/bin/bash
# Residue Worker Setup Script
#
# Creates the necessary Cloudflare resources and deploys the worker.
#
# IMPORTANT: Before running this script, you must create an R2 bucket
# and its S3 API credentials in the Cloudflare dashboard. See README.md
# for detailed instructions.
#
# Prerequisites:
#   - Node.js 18+
#   - Wrangler CLI: npm i -g wrangler
#   - Cloudflare account authenticated: wrangler login
#   - R2 bucket created with S3 API token (Access Key ID, Secret Access Key)
#
# Usage:
#   cd packages/worker
#   bash setup.sh

set -e

echo "=== residue worker setup ==="
echo ""
echo "Before continuing, make sure you have already created:"
echo "  1. An R2 bucket in the Cloudflare dashboard"
echo "  2. An R2 S3 API token with Object Read & Write permissions"
echo ""
echo "See README.md for step-by-step instructions."
echo ""
read -p "Have you completed the R2 setup? [y/N] " -r
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo ""
  echo "Please complete the R2 setup first. See README.md, Step 1."
  exit 1
fi

echo ""

# Collect R2 credentials
read -p "R2 Access Key ID: " R2_ACCESS_KEY_ID
read -p "R2 Account ID: " R2_ACCOUNT_ID
read -p "R2 Bucket Name: " R2_BUCKET_NAME
read -s -p "R2 Secret Access Key: " R2_SECRET_ACCESS_KEY
echo ""

if [ -z "$R2_ACCESS_KEY_ID" ] || [ -z "$R2_SECRET_ACCESS_KEY" ] || [ -z "$R2_ACCOUNT_ID" ] || [ -z "$R2_BUCKET_NAME" ]; then
  echo "Error: All R2 credentials are required."
  exit 1
fi

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

echo ""
echo "[1/6] Creating D1 database..."
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

# Update wrangler.jsonc with actual values
if [ "$(uname)" = "Darwin" ]; then
  sed -i '' "s/YOUR_D1_DATABASE_ID/$DB_ID/" wrangler.jsonc
else
  sed -i "s/YOUR_D1_DATABASE_ID/$DB_ID/" wrangler.jsonc
fi

echo "[2/6] Running D1 migrations..."
wrangler d1 execute residue-db --remote --file=migrations/0001_init.sql

echo "[3/6] Generating auth token..."
AUTH_TOKEN=$(openssl rand -hex 32)
echo "  Token: $AUTH_TOKEN"
echo ""
echo "  Setting secrets..."
echo "$AUTH_TOKEN" | wrangler secret put AUTH_TOKEN

echo "[4/6] Setting R2 credentials..."
echo "$R2_SECRET_ACCESS_KEY" | wrangler secret put R2_SECRET_ACCESS_KEY

# Write R2 vars into wrangler.jsonc
# Use a temp file approach to update the vars
echo "  Updating wrangler.jsonc with R2 vars..."
if command -v python3 >/dev/null 2>&1; then
  python3 -c "
import json, re

with open('wrangler.jsonc', 'r') as f:
    content = f.read()

# Remove comments for parsing
clean = re.sub(r'//.*$', '', content, flags=re.MULTILINE)
clean = re.sub(r',\s*([}\]])', r'\1', clean)
data = json.loads(clean)

data.setdefault('vars', {})
data['vars']['R2_ACCESS_KEY_ID'] = '$R2_ACCESS_KEY_ID'
data['vars']['R2_ACCOUNT_ID'] = '$R2_ACCOUNT_ID'
data['vars']['R2_BUCKET_NAME'] = '$R2_BUCKET_NAME'

if 'r2_buckets' in data and len(data['r2_buckets']) > 0:
    data['r2_buckets'][0]['bucket_name'] = '$R2_BUCKET_NAME'

with open('wrangler.jsonc', 'w') as f:
    json.dump(data, f, indent=2)
    f.write('\n')
" 2>/dev/null || echo "  Could not auto-update wrangler.jsonc. Please update R2 vars manually."
else
  echo "  python3 not found. Please update R2 vars in wrangler.jsonc manually:"
  echo "    R2_ACCESS_KEY_ID = $R2_ACCESS_KEY_ID"
  echo "    R2_ACCOUNT_ID = $R2_ACCOUNT_ID"
  echo "    R2_BUCKET_NAME = $R2_BUCKET_NAME"
fi

echo "[5/6] Setting UI credentials..."
echo "  Set a password for the web UI (ADMIN_PASSWORD):"
wrangler secret put ADMIN_PASSWORD

echo "[6/6] Deploying worker..."
wrangler deploy

WORKER_URL=$(wrangler deploy --dry-run 2>&1 | grep -o 'https://[^ ]*workers.dev' | head -1)
if [ -z "$WORKER_URL" ]; then
  WORKER_URL="https://residue.<your-subdomain>.workers.dev"
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
echo "  residue setup claude-code   # or: residue setup pi"
