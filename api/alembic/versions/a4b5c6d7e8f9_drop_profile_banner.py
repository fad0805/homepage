"""drop profile banner column

Revision ID: a4b5c6d7e8f9
Revises: f3c4d5e6f7a8
Create Date: 2026-11-22 02:20:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "a4b5c6d7e8f9"
down_revision: Union[str, None] = "f3c4d5e6f7a8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_column("profiles", "banner_url")


def downgrade() -> None:
    op.add_column(
        "profiles",
        sa.Column("banner_url", sa.String(length=1000), nullable=True),
    )
