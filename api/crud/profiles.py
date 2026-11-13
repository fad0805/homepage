from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from models.profiles import Profile
from schemas.profiles import ProfileCreate, ProfileUpdate


def _serialize_profile(profile: Profile) -> dict:
    return {
        "id": profile.id,
        "user_id": profile.user_id,
        "owner": profile.user.username if profile.user else None,
        "title": profile.title,
        "subtitle": profile.subtitle,
        "profile": profile.profile,
    }


# Profile CRUD Operations
def get_all_profiles(
    db: Session,
    *,
    user_id: int | None = None,
    exclude_user_id: int | None = None,
):
    """
    Get all profiles, one author's profiles, or every other author's profiles.
    """
    query = db.query(Profile)
    if user_id is not None:
        query = query.filter(Profile.user_id == user_id)
    if exclude_user_id is not None:
        query = query.filter(Profile.user_id != exclude_user_id)
    profiles = query.order_by(Profile.id.asc()).all()
    return [_serialize_profile(profile) for profile in profiles]


def get_profile(db: Session, profile_id: int):
    """
    Get profile from database.
    """
    profile = (
        db.query(Profile).filter(Profile.id == profile_id).first()
    )
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Profile not found",
        )
    return _serialize_profile(profile)


def create_profile(db: Session, profile: ProfileCreate, user_id: int):
    """
    Create a new profile owned by the signed-in author.
    """
    data = profile.model_dump(exclude={"user_id"})
    db_profile = Profile(**data, user_id=user_id)
    db.add(db_profile)
    db.commit()
    db.refresh(db_profile)
    return _serialize_profile(db_profile)


def update_profile(
    db: Session,
    profile_id: int,
    updated_profile: ProfileUpdate,
    user_id: int,
):
    """
    Update one of the signed-in author's profiles.
    """
    profile = (
        db.query(Profile)
        .filter(
            Profile.id == profile_id,
            Profile.user_id == user_id,
        )
        .first()
    )
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Profile not found",
        )

    for key, value in updated_profile.model_dump(
        exclude_unset=True
    ).items():
        setattr(profile, key, value)

    db.commit()
    db.refresh(profile)
    return _serialize_profile(profile)


def delete_profile(
    db: Session,
    profile_id: int,
    user_id: int | None = None,
):
    """
    Delete a profile. Administrators may delete any author's profile.
    """
    query = db.query(Profile).filter(Profile.id == profile_id)
    if user_id is not None:
        query = query.filter(Profile.user_id == user_id)
    profile = query.first()
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Does not exist profile",
        )

    db.delete(profile)
    db.commit()
    return True
