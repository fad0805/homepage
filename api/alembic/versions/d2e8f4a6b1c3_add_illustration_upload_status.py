"""add illustration upload status

Revision ID: d2e8f4a6b1c3
Revises: c6f7a8b9c0d2
Create Date: 2026-11-22
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "d2e8f4a6b1c3"
down_revision: str | Sequence[str] | None = "c6f7a8b9c0d2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "illustrations",
        sa.Column(
            "upload_status",
            sa.String(length=16),
            server_default="ready",
            nullable=False,
        ),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("illustrations", "upload_status")
