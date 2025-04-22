from fastapi import APIRouter

router = APIRouter()

@router.get("/")
def get_links():
    """
    Get all links.
    """
    return {"links": ["link1", "link2", "link3"]}
