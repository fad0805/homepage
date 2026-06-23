from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from db.session import get_db
from crud.profiles import get_all_profiles, create_profile, update_profile, delete_profile
from schemas.profiles import ProfileCreate, ProfileUpdate

router = APIRouter()

@router.get("/")
@router.get("")
def get_profiles(db:Session = Depends(get_db)):
    """
    Get all profiles.
    """
    return get_all_profiles(db)


@router.post("/")
@router.post("")
def post_profiles(profile: ProfileCreate, db:Session = Depends(get_db)):
    """
    Create all profiles.
    """
    return create_profile(db, profile)


@router.put("/{profile_id}")
def modify_profile(profile_id: int, profile: ProfileUpdate, db: Session = Depends(get_db)):
    """
    Update an existing profile.
    """
    return update_profile(db, profile_id, profile)


@router.delete("/{profile_id}")
def remove_profile(profile_id: int, db: Session = Depends(get_db)):
    """
    Delete a link.
    """
    return delete_profile(db, profile_id)
