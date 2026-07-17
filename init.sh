#!/bin/bash
set -e

# Ensure Node 22 is used for native binding compatibility
export PATH="/opt/homebrew/opt/node@22/bin:$PATH"

# Install dependencies if node_modules is missing or stale
if [ ! -d "node_modules" ]; then
  echo "Installing root dependencies..."
  npm install
fi

if [ ! -d "apps/memroos/node_modules" ]; then
  echo "Installing app dependencies..."
  npm install --prefix apps/memroos
fi

# Ensure native bindings are present (Linux cloud envs may miss them)
if [ "$(uname)" = "Linux" ]; then
  npm install --no-save @rolldown/binding-linux-x64-gnu @tailwindcss/oxide-linux-x64-gnu @unrs/resolver-binding-linux-x64-gnu 2>/dev/null || true
fi

echo "Init complete."
