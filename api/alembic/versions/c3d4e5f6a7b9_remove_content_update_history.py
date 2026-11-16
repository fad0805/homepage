"""remove illustration and table-of-contents update history

Revision ID: c3d4e5f6a7b9
Revises: b2c3d4e5f6a8
Create Date: 2026-11-16
"""

from typing import Sequence, Union

from alembic import op

revision: str = "c3d4e5f6a7b9"
down_revision: Union[str, Sequence[str], None] = "b2c3d4e5f6a8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        DELETE FROM planner_events
        WHERE action = 'updated'
          AND entity_type IN (
              'book',
              'book_category',
              'illustration'
          )
        """
    )


def downgrade() -> None:
    # Deleted history cannot be reconstructed.
    pass
