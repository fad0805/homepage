#!/bin/sh
set -e

echo "Waiting for postgres..."
while ! nc -z db 5432; do
  sleep 1
done
echo "PostgreSQL started!"

echo "Applying migrations..."
alembic upgrade head

echo "Starting FastAPI server..."
exec "$@"
