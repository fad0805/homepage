import os

# Tests never connect to Postgres, but importing planner code initializes the
# shared SQLAlchemy engine. Supply harmless defaults for local test runs.
os.environ.setdefault("DB_HOST", "127.0.0.1")
os.environ.setdefault("DB_PORT", "5432")
os.environ.setdefault("DB_NAME", "homepage_test")
os.environ.setdefault("DB_USER", "test")
os.environ.setdefault("DB_PASS", "test")
os.environ.setdefault("ENVIRONMENT", "development")
