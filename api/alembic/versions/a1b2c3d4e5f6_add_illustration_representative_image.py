"""add illustration representative image

Revision ID: a1b2c3d4e5f6
Revises: f3a4b5c6d7e8
Create Date: 2026-11-10 02:10:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, None] = "f3a4b5c6d7e8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Store a separately uploaded, square representative image."""
    op.add_column(
        "illustrations",
        sa.Column("representative_url", sa.String(length=1000), nullable=True),
    )
    op.add_column(
        "illustrations",
        sa.Column(
            "representative_original_name",
            sa.String(length=255),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("illustrations", "representative_original_name")
    op.drop_column("illustrations", "representative_url")
