from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from db.session import get_db
from crud.profiles import get_all_profiles, get_profile, create_profile, update_profile, delete_profile
from schemas.profiles import ProfileCreate, ProfileUpdate
from .utils import require_auth

router = APIRouter()

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
def post_profiles(profile: ProfileCreate, db:Session = Depends(get_db), _ = Depends(require_auth)):
    """
    Create all profiles.
    """
    return create_profile(db, profile)


@router.put("/{profile_id}")
def modify_profile(
    profile_id: int,
    profile: ProfileUpdate,
    db: Session = Depends(get_db),
    _ = Depends(require_auth)
):
    """
    Update an existing profile.
    """
    return update_profile(db, profile_id, profile)


@router.delete("/{profile_id}")
def remove_profile(profile_id: int, db: Session = Depends(get_db), _ = Depends(require_auth)):
    """
    Delete a link.
    """
    return delete_profile(db, profile_id)
