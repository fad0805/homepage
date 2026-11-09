"""add illustration taken_at

Revision ID: e9f0a1b2c3d4
Revises: c8f2a4d6e0b1
Create Date: 2026-11-09 15:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "e9f0a1b2c3d4"
down_revision: Union[str, None] = "c8f2a4d6e0b1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Record the date a photo was taken separately from its upload date."""
    op.add_column(
        "illustrations",
        sa.Column("taken_at", sa.Date(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("illustrations", "taken_at")
