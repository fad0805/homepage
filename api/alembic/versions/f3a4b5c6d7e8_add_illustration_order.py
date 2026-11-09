"""add illustration order

Revision ID: f3a4b5c6d7e8
Revises: e9f0a1b2c3d4
Create Date: 2026-11-09 16:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "f3a4b5c6d7e8"
down_revision: Union[str, None] = "e9f0a1b2c3d4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add a manual display order for illustration groups."""
    op.add_column(
        "illustrations",
        sa.Column(
            "order",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
    )
    op.execute(
        """
        WITH ranked AS (
            SELECT
                id,
                ROW_NUMBER() OVER (
                    ORDER BY created_at DESC, id DESC
                ) - 1 AS position
            FROM illustrations
        )
        UPDATE illustrations AS illustration
        SET "order" = ranked.position
        FROM ranked
        WHERE illustration.id = ranked.id
        """
    )
    op.create_index(
        "ix_illustrations_order",
        "illustrations",
        ["order"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_illustrations_order", table_name="illustrations")
    op.drop_column("illustrations", "order")
