"""add character detail image

Revision ID: e7b2d9c4f6a1
Revises: c4e8f2a6b1d9
Create Date: 2026-11-09 00:20:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "e7b2d9c4f6a1"
down_revision: Union[str, None] = "c4e8f2a6b1d9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add a dedicated square image for character detail pages."""
    op.add_column(
        "characters",
        sa.Column("detail_image", sa.String(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("characters", "detail_image")
