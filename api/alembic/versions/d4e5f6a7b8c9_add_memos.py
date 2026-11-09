"""add memos

Revision ID: d4e5f6a7b8c9
Revises: a2b3c4d5e6f7
Create Date: 2026-11-09 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "d4e5f6a7b8c9"
down_revision: Union[str, None] = "a2b3c4d5e6f7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create the per-user one-line memo table."""
    op.create_table(
        "memos",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("owner", sa.String(length=50), nullable=False),
        sa.Column("content", sa.String(length=500), nullable=False),
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
    op.create_index(op.f("ix_memos_owner"), "memos", ["owner"], unique=True)


def downgrade() -> None:
    op.drop_index(op.f("ix_memos_owner"), table_name="memos")
    op.drop_table("memos")
