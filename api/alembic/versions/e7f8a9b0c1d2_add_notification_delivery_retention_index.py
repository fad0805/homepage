"""add notification delivery retention index

Revision ID: e7f8a9b0c1d2
Revises: e6f7a8b9c0d2
Create Date: 2026-11-16
"""

from typing import Sequence, Union

from alembic import op

revision: str = "e7f8a9b0c1d2"
down_revision: Union[str, Sequence[str], None] = "e6f7a8b9c0d2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # The settings/posted index was unused; retention deletes by posted_at.
    op.drop_index(
        "ix_notification_deliveries_settings_posted",
        table_name="notification_deliveries",
    )
    op.create_index(
        "ix_notification_deliveries_posted_at",
        "notification_deliveries",
        ["posted_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_notification_deliveries_posted_at",
        table_name="notification_deliveries",
    )
    op.create_index(
        "ix_notification_deliveries_settings_posted",
        "notification_deliveries",
        ["settings_id", "posted_at"],
        unique=False,
    )
