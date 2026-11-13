"""add owner to mastodon settings

Revision ID: f2b3c4d5e6f7
Revises: e1a2b3c4d5e6
Create Date: 2026-11-13 20:10:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "f2b3c4d5e6f7"
down_revision: Union[str, None] = "e1a2b3c4d5e6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "mastodon_settings",
        sa.Column("user_id", sa.Integer(), nullable=True),
    )
    op.execute(
        "UPDATE mastodon_settings SET user_id = 1 "
        "WHERE user_id IS NULL"
    )
    op.alter_column(
        "mastodon_settings",
        "user_id",
        existing_type=sa.Integer(),
        nullable=False,
    )
    op.create_foreign_key(
        "fk_mastodon_settings_user_id_users",
        "mastodon_settings",
        "users",
        ["user_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_index(
        "ix_mastodon_settings_user_id",
        "mastodon_settings",
        ["user_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_mastodon_settings_user_id",
        table_name="mastodon_settings",
    )
    op.drop_constraint(
        "fk_mastodon_settings_user_id_users",
        "mastodon_settings",
        type_="foreignkey",
    )
    op.drop_column("mastodon_settings", "user_id")
