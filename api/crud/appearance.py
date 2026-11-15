from sqlalchemy.orm import Session

from models.users import AuthorSettings, User

DEFAULT_LAYOUT = "editorial"
DEFAULT_SIDE_POSITION = "left"
DEFAULT_COLOR_THEME = "mint"


def get_public_appearance(db: Session) -> dict:
    """Return the layout and color theme for the integrated public site.

    Until per-author routing is available, the public shell follows the
    primary administrator's appearance.
    """
    settings = (
        db.query(AuthorSettings)
        .join(User, User.id == AuthorSettings.user_id)
        .filter(User.role == "admin")
        .order_by(User.id.asc())
        .first()
    )
    if settings is None:
        settings = (
            db.query(AuthorSettings)
            .order_by(AuthorSettings.user_id.asc())
            .first()
        )
    return {
        "layout_key": settings.layout_key if settings else DEFAULT_LAYOUT,
        "side_position": (
            settings.side_position
            if settings
            else DEFAULT_SIDE_POSITION
        ),
        "default_theme": (
            settings.default_theme
            if settings
            else "light"
        ),
        "color_theme": (
            settings.color_theme
            if settings
            else DEFAULT_COLOR_THEME
        ),
        "color_background": settings.color_background if settings else None,
        "color_content": settings.color_content if settings else None,
        "color_accent": settings.color_accent if settings else None,
        "color_background_dark": (
            settings.color_background_dark if settings else None
        ),
        "color_content_dark": (
            settings.color_content_dark if settings else None
        ),
        "color_accent_dark": (
            settings.color_accent_dark if settings else None
        ),
    }
