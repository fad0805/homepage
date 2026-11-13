from fastapi import APIRouter, Depends, File, UploadFile
from sqlalchemy.orm import Session

from core.uploads import save_banner
from db.session import get_db
from crud.profiles import get_all_profiles, get_profile, create_profile, update_profile, delete_profile
from schemas.profiles import ProfileCreate, ProfileUpdate
from .utils import require_admin

router = APIRouter()


@router.post("/upload")
async def upload_profile_image(
    file: UploadFile = File(...),
    _=Depends(require_admin),
):
    """Upload an image used inside the author introduction."""
    url = await save_banner(file, folder="author")
    return {"url": url}


@router.get("/")
@router.get("")
def get_profiles(db:Session = Depends(get_db)):
    """
    Get all profiles.
    """
    return get_all_profiles(db)


@router.get("/{profile_id}")
def get_profile(profile_id: int, db:Session = Depends(get_db)):
    """
    Get profile.
    """
    return get_profile(db, profile_id)


@router.post("/")
@router.post("")
def post_profiles(profile: ProfileCreate, db:Session = Depends(get_db), _ = Depends(require_admin)):
    """
    Create all profiles.
    """
    return create_profile(db, profile)


@router.put("/{profile_id}")
def modify_profile(
    profile_id: int,
    profile: ProfileUpdate,
    db: Session = Depends(get_db),
    _ = Depends(require_admin)
):
    """
    Update an existing profile.
    """
    return update_profile(db, profile_id, profile)


@router.delete("/{profile_id}")
def remove_profile(profile_id: int, db: Session = Depends(get_db), _ = Depends(require_admin)):
    """
    Delete a link.
    """
    return delete_profile(db, profile_id)
