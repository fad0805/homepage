"""add author and integrated index pages

Revision ID: f8a9b0c1d2e3
Revises: e7f8a9b0c1d2
Create Date: 2026-11-15 23:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "f8a9b0c1d2e3"
down_revision: Union[str, None] = "e7f8a9b0c1d2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


CURRENT_INDEX_HTML = (
    "<p>Missing Island · Story Archive</p>"
    "<h2>당신은 어떤<br><em>이야기</em>를<br>가지고 있나요?</h2>"
    "<p>어서오세요.<br>이 곳은 어디에나 있지만, 어디에도 없는 섬.</p>"
)


def upgrade() -> None:
    op.create_table(
        "index_pages",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("scope", sa.String(length=16), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column(
            "content_html",
            sa.Text(),
            server_default="",
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_index_pages_id",
        "index_pages",
        ["id"],
        unique=False,
    )
    op.create_index(
        "ix_index_pages_scope",
        "index_pages",
        ["scope"],
        unique=False,
    )
    op.create_index(
        "ix_index_pages_user_id",
        "index_pages",
        ["user_id"],
        unique=False,
    )
    op.create_index(
        "ux_index_pages_integrated",
        "index_pages",
        ["scope"],
        unique=True,
        postgresql_where=sa.text("scope = 'integrated'"),
    )
    op.create_index(
        "ux_index_pages_author",
        "index_pages",
        ["user_id"],
        unique=True,
        postgresql_where=sa.text("scope = 'author'"),
    )

    # The static index that existed before this migration becomes the
    # integrated page. A single-user installation also gets a personal copy
    # so its author page starts with the same content.
    seed = sa.text(
        "INSERT INTO index_pages (scope, user_id, content_html) "
        "VALUES (:scope, :user_id, :content_html)"
    ).bindparams(
        content_html=CURRENT_INDEX_HTML,
    )
    op.execute(
        seed.bindparams(
            scope="integrated",
            user_id=None,
        )
    )
    op.execute(
        sa.text(
            "INSERT INTO index_pages (scope, user_id, content_html) "
            "SELECT 'author', id, :content_html FROM users "
            "WHERE (SELECT count(*) FROM users) = 1"
        ).bindparams(content_html=CURRENT_INDEX_HTML)
    )


def downgrade() -> None:
    op.drop_index("ux_index_pages_author", table_name="index_pages")
    op.drop_index("ux_index_pages_integrated", table_name="index_pages")
    op.drop_index("ix_index_pages_user_id", table_name="index_pages")
    op.drop_index("ix_index_pages_scope", table_name="index_pages")
    op.drop_index("ix_index_pages_id", table_name="index_pages")
    op.drop_table("index_pages")
