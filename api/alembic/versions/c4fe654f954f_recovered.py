"""recovered placeholder for a server-only revision

Revision ID: c4fe654f954f
Revises: 9e4e0f4a2d92
Create Date: 2026-11-08
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c4fe654f954f'
down_revision: Union[str, None] = '9e4e0f4a2d92'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Keep a server-only revision resolvable.

    The production database was stamped with this revision, but the original
    migration file was never committed. Any schema changes from the original
    migration are already present in that database, so this placeholder only
    keeps the revision chain resolvable.
    """
    pass


def downgrade() -> None:
    """No-op downgrade for the recovered placeholder."""
    pass
