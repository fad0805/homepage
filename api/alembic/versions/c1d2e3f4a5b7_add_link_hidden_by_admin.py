"""add administrator hidden flag to links

Revision ID: c1d2e3f4a5b7
Revises: b0c1d2e3f4a6
Create Date: 2026-11-26 00:50:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "c1d2e3f4a5b7"
down_revision: Union[str, None] = "b0c1d2e3f4a6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "links",
        sa.Column(
            "hidden_by_admin",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )


def downgrade() -> None:
    op.drop_column("links", "hidden_by_admin")
