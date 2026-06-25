import os

ENVIRONMENT = os.getenv('ENVIRONMENT')
SECRET_KEY = os.getenv('SECRET_KEY')
ALGORITHM = os.getenv('ALGORITHM', 'HS256')
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv('ACCESS_TOKEN_EXPIRE_MINUTES', 30))
REFRESH_TOKEN_EXPIRE_DAYS = int(os.getenv('REFRESH_TOKEN_EXPIRE_DAYS', 7))

if ENVIRONMENT == 'development':
    import secrets
    SECRET_KEY = os.getenv('SECRET_KEY') or secrets.token_hex(32)
elif not SECRET_KEY:
    raise ValueError("SECRET_KEY environment variable is not set.")
