"""merge index page and appearance migration heads

Revision ID: e2f3a4b5c6d7
Revises: f8a9b0c1d2e3, a7b8c9d0e1f2
Create Date: 2026-11-16
"""

from typing import Sequence, Union

revision: str = "e2f3a4b5c6d7"
down_revision: Union[str, Sequence[str], None] = (
    "f8a9b0c1d2e3",
    "a7b8c9d0e1f2",
)
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
