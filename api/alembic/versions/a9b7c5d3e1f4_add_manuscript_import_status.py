"""add manuscript import status

Revision ID: a9b7c5d3e1f4
Revises: f2b3c4d5e6f8
Create Date: 2026-11-19
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "a9b7c5d3e1f4"
down_revision: str | Sequence[str] | None = "f2b3c4d5e6f8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "manuscript_projects",
        sa.Column("import_status", sa.String(length=16), nullable=True),
    )
    op.add_column(
        "manuscript_projects",
        sa.Column("import_error", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("manuscript_projects", "import_error")
    op.drop_column("manuscript_projects", "import_status")
