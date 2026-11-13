"""add user ownership to books and chapters

Revision ID: b3c4d5e6f7a8
Revises: f2a3b4c5d6e7
Create Date: 2026-11-13 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "b3c4d5e6f7a8"
down_revision: Union[str, None] = "f2a3b4c5d6e7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Attach books and chapters to a user.

    The column stays nullable for now. Existing rows are mapped by a separate
    data migration; new rows always receive the signed-in user's id.
    """
    for table in ("books", "chapters"):
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


def downgrade() -> None:
    for table in ("chapters", "books"):
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
