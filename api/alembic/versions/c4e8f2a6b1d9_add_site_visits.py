"""add site visits

Revision ID: c4e8f2a6b1d9
Revises: f7a2c4e6b8d0
Create Date: 2026-11-08 23:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "c4e8f2a6b1d9"
down_revision: Union[str, None] = "f7a2c4e6b8d0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Track anonymous site visits and their traffic sources."""
    op.create_table(
        "site_visits",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("ip_hash", sa.String(length=64), nullable=False),
        sa.Column("source", sa.String(length=255), nullable=False),
        sa.Column("referrer", sa.String(length=1024), nullable=True),
        sa.Column("path", sa.String(length=512), nullable=True),
        sa.Column("visited_on", sa.Date(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_site_visits_id"),
        "site_visits",
        ["id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_site_visits_ip_hash"),
        "site_visits",
        ["ip_hash"],
        unique=False,
    )
    op.create_index(
        op.f("ix_site_visits_visited_on"),
        "site_visits",
        ["visited_on"],
        unique=False,
    )
    op.create_index(
        "ix_site_visits_visited_on_source",
        "site_visits",
        ["visited_on", "source"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_site_visits_visited_on_source", table_name="site_visits")
    op.drop_index(
        op.f("ix_site_visits_visited_on"),
        table_name="site_visits",
    )
    op.drop_index(op.f("ix_site_visits_ip_hash"), table_name="site_visits")
    op.drop_index(op.f("ix_site_visits_id"), table_name="site_visits")
    op.drop_table("site_visits")
