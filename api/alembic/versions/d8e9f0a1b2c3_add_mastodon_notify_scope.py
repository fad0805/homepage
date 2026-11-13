"""add mastodon notification scope

Revision ID: d8e9f0a1b2c3
Revises: c7d8e9f0a1b2
Create Date: 2026-11-13 19:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "d8e9f0a1b2c3"
down_revision: Union[str, None] = "c7d8e9f0a1b2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "mastodon_settings",
        sa.Column(
            "notify_scope",
            sa.String(length=20),
            nullable=False,
            server_default="all",
        ),
    )
    op.add_column(
        "mastodon_settings",
        sa.Column("notify_book_id", sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        "fk_mastodon_settings_notify_book_id_books",
        "mastodon_settings",
        "books",
        ["notify_book_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_mastodon_settings_notify_book_id",
        "mastodon_settings",
        ["notify_book_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_mastodon_settings_notify_book_id",
        table_name="mastodon_settings",
    )
    op.drop_constraint(
        "fk_mastodon_settings_notify_book_id_books",
        "mastodon_settings",
        type_="foreignkey",
    )
    op.drop_column("mastodon_settings", "notify_book_id")
    op.drop_column("mastodon_settings", "notify_scope")
