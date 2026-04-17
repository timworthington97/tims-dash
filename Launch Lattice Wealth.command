#!/bin/zsh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"

if [[ -x "/opt/homebrew/bin/node" ]]; then
  export PATH="/opt/homebrew/bin:$PATH"
fi

cd "$ROOT"

if [[ ! -d "node_modules" ]]; then
  echo ""
  echo "Setting up Tim's Dash for the first time..."
  /opt/homebrew/bin/npm install
fi

if [[ ! -f ".env.local" && -f ".env.example" ]]; then
  cp ".env.example" ".env.local"
fi

/opt/homebrew/bin/node "scripts/start-local.mjs"
