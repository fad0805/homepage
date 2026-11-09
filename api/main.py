import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from core.config import ENVIRONMENT
from core.uploads import UPLOAD_DIR, ensure_upload_dir
from routers import (
    books,
    chapter_drafts,
    chapters,
    characters,
    illustrations,
    links,
    memos,
    profiles,
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
    yield

app = FastAPI(lifespan=lifespan)

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

ensure_upload_dir()
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

app.include_router(characters.router, prefix="/characters", tags=["characters"])
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
app.include_router(users.router, prefix="/users", tags=["signin"])
app.include_router(visits.router, prefix="/visits", tags=["visits"])

@app.get("/")
async def root():
    return {"message": "Welcome to Missing Island!"}
