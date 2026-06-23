echo "Waiting for postgres..."
while ! nc -z db 5432; do
  sleep 0.1
done
echo "PostgreSQL started!"

echo "Checking for database changes..."
alembic revision --autogenerate -m "auto_migration" || true

echo "Applying migrations..."
alembic upgrade head

echo "Starting FastAPI server..."
exec uvicorn app.main:app --host api
