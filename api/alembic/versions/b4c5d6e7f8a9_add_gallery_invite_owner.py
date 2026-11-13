"""add issuer ownership to gallery invites

Revision ID: b4c5d6e7f8a9
Revises: a3b4c5d6e7f8
Create Date: 2026-11-13 22:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "b4c5d6e7f8a9"
down_revision: Union[str, None] = "a3b4c5d6e7f8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "gallery_invites",
        sa.Column("user_id", sa.Integer(), nullable=True),
    )
    op.create_index(
        "ix_gallery_invites_user_id",
        "gallery_invites",
        ["user_id"],
    )
    op.create_foreign_key(
        "fk_gallery_invites_user_id",
        "gallery_invites",
        "users",
        ["user_id"],
        ["id"],
        ondelete="CASCADE",
    )

    # Existing invites were issued for resources whose owner is known.
    op.execute(
        """
        UPDATE gallery_invites AS gi
        SET user_id = COALESCE(
            (
                SELECT i.user_id
                FROM illustrations AS i
                WHERE i.id = gi.illustration_id
            ),
            (
                SELECT c.user_id
                FROM chapters AS c
                WHERE c.id = gi.chapter_id
            ),
            (
                SELECT b.user_id
                FROM books AS b
                WHERE b.id = gi.book_id
            )
        )
        WHERE gi.user_id IS NULL
        """
    )
    # Fallback for deleted/orphaned resources: assign to the oldest account.
    op.execute(
        """
        UPDATE gallery_invites
        SET user_id = (
            SELECT id FROM users ORDER BY created_at ASC NULLS LAST, id ASC
            LIMIT 1
        )
        WHERE user_id IS NULL
        """
    )

    bind = op.get_bind()
    nulls = bind.execute(
        sa.text(
            "SELECT count(*) FROM gallery_invites WHERE user_id IS NULL"
        )
    ).scalar_one()
    if nulls:
        raise RuntimeError(
            "gallery_invites에 user_id가 NULL인 행이 남아 있습니다. "
            "사용자 계정을 먼저 확인해주세요."
        )

    op.alter_column(
        "gallery_invites",
        "user_id",
        existing_type=sa.Integer(),
        nullable=False,
    )


def downgrade() -> None:
    op.drop_constraint(
        "fk_gallery_invites_user_id",
        "gallery_invites",
        type_="foreignkey",
    )
    op.drop_index(
        "ix_gallery_invites_user_id",
        table_name="gallery_invites",
    )
    op.drop_column("gallery_invites", "user_id")
