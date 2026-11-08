import os

ENVIRONMENT = os.getenv('ENVIRONMENT')
SECRET_KEY = os.getenv('SECRET_KEY')
ALGORITHM = os.getenv('ALGORITHM', 'HS256')
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv('ACCESS_TOKEN_EXPIRE_MINUTES', 30))
REFRESH_TOKEN_EXPIRE_DAYS = int(os.getenv('REFRESH_TOKEN_EXPIRE_DAYS', 30))
# Keep auth cookies alive for as long as the refresh token is valid so that
# closing the browser does not end the session.
AUTH_COOKIE_MAX_AGE = REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60

# S3-compatible object storage
S3_ENDPOINT_URL = os.getenv('S3_ENDPOINT_URL')
S3_REGION = os.getenv('S3_REGION') or 'ap-northeast-2'
S3_BUCKET = os.getenv('S3_BUCKET')
S3_ACCESS_KEY_ID = os.getenv('S3_ACCESS_KEY_ID')
S3_SECRET_ACCESS_KEY = os.getenv('S3_SECRET_ACCESS_KEY')
S3_PUBLIC_BASE_URL = os.getenv('S3_PUBLIC_BASE_URL')
S3_KEY_PREFIX = os.getenv('S3_KEY_PREFIX') or 'images'
S3_ADDRESSING_STYLE = os.getenv('S3_ADDRESSING_STYLE')
S3_ACL = os.getenv('S3_ACL')

if ENVIRONMENT == 'development':
    import secrets
    SECRET_KEY = os.getenv('SECRET_KEY') or secrets.token_hex(32)
elif not SECRET_KEY:
    raise ValueError("SECRET_KEY environment variable is not set.")
