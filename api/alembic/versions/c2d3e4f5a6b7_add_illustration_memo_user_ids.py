"""add user ownership to illustrations and memos

Revision ID: c2d3e4f5a6b7
Revises: b3c4d5e6f7a8
Create Date: 2026-11-13 11:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "c2d3e4f5a6b7"
down_revision: Union[str, None] = "b3c4d5e6f7a8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Move illustration and memo ownership to user ids.

    ``owner`` is kept as a nullable legacy column until the existing username
    data has been mapped by the separate data migration.
    """
    for table in ("illustrations", "memos"):
        op.add_column(
            table,
            sa.Column("user_id", sa.Integer(), nullable=True),
        )
        op.create_index(
            f"ix_{table}_user_id",
            table,
            ["user_id"],
        )
        op.create_foreign_key(
            f"fk_{table}_user_id",
            table,
            "users",
            ["user_id"],
            ["id"],
            ondelete="SET NULL",
        )
        op.alter_column(
            table,
            "owner",
            existing_type=sa.String(length=50),
            nullable=True,
        )


def downgrade() -> None:
    for table in ("memos", "illustrations"):
        op.drop_constraint(
            f"fk_{table}_user_id",
            table,
            type_="foreignkey",
        )
        op.drop_index(
            f"ix_{table}_user_id",
            table_name=table,
        )
        op.drop_column(table, "user_id")
