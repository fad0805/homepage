"""add illustrations

Revision ID: c8f2a4d6e0b1
Revises: b7d1e2f3a4c5
Create Date: 2026-11-09 14:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "c8f2a4d6e0b1"
down_revision: Union[str, None] = "b7d1e2f3a4c5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create illustration groups and their member images."""
    op.create_table(
        "illustrations",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("owner", sa.String(length=50), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("representative_image_id", sa.Integer(), nullable=True),
        sa.Column(
            "visible",
            sa.Boolean(),
            nullable=False,
            server_default=sa.true(),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_illustrations_owner"),
        "illustrations",
        ["owner"],
        unique=False,
    )

    op.create_table(
        "illustration_images",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("illustration_id", sa.Integer(), nullable=False),
        sa.Column("url", sa.String(length=1000), nullable=False),
        sa.Column("original_name", sa.String(length=255), nullable=True),
        sa.Column(
            "order",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
        sa.ForeignKeyConstraint(
            ["illustration_id"],
            ["illustrations.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_illustration_images_illustration_id"),
        "illustration_images",
        ["illustration_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_illustration_images_illustration_id"),
        table_name="illustration_images",
    )
    op.drop_table("illustration_images")
    op.drop_index(op.f("ix_illustrations_owner"), table_name="illustrations")
    op.drop_table("illustrations")
