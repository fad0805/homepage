from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from core.uploads import save_banner
from db.session import get_db
from crud.profiles import (
    create_profile,
    delete_profile,
    get_all_profiles,
    get_profile,
    update_profile,
)
from schemas.profiles import ProfileCreate, ProfileUpdate
from .utils import (
    get_default_author_id,
    get_optional_user,
    is_admin,
    require_admin,
    require_auth,
)

router = APIRouter()


@router.post("/upload")
async def upload_profile_image(
    file: UploadFile = File(...),
    _=Depends(require_auth),
):
    """Upload an image used inside an author introduction."""
    url = await save_banner(file, folder="author")
    return {"url": url}


@router.get("/others")
def get_other_profiles(
    db: Session = Depends(get_db),
    user=Depends(require_admin),
):
    """Return other authors' profiles for the admin read-only browser."""
    return get_all_profiles(db, exclude_user_id=user.id)


@router.get("/")
@router.get("")
def get_profiles(
    mine: bool = False,
    db: Session = Depends(get_db),
    current_user=Depends(get_optional_user),
):
    """
    Get all profiles, or only the signed-in author's profiles.
    """
    if mine:
        if current_user is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Not authenticated",
            )
        return get_all_profiles(db, user_id=current_user.id)
    author_id = get_default_author_id(db)
    if author_id is None:
        return []
    return get_all_profiles(db, user_id=author_id)


@router.get("/{profile_id}")
def get_profile_detail(profile_id: int, db: Session = Depends(get_db)):
    """
    Get a single public profile from the default author.
    """
    profile = get_profile(db, profile_id)
    if profile.get("user_id") != get_default_author_id(db):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Profile not found",
        )
    return profile


@router.post("/")
@router.post("")
def post_profiles(
    profile: ProfileCreate,
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    """
    Create a profile owned by the signed-in author.
    """
    return create_profile(db, profile, user.id)


@router.put("/{profile_id}")
def modify_profile(
    profile_id: int,
    profile: ProfileUpdate,
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    """
    Update one of the signed-in author's profiles.
    """
    return update_profile(db, profile_id, profile, user.id)


@router.delete("/{profile_id}")
def remove_profile(
    profile_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    """
    Delete a profile. Administrators may delete any author's profile.
    """
    return delete_profile(
        db,
        profile_id,
        None if is_admin(user) else user.id,
    )
