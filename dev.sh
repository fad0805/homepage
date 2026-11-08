#!/bin/bash
set -euo pipefail

handle_error {
  docker system prune -af
  exit 1
}

trap handle_error ERR

cd "$(dirname "$0")" || exit 1

echo "OK"
