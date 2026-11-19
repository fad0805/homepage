"""decouple manuscript nodes from published chapters

Revision ID: b3f1c9d7e5a2
Revises: c8e1a7b4d2f9
Create Date: 2026-11-19
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "b3f1c9d7e5a2"
down_revision: str | Sequence[str] | None = "c8e1a7b4d2f9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())

    for foreign_key in inspector.get_foreign_keys("manuscript_nodes"):
        if foreign_key.get("constrained_columns") == ["published_chapter_id"]:
            op.drop_constraint(
                foreign_key["name"], "manuscript_nodes", type_="foreignkey"
            )

    for constraint in inspector.get_unique_constraints("manuscript_nodes"):
        if constraint.get("column_names") == ["published_chapter_id"]:
            op.drop_constraint(
                constraint["name"], "manuscript_nodes", type_="unique"
            )


def downgrade() -> None:
    op.create_foreign_key(
        "manuscript_nodes_published_chapter_id_fkey",
        "manuscript_nodes",
        "chapters",
        ["published_chapter_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_unique_constraint(
        "uq_manuscript_nodes_published_chapter",
        "manuscript_nodes",
        ["published_chapter_id"],
    )
