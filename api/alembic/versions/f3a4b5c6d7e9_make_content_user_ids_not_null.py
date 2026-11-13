"""make content author foreign keys required

Revision ID: f3a4b5c6d7e9
Revises: c2d3e4f5a6b7
Create Date: 2026-11-13 15:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "f3a4b5c6d7e9"
down_revision: Union[str, None] = "c2d3e4f5a6b7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


TABLES = ("books", "chapters", "illustrations", "memos")


def upgrade() -> None:
    """Require an author and delete owned content with its user.

    The data backfill that assigns existing rows to the single production
    user must run first. Abort with a clear message if any row is still
    unowned instead of failing halfway through the DDL.
    """
    bind = op.get_bind()
    for table in TABLES:
        nulls = bind.execute(
            sa.text(f"SELECT count(*) FROM {table} WHERE user_id IS NULL")
        ).scalar_one()
        if nulls:
            raise RuntimeError(
                f"{table}에 user_id가 NULL인 행이 {nulls}개 있습니다. "
                "데이터 백필을 먼저 실행해주세요."
            )

    for table in TABLES:
        op.drop_constraint(
            f"fk_{table}_user_id",
            table,
            type_="foreignkey",
        )
        op.alter_column(
            table,
            "user_id",
            existing_type=sa.Integer(),
            nullable=False,
        )
        op.create_foreign_key(
            f"fk_{table}_user_id",
            table,
            "users",
            ["user_id"],
            ["id"],
            ondelete="CASCADE",
        )


def downgrade() -> None:
    for table in TABLES:
        op.drop_constraint(
            f"fk_{table}_user_id",
            table,
            type_="foreignkey",
        )
        op.alter_column(
            table,
            "user_id",
            existing_type=sa.Integer(),
            nullable=True,
        )
        op.create_foreign_key(
            f"fk_{table}_user_id",
            table,
            "users",
            ["user_id"],
            ["id"],
            ondelete="SET NULL",
        )
