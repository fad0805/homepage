from fastapi import FastAPI

from api import links, login

app = FastAPI()

app.include_router(links.router, prefix="/links", tags=["links"])
app.include_router(login.router, prefix="/login", tags=["login"])

@app.get("/")
async def root():
    return {"message": "Hello World"}
