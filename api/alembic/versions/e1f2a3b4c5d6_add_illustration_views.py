"""add illustration view counts

Revision ID: e1f2a3b4c5d6
Revises: d9e4f6a8b2c3
Create Date: 2026-11-12 22:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "e1f2a3b4c5d6"
down_revision: Union[str, None] = "d9e4f6a8b2c3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "illustrations",
        sa.Column(
            "view_count",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
    )

    op.create_table(
        "illustration_views",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("illustration_id", sa.Integer(), nullable=False),
        sa.Column("ip_hash", sa.String(length=64), nullable=False),
        sa.Column("last_viewed_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["illustration_id"],
            ["illustrations.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "illustration_id",
            "ip_hash",
            name="uq_illustration_views_illustration_ip",
        ),
    )
    op.create_index(
        op.f("ix_illustration_views_id"),
        "illustration_views",
        ["id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_illustration_views_illustration_id"),
        "illustration_views",
        ["illustration_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_illustration_views_illustration_id"),
        table_name="illustration_views",
    )
    op.drop_index(
        op.f("ix_illustration_views_id"),
        table_name="illustration_views",
    )
    op.drop_table("illustration_views")
    op.drop_column("illustrations", "view_count")
