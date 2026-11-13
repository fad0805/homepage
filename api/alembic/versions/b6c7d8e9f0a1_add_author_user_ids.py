"""add author user ids for characters, profiles and links

Revision ID: b6c7d8e9f0a1
Revises: a5b6c7d8e9f0
Create Date: 2026-11-13 18:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "b6c7d8e9f0a1"
down_revision: Union[str, None] = "a5b6c7d8e9f0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


TABLES = ("characters", "profiles", "links")


def upgrade() -> None:
    for table in TABLES:
        op.add_column(
            table,
            sa.Column("user_id", sa.Integer(), nullable=True),
        )
        op.create_foreign_key(
            f"fk_{table}_user_id_users",
            table,
            "users",
            ["user_id"],
            ["id"],
            ondelete="CASCADE",
        )
        op.create_index(
            f"ix_{table}_user_id",
            table,
            ["user_id"],
            unique=False,
        )


def downgrade() -> None:
    for table in TABLES:
        op.drop_index(f"ix_{table}_user_id", table_name=table)
        op.drop_constraint(
            f"fk_{table}_user_id_users",
            table,
            type_="foreignkey",
        )
        op.drop_column(table, "user_id")
