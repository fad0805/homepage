"""add profile subtitle

Revision ID: b8d2e4f6a1c3
Revises: a7c1f0d2e9b4
Create Date: 2026-11-08 16:55:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b8d2e4f6a1c3'
down_revision: Union[str, None] = 'a7c1f0d2e9b4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add an editable subtitle to the author profile."""
    op.add_column(
        'profiles',
        sa.Column('subtitle', sa.String(length=255), nullable=True),
    )


def downgrade() -> None:
    """Remove the author profile subtitle."""
    op.drop_column('profiles', 'subtitle')
