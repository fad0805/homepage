"""add bookmark routine lifespan index

Revision ID: 69acf662a76c
Revises: c1d2e3f4a5b6
Create Date: 2026-11-18
"""

from collections.abc import Sequence

from alembic import op

revision: str = "69acf662a76c"
down_revision: str | Sequence[str] | None = "c1d2e3f4a5b6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_index(
        "ix_bookmark_routines_user_frequency_lifespan",
        "bookmark_routines",
        ["user_id", "frequency", "start_date", "end_date"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_bookmark_routines_user_frequency_lifespan",
        table_name="bookmark_routines",
    )
