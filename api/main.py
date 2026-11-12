import asyncio
import logging
from contextlib import asynccontextmanager, suppress
from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from core.config import API_DOCS_ENABLED, ENVIRONMENT
from core.mastodon import mastodon_publish_loop
from core.uploads import UPLOAD_DIR, ensure_upload_dir
from routers import (
    archive,
    books,
    chapter_drafts,
    chapters,
    characters,
    embeds,
    gallery,
    illustrations,
    links,
    memos,
    profiles,
    settings,
    users,
    visits,
)

logger = logging.getLogger("uvicorn.error")

@asynccontextmanager
async def lifespan(app:FastAPI):
    logger.info("ENVIRONMENT=%s", ENVIRONMENT)
    if ENVIRONMENT == "development":
        logger.warning(
            "Development mode is enabled. Do not use this configuration "
            "on a production server."
        )
    users.create_admin_for_dev()
    mastodon_task = asyncio.create_task(mastodon_publish_loop())
    try:
        yield
    finally:
        mastodon_task.cancel()
        with suppress(asyncio.CancelledError):
            await mastodon_task

app = FastAPI(
    lifespan=lifespan,
    docs_url="/docs" if API_DOCS_ENABLED else None,
    redoc_url="/redoc" if API_DOCS_ENABLED else None,
    openapi_url="/openapi.json" if API_DOCS_ENABLED else None,
)


@app.exception_handler(RequestValidationError)
async def request_validation_exception_handler(
    request: Request,
    exc: RequestValidationError,
):
    """Avoid echoing backend validation internals to anonymous clients."""
    if ENVIRONMENT == "development":
        detail = jsonable_encoder(exc.errors())
    else:
        logger.info("Rejected an invalid request for %s", request.url.path)
        detail = "요청 값이 올바르지 않습니다."
    return JSONResponse(status_code=422, content={"detail": detail})


origins = [
    "http://web:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def add_api_security_headers(request: Request, call_next):
    """Apply basic hardening to proxied API responses as well as the web app."""
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    return response

ensure_upload_dir()
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

app.include_router(archive.router, prefix="/archive", tags=["archive"])
app.include_router(characters.router, prefix="/characters", tags=["characters"])
app.include_router(embeds.router, prefix="/embeds", tags=["embeds"])
app.include_router(gallery.router, prefix="/gallery", tags=["gallery"])
app.include_router(
    illustrations.router,
    prefix="/illustrations",
    tags=["illustrations"],
)
app.include_router(links.router, prefix="/links", tags=["links"])
app.include_router(memos.router, prefix="/memos", tags=["memos"])
app.include_router(profiles.router, prefix="/profiles", tags=["profiles"])
app.include_router(books.router, prefix="/books", tags=["books"])
app.include_router(chapters.router, prefix="/chapters", tags=["chapters"])
app.include_router(
    chapter_drafts.router,
    prefix="/chapter-drafts",
    tags=["chapter-drafts"],
)
app.include_router(settings.router, prefix="/settings", tags=["settings"])
app.include_router(users.router, prefix="/users", tags=["signin"])
app.include_router(visits.router, prefix="/visits", tags=["visits"])

@app.get("/")
async def root():
    return {"message": "Welcome to Missing Island!"}
