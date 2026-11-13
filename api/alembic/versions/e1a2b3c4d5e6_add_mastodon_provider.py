"""add social provider to mastodon settings

Revision ID: e1a2b3c4d5e6
Revises: d8e9f0a1b2c3
Create Date: 2026-11-13 20:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "e1a2b3c4d5e6"
down_revision: Union[str, None] = "d8e9f0a1b2c3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "mastodon_settings",
        sa.Column(
            "provider",
            sa.String(length=20),
            nullable=False,
            server_default="mastodon",
        ),
    )


def downgrade() -> None:
    op.drop_column("mastodon_settings", "provider")
