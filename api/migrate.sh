#!/bin/sh
set -e

compose_cmd="docker compose"
if [ "$1" = "--dev" ]; then
  compose_cmd="docker compose -f docker-compose.yml -f docker-compose.dev.yml"
fi

# Check if .env.production exists unless --dev is passed
if [ "$1" != "--dev" ] && [ ! -f .env.production ]; then
  echo "Error: .env.production not found. Run with --dev or create .env.production" >&2
  exit 1
fi

echo "Starting database service..."
$compose_cmd up -d db

echo "Waiting for the database to be ready..."
until $compose_cmd exec db pg_isready 2>/dev/null; do
  sleep 1
done

$compose_cmd run --rm api alembic upgrade head
$compose_cmd run --rm api alembic revision --autogenerate

$compose_cmd down
