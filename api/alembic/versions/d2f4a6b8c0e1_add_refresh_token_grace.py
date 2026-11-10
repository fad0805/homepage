"""add refresh token rotation grace fields

Revision ID: d2f4a6b8c0e1
Revises: a1b2c3d4e5f6
Create Date: 2026-11-10 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "d2f4a6b8c0e1"
down_revision: Union[str, None] = "a1b2c3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Track the previous refresh token for concurrent refresh requests."""
    op.add_column(
        "users",
        sa.Column("previous_refresh_token", sa.String(length=255), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column("refresh_token_rotated_at", sa.DateTime(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("users", "refresh_token_rotated_at")
    op.drop_column("users", "previous_refresh_token")
