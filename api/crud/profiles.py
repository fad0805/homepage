from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from models.profiles import Profile
from schemas.profiles import ProfileCreate, ProfileUpdate


# Profile CRUD Operations
def get_all_profiles(db: Session):
    """
    Get all profiles from database.
    """
    
    results = db.query(Profile).all()
    profiles = [
        {
            "id": profile.id,
            "title": profile.title,
            "profile": profile.profile
        } for profile in results
    ]
    return profiles


def get_profile(db: Session, profile_id: int):
    """
    Get profile from database.
    """
    
    query = db.query(Profile).filter(Profile.id == profile_id)
    profile = query.first()
    if not profile:
        raise ValueError("Profile not found")
    return profile


def create_profile(db:Session, profile: ProfileCreate):
    """
    Create a new profile in the database
    """
    db_profile = Profile(**profile.dict())
    db.add(db_profile)
    db.commit()
    db.refresh(db_profile)
    return db_profile


def update_profile(db:Session, profile_id: int, updated_profile: ProfileUpdate):
    """
        Update an existing profile in the database
    """
    db.query(Profile).filter(Profile.id == profile_id).update(updated_profile.dict(exclude_unset=True))
    db.commit()
    profile = db.query(Profile).filter(Profile.id == profile_id).first()
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Profile not found"
        )
    return profile


def delete_profile(db: Session, profile_id: int):
    """
    Delete a profile from database.
    """
    result = db.query(Profile).filter(Profile.id == profile_id).delete()
    db.commit()
    if result == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Does not exist profile"
        )
    return True
