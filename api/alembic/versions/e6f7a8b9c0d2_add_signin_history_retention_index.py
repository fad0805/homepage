"""add sign-in history retention index

Revision ID: e6f7a8b9c0d2
Revises: c3d4e5f6a7b9
Create Date: 2026-11-16
"""

from typing import Sequence, Union

from alembic import op

revision: str = "e6f7a8b9c0d2"
down_revision: Union[str, Sequence[str], None] = "c3d4e5f6a7b9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index(
        "ix_user_signin_history_signin_time",
        "user_signin_history",
        ["signin_time"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_user_signin_history_signin_time",
        table_name="user_signin_history",
    )
