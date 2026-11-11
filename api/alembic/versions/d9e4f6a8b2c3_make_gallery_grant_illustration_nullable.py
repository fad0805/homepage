"""allow grants for chapters and books

Revision ID: d9e4f6a8b2c3
Revises: c8d3e5f7a9b1
Create Date: 2026-11-11 21:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "d9e4f6a8b2c3"
down_revision: Union[str, None] = "c8d3e5f7a9b1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # The first grant migration made illustration_id NOT NULL. A grant now
    # points at exactly one of illustration_id, chapter_id or book_id, so the
    # illustration column has to accept NULL for the other two kinds.
    op.alter_column(
        "gallery_session_grants",
        "illustration_id",
        existing_type=sa.Integer(),
        nullable=True,
    )


def downgrade() -> None:
    # Chapter and book grants cannot be represented without this column being
    # nullable, so drop them before restoring the old constraint.
    op.execute(
        "DELETE FROM gallery_session_grants "
        "WHERE illustration_id IS NULL"
    )
    op.alter_column(
        "gallery_session_grants",
        "illustration_id",
        existing_type=sa.Integer(),
        nullable=False,
    )
