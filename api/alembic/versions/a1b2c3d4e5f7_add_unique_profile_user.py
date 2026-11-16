"""make author profiles one per user

Revision ID: a1b2c3d4e5f7
Revises: d3e4f5a6b7c8
Create Date: 2026-11-16
"""

from typing import Sequence, Union

from alembic import op

revision: str = "a1b2c3d4e5f7"
down_revision: Union[str, Sequence[str], None] = "d3e4f5a6b7c8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Keep the most recently created profile for each author. Profile changes
    # are recorded in planner history; the profile table itself stays single-row.
    op.execute(
        """
        DELETE FROM profiles profile
        USING profiles newer
        WHERE profile.user_id = newer.user_id
          AND profile.id < newer.id
        """
    )
    op.create_unique_constraint(
        "uq_profiles_user_id",
        "profiles",
        ["user_id"],
    )


def downgrade() -> None:
    op.drop_constraint(
        "uq_profiles_user_id",
        "profiles",
        type_="unique",
    )
