"""add per-author ownership to category tables

Revision ID: c5d6e7f8a9b0
Revises: b4c5d6e7f8a9
Create Date: 2026-11-13 23:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "c5d6e7f8a9b0"
down_revision: Union[str, None] = "b4c5d6e7f8a9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


TABLES = ("book_categories", "links-categories", "locations")


def upgrade() -> None:
    for table in TABLES:
        op.add_column(
            table,
            sa.Column("user_id", sa.Integer(), nullable=True),
        )
        op.create_index(
            f"ix_{table.replace('-', '_')}_user_id",
            table,
            ["user_id"],
        )
        op.create_foreign_key(
            f"fk_{table.replace('-', '_')}_user_id",
            table,
            "users",
            ["user_id"],
            ["id"],
            ondelete="CASCADE",
        )

    # Existing categories belong to the author of their content.
    op.execute(
        """
        UPDATE book_categories AS bc
        SET user_id = (
            SELECT b.user_id
            FROM books AS b
            WHERE b.category_id = bc.id
            ORDER BY b.id
            LIMIT 1
        )
        WHERE bc.user_id IS NULL
        """
    )
    op.execute(
        """
        UPDATE "links-categories" AS lc
        SET user_id = (
            SELECT l.user_id
            FROM links AS l
            WHERE l.category = lc.id
            ORDER BY l.id
            LIMIT 1
        )
        WHERE lc.user_id IS NULL
        """
    )
    op.execute(
        """
        UPDATE locations AS loc
        SET user_id = (
            SELECT c.user_id
            FROM characters AS c
            WHERE c.location_id = loc.id
            ORDER BY c.id
            LIMIT 1
        )
        WHERE loc.user_id IS NULL
        """
    )

    # Orphaned categories fall back to the oldest account.
    for table in TABLES:
        op.execute(
            f"""
            UPDATE "{table}"
            SET user_id = (
                SELECT id FROM users
                ORDER BY created_at ASC NULLS LAST, id ASC
                LIMIT 1
            )
            WHERE user_id IS NULL
            """
        )

    bind = op.get_bind()
    for table in TABLES:
        nulls = bind.execute(
            sa.text(
                f'SELECT count(*) FROM "{table}" WHERE user_id IS NULL'
            )
        ).scalar_one()
        if nulls:
            raise RuntimeError(
                f"{table}에 user_id가 NULL인 행이 남아 있습니다. "
                "사용자 계정을 먼저 확인해주세요."
            )
        op.alter_column(
            table,
            "user_id",
            existing_type=sa.Integer(),
            nullable=False,
        )


def downgrade() -> None:
    for table in TABLES:
        op.drop_constraint(
            f"fk_{table.replace('-', '_')}_user_id",
            table,
            type_="foreignkey",
        )
        op.drop_index(
            f"ix_{table.replace('-', '_')}_user_id",
            table_name=table,
        )
        op.drop_column(table, "user_id")
