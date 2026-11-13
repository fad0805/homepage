"""add notification profile names and deliveries

Revision ID: a3b4c5d6e7f8
Revises: f2b3c4d5e6f7
Create Date: 2026-11-13 21:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "a3b4c5d6e7f8"
down_revision: Union[str, None] = "f2b3c4d5e6f7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "mastodon_settings",
        sa.Column(
            "name",
            sa.String(length=100),
            nullable=False,
            server_default="알림 설정",
        ),
    )
    op.create_table(
        "notification_deliveries",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("settings_id", sa.Integer(), nullable=False),
        sa.Column("content_type", sa.String(length=20), nullable=False),
        sa.Column("content_id", sa.Integer(), nullable=False),
        sa.Column("status_id", sa.String(length=255), nullable=True),
        sa.Column(
            "posted_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(
            ["settings_id"],
            ["mastodon_settings.id"],
            name="fk_notification_deliveries_settings_id",
            ondelete="CASCADE",
        ),
        sa.UniqueConstraint(
            "settings_id",
            "content_type",
            "content_id",
            name="uq_notification_deliveries_target",
        ),
    )
    op.create_index(
        "ix_notification_deliveries_settings_id",
        "notification_deliveries",
        ["settings_id"],
    )
    op.create_index(
        "ix_notification_deliveries_content_type",
        "notification_deliveries",
        ["content_type"],
    )
    op.create_index(
        "ix_notification_deliveries_content_id",
        "notification_deliveries",
        ["content_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_notification_deliveries_content_id",
        table_name="notification_deliveries",
    )
    op.drop_index(
        "ix_notification_deliveries_content_type",
        table_name="notification_deliveries",
    )
    op.drop_index(
        "ix_notification_deliveries_settings_id",
        table_name="notification_deliveries",
    )
    op.drop_table("notification_deliveries")
    op.drop_column("mastodon_settings", "name")
