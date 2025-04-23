from fastapi import FastAPI

from api import links
from db.session import SessionLocal


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


app = FastAPI()

app.include_router(links.router, prefix="/links", tags=["links"])

@app.get("/")
async def root():
    return {"message": "Hello World"}
