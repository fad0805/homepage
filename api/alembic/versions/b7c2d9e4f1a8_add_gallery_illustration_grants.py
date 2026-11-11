"""add per-illustration gallery grants

Revision ID: b7c2d9e4f1a8
Revises: a9b8c7d6e5f4
Create Date: 2026-11-11 17:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "b7c2d9e4f1a8"
down_revision: Union[str, None] = "a9b8c7d6e5f4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "gallery_invites",
        sa.Column("illustration_id", sa.Integer(), nullable=True),
    )
    op.create_index(
        "ix_gallery_invites_illustration_id",
        "gallery_invites",
        ["illustration_id"],
    )
    op.create_foreign_key(
        "fk_gallery_invites_illustration_id",
        "gallery_invites",
        "illustrations",
        ["illustration_id"],
        ["id"],
        ondelete="CASCADE",
    )

    op.create_table(
        "gallery_session_grants",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("session_id", sa.Integer(), nullable=False),
        sa.Column("illustration_id", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(
            ["session_id"],
            ["gallery_sessions.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["illustration_id"],
            ["illustrations.id"],
            ondelete="CASCADE",
        ),
        sa.UniqueConstraint(
            "session_id",
            "illustration_id",
            name="uq_gallery_session_grant",
        ),
    )
    op.create_index(
        "ix_gallery_session_grants_session_id",
        "gallery_session_grants",
        ["session_id"],
    )
    op.create_index(
        "ix_gallery_session_grants_illustration_id",
        "gallery_session_grants",
        ["illustration_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_gallery_session_grants_illustration_id",
        table_name="gallery_session_grants",
    )
    op.drop_index(
        "ix_gallery_session_grants_session_id",
        table_name="gallery_session_grants",
    )
    op.drop_table("gallery_session_grants")

    op.drop_constraint(
        "fk_gallery_invites_illustration_id",
        "gallery_invites",
        type_="foreignkey",
    )
    op.drop_index(
        "ix_gallery_invites_illustration_id",
        table_name="gallery_invites",
    )
    op.drop_column("gallery_invites", "illustration_id")
