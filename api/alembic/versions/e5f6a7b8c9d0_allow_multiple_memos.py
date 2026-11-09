"""allow multiple memos per user

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-11-09 00:10:00.000000

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "e5f6a7b8c9d0"
down_revision: Union[str, None] = "d4e5f6a7b8c9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Allow each user to keep more than one one-line memo."""
    op.drop_index(op.f("ix_memos_owner"), table_name="memos")
    op.create_index(
        op.f("ix_memos_owner"),
        "memos",
        ["owner"],
        unique=False,
    )


def downgrade() -> None:
    # Keep only the most recent memo per owner so the unique index can be
    # restored.
    op.execute(
        """
        DELETE FROM memos older
        USING memos newer
        WHERE older.owner = newer.owner
          AND older.id < newer.id
        """
    )
    op.drop_index(op.f("ix_memos_owner"), table_name="memos")
    op.create_index(
        op.f("ix_memos_owner"),
        "memos",
        ["owner"],
        unique=True,
    )
