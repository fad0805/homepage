from fastapi import FastAPI

import links

app = FastAPI()

app.include_router(links.router, prefix="/links", tags=["links"])

@app.get("/")
async def root():
    return {"message": "Hello World"}
