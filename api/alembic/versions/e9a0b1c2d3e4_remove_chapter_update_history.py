"""remove chapter update history

Revision ID: e9a0b1c2d3e4
Revises: e8f9a0b1c2d3
Create Date: 2026-11-16
"""

from typing import Sequence, Union

from alembic import op

revision: str = "e9a0b1c2d3e4"
down_revision: Union[str, Sequence[str], None] = "e8f9a0b1c2d3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Covers databases that already ran the briefly-modified c3d4 migration,
    # which kept chapter update rows.
    op.execute(
        """
        DELETE FROM planner_events
        WHERE entity_type = 'chapter'
          AND action = 'updated'
        """
    )


def downgrade() -> None:
    # Deleted history cannot be reconstructed.
    pass
