"""add illustration tags

Revision ID: e3a5c7d9f1b2
Revises: d2f4a6b8c0e1
Create Date: 2026-11-10 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "e3a5c7d9f1b2"
down_revision: Union[str, None] = "d2f4a6b8c0e1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add tags to illustration groups."""
    op.add_column(
        "illustrations",
        sa.Column(
            "tags",
            sa.JSON(),
            nullable=False,
            server_default=sa.text("'[]'::json"),
        ),
    )


def downgrade() -> None:
    op.drop_column("illustrations", "tags")
