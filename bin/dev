#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")/.." || exit 1

compose=(
  docker compose
  -f docker-compose.yml
  -f docker-compose.dev.yml
)

cleanup() {
  trap - EXIT INT TERM
  "${compose[@]}" down
}

trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

"${compose[@]}" up
