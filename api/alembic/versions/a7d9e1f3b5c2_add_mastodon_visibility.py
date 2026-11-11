"""add mastodon visibility setting

Revision ID: a7d9e1f3b5c2
Revises: f4b6c8d0e2a1
Create Date: 2026-11-11 13:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "a7d9e1f3b5c2"
down_revision: Union[str, None] = "f4b6c8d0e2a1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Store the Mastodon status visibility for automated posts."""
    op.add_column(
        "mastodon_settings",
        sa.Column(
            "visibility",
            sa.String(length=20),
            nullable=False,
            server_default="public",
        ),
    )


def downgrade() -> None:
    op.drop_column("mastodon_settings", "visibility")
