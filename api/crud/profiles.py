from fastapi import HTTPException, status
from sqlalchemy.orm import Session, joinedload

from core.uploads import delete_replaced_upload, delete_uploaded_file
from models.profiles import Profile
from models.users import User
from schemas.profiles import ProfileCreate, ProfileUpdate


def _serialize_profile(profile: Profile) -> dict:
    user = profile.user
    author_settings = user.author_settings if user else None
    return {
        "id": profile.id,
        "user_id": profile.user_id,
        "owner": user.username if user else None,
        "nickname": (
            author_settings.nickname
            if author_settings
            else user.username
            if user
            else None
        ),
        "title": profile.title,
        "subtitle": profile.subtitle,
        "banner_url": profile.banner_url,
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
    query = db.query(Profile).options(
        joinedload(Profile.user).joinedload(User.author_settings)
    )
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
        db.query(Profile)
        .options(
            joinedload(Profile.user).joinedload(User.author_settings)
        )
        .filter(Profile.id == profile_id)
        .first()
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
        .options(
            joinedload(Profile.user).joinedload(User.author_settings)
        )
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

    old_banner_url = profile.banner_url
    data = updated_profile.model_dump(exclude_unset=True)

    for key, value in data.items():
        setattr(profile, key, value)

    db.commit()
    db.refresh(profile)

    if (
        old_banner_url
        and "banner_url" in data
        and old_banner_url != profile.banner_url
    ):
        still_used = (
            db.query(Profile)
            .filter(Profile.banner_url == old_banner_url)
            .first()
        )
        if not still_used:
            delete_replaced_upload(old_banner_url, profile.banner_url)

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

    banner_url = profile.banner_url
    db.delete(profile)
    db.commit()

    if banner_url:
        still_used = (
            db.query(Profile).filter(Profile.banner_url == banner_url).first()
        )
        if not still_used:
            delete_uploaded_file(banner_url)

    return True
