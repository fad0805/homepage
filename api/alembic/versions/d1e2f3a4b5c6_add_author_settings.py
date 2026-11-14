"""add author settings for nicknames and public slugs

Revision ID: d1e2f3a4b5c6
Revises: c5d6e7f8a9b0
Create Date: 2026-11-14 12:00:00.000000

"""
import re
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "d1e2f3a4b5c6"
down_revision: Union[str, None] = "c5d6e7f8a9b0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

SLUG_MAX_LENGTH = 48


def _slug_base(username: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", username.lower()).strip("-")
    return (slug or "author")[:SLUG_MAX_LENGTH]


def upgrade() -> None:
    op.create_table(
        "author_settings",
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("slug", sa.String(length=64), nullable=False),
        sa.Column("nickname", sa.String(length=80), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("user_id"),
    )
    op.create_index(
        "ix_author_settings_slug",
        "author_settings",
        ["slug"],
        unique=True,
    )

    bind = op.get_bind()
    rows = bind.execute(
        sa.text("SELECT id, username FROM users ORDER BY id")
    ).fetchall()
    used_slugs: set[str] = set()
    for user_id, username in rows:
        base = _slug_base(username)
        slug = base
        suffix = 2
        while slug in used_slugs:
            suffix_text = f"-{suffix}"
            slug = f"{base[:SLUG_MAX_LENGTH - len(suffix_text)]}{suffix_text}"
            suffix += 1
        used_slugs.add(slug)
        bind.execute(
            sa.text(
                """
                INSERT INTO author_settings (user_id, slug, nickname)
                VALUES (:user_id, :slug, :nickname)
                """
            ),
            {
                "user_id": user_id,
                "slug": slug,
                "nickname": username,
            },
        )


def downgrade() -> None:
    op.drop_index(
        "ix_author_settings_slug",
        table_name="author_settings",
    )
    op.drop_table("author_settings")
