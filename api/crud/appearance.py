from sqlalchemy.orm import Session

from models.users import AuthorSettings, User

DEFAULT_LAYOUT = "editorial"


def get_public_layout(db: Session) -> str:
    """Return the layout for the integrated public site.

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
    return settings.layout_key if settings else DEFAULT_LAYOUT
