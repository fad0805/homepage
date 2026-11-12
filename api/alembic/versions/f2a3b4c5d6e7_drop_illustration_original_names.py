"""drop illustration original filenames

Revision ID: f2a3b4c5d6e7
Revises: e1f2a3b4c5d6
Create Date: 2026-11-12 22:45:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "f2a3b4c5d6e7"
down_revision: Union[str, None] = "e1f2a3b4c5d6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_column("illustration_images", "original_name")
    op.drop_column("illustrations", "representative_original_name")


def downgrade() -> None:
    op.add_column(
        "illustration_images",
        sa.Column("original_name", sa.String(length=255), nullable=True),
    )
    op.add_column(
        "illustrations",
        sa.Column(
            "representative_original_name",
            sa.String(length=255),
            nullable=True,
        ),
    )
