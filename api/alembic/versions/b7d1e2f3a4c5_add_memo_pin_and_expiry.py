"""add memo pin and expiry

Revision ID: b7d1e2f3a4c5
Revises: f1a2b3c4d5e6
Create Date: 2026-11-09 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "b7d1e2f3a4c5"
down_revision: Union[str, None] = "f1a2b3c4d5e6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Keep pinned memos indefinitely and expire the rest after one day."""
    op.add_column(
        "memos",
        sa.Column(
            "pinned",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )
    op.add_column(
        "memos",
        sa.Column("expires_at", sa.DateTime(), nullable=True),
    )
    op.execute(
        """
        UPDATE memos
        SET expires_at = created_at + interval '1 day'
        WHERE expires_at IS NULL
        """
    )
    op.alter_column("memos", "expires_at", nullable=False)
    op.create_index(
        "ix_memos_owner_pinned_expires_at",
        "memos",
        ["owner", "pinned", "expires_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_memos_owner_pinned_expires_at", table_name="memos")
    op.drop_column("memos", "expires_at")
    op.drop_column("memos", "pinned")
