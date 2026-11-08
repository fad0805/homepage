"""add chapter published_at

Revision ID: e2a7c9d1f3b4
Revises: d1f4a6b8c2e3
Create Date: 2026-11-08 20:10:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e2a7c9d1f3b4'
down_revision: Union[str, None] = 'd1f4a6b8c2e3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add an optional scheduled publication time to chapters."""
    op.add_column(
        'chapters',
        sa.Column('published_at', sa.DateTime(), nullable=True),
    )


def downgrade() -> None:
    """Remove the chapter publication schedule."""
    op.drop_column('chapters', 'published_at')
