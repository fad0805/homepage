import os
from pathlib import Path

ENVIRONMENT = os.getenv('ENVIRONMENT')
SECRET_KEY = os.getenv('SECRET_KEY')
ALGORITHM = os.getenv('ALGORITHM', 'HS256')
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv('ACCESS_TOKEN_EXPIRE_MINUTES', 30))
REFRESH_TOKEN_EXPIRE_DAYS = int(os.getenv('REFRESH_TOKEN_EXPIRE_DAYS', 30))
# Keep auth cookies alive for as long as the refresh token is valid so that
# closing the browser does not end the session.
AUTH_COOKIE_MAX_AGE = REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60
# After a refresh token is rotated, accept the previous one for a short window
# so concurrent requests do not invalidate each other's cookies.
REFRESH_TOKEN_GRACE_SECONDS = int(
    os.getenv('REFRESH_TOKEN_GRACE_SECONDS', 60)
)

# One-time gallery invite codes and the browser cookie they unlock.
# The default is 24 hours; GALLERY_SESSION_DAYS can override it.
GALLERY_COOKIE_NAME = os.getenv('GALLERY_COOKIE_NAME', 'gallery_access')
GALLERY_SESSION_DAYS = int(os.getenv('GALLERY_SESSION_DAYS', 1))
GALLERY_INVITE_HOURS = int(os.getenv('GALLERY_INVITE_HOURS', 24))
GALLERY_COOKIE_MAX_AGE = GALLERY_SESSION_DAYS * 24 * 60 * 60
# Revoked invite records older than this are removed automatically.
GALLERY_INVITE_RETENTION_DAYS = int(
    os.getenv('GALLERY_INVITE_RETENTION_DAYS', 30)
)

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

# Background archive exports. Generated ZIPs are kept for a few days so the
# admin can download them after the job finishes.
ARCHIVE_DIR = Path(
    os.getenv('ARCHIVE_DIR', '/tmp/missing-island-archives')
)
ARCHIVE_RETENTION_HOURS = int(os.getenv('ARCHIVE_RETENTION_HOURS', 72))
# A small delay between items keeps a large export from monopolizing the
# server. Set to 0 to disable throttling.
ARCHIVE_THROTTLE_SECONDS = float(os.getenv('ARCHIVE_THROTTLE_SECONDS', 0.05))

if ENVIRONMENT == 'development':
    import secrets
    SECRET_KEY = os.getenv('SECRET_KEY') or secrets.token_hex(32)
elif not SECRET_KEY:
    raise ValueError("SECRET_KEY environment variable is not set.")

# Interactive API documentation (Swagger UI / ReDoc / OpenAPI JSON) is useful
# in development but must not advertise every admin route elsewhere. Docs stay
# off unless this is explicit development mode or API_DOCS_ENABLED is true.
_docs_env = os.getenv('API_DOCS_ENABLED')
API_DOCS_ENABLED = (
    _docs_env.strip().lower() in ('1', 'true', 'yes', 'on')
    if _docs_env is not None
    else ENVIRONMENT == 'development'
)
