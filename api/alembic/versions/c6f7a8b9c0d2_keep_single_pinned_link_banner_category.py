"""keep one pinned special link category

Revision ID: c6f7a8b9c0d2
Revises: b5c6d7e8f9a0
Create Date: 2026-11-22 12:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "c6f7a8b9c0d2"
down_revision: Union[str, None] = "b5c6d7e8f9a0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Keep only the first special category per author, then pin it at the top.
    op.execute(
        """
        UPDATE "links-categories"
        SET is_special = 0
        WHERE is_special = 1
          AND EXISTS (
            SELECT 1
            FROM "links-categories" AS other
            WHERE other.user_id = "links-categories".user_id
              AND other.is_special = 1
              AND (
                other."order" < "links-categories"."order"
                OR (
                  other."order" = "links-categories"."order"
                  AND other.id < "links-categories".id
                )
              )
          )
        """
    )
    op.execute(
        """UPDATE "links-categories" SET "order" = 0 WHERE is_special = 1"""
    )
    op.create_index(
        "ux_links_categories_one_special_per_user",
        "links-categories",
        ["user_id"],
        unique=True,
        postgresql_where=sa.text("is_special = true"),
        sqlite_where=sa.text("is_special = 1"),
    )


def downgrade() -> None:
    op.drop_index(
        "ux_links_categories_one_special_per_user",
        table_name="links-categories",
    )
