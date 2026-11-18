#!/usr/bin/env bash
set -e
if [ ! -d "node_modules" ]; then
  npm install
fi
echo "Starting SONORA locally at http://localhost:3000 ..."
npm run dev
