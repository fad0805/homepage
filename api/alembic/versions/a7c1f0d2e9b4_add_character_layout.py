"""add character layout

Revision ID: a7c1f0d2e9b4
Revises: 30c1595c39ce
Create Date: 2026-11-08 16:10:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a7c1f0d2e9b4'
down_revision: Union[str, None] = '30c1595c39ce'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add the two-column placement option for public character lists."""
    op.add_column(
        'characters',
        sa.Column(
            'layout',
            sa.String(),
            nullable=False,
            server_default='auto',
        ),
    )


def downgrade() -> None:
    """Remove the character placement option."""
    op.drop_column('characters', 'layout')
