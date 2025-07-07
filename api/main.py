from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api import links, users

app = FastAPI()

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

app.include_router(links.router, prefix="/links", tags=["links"])
app.include_router(users.router, prefix="/users", tags=["signin"])

@app.get("/")
async def root():
    return {"message": "Hello World"}
