"""add normalized tags

Revision ID: 1f2a3b4c5d6e
Revises: 0e1f2a3b4c5d
Create Date: 2026-11-17
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "1f2a3b4c5d6e"
down_revision: Union[str, Sequence[str], None] = "0e1f2a3b4c5d"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "tags",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column(
            "normalized_name",
            sa.String(length=255),
            nullable=False,
        ),
        sa.Column(
            "created_at",
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
        sa.UniqueConstraint(
            "user_id",
            "normalized_name",
            name="uq_tags_user_normalized",
        ),
    )
    op.create_index("ix_tags_user_id", "tags", ["user_id"])
    op.create_table(
        "chapter_tags",
        sa.Column("chapter_id", sa.Integer(), nullable=False),
        sa.Column("tag_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(
            ["chapter_id"],
            ["chapters.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["tag_id"],
            ["tags.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("chapter_id", "tag_id"),
    )
    op.create_table(
        "illustration_tags",
        sa.Column("illustration_id", sa.Integer(), nullable=False),
        sa.Column("tag_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(
            ["illustration_id"],
            ["illustrations.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["tag_id"],
            ["tags.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("illustration_id", "tag_id"),
    )

    op.execute(
        """
        INSERT INTO tags (user_id, name, normalized_name, created_at)
        SELECT user_id, MIN(name), lower(name), now()
        FROM (
            SELECT chapter.user_id AS user_id,
                   btrim(tag.value) AS name
            FROM chapters AS chapter
            CROSS JOIN LATERAL json_array_elements_text(
                chapter.tags
            ) AS tag(value)
            UNION ALL
            SELECT illustration.user_id AS user_id,
                   btrim(tag.value) AS name
            FROM illustrations AS illustration
            CROSS JOIN LATERAL json_array_elements_text(
                illustration.tags
            ) AS tag(value)
        ) AS source
        WHERE name <> ''
        GROUP BY user_id, lower(name)
        ON CONFLICT (user_id, normalized_name) DO NOTHING
        """
    )
    op.execute(
        """
        INSERT INTO chapter_tags (chapter_id, tag_id)
        SELECT chapter.id, tag.id
        FROM chapters AS chapter
        CROSS JOIN LATERAL json_array_elements_text(
            chapter.tags
        ) AS raw_tag(value)
        JOIN tags AS tag
          ON tag.user_id = chapter.user_id
         AND tag.normalized_name = lower(btrim(raw_tag.value))
        WHERE btrim(raw_tag.value) <> ''
        ON CONFLICT DO NOTHING
        """
    )
    op.execute(
        """
        INSERT INTO illustration_tags (illustration_id, tag_id)
        SELECT illustration.id, tag.id
        FROM illustrations AS illustration
        CROSS JOIN LATERAL json_array_elements_text(
            illustration.tags
        ) AS raw_tag(value)
        JOIN tags AS tag
          ON tag.user_id = illustration.user_id
         AND tag.normalized_name = lower(btrim(raw_tag.value))
        WHERE btrim(raw_tag.value) <> ''
        ON CONFLICT DO NOTHING
        """
    )


def downgrade() -> None:
    op.drop_table("illustration_tags")
    op.drop_table("chapter_tags")
    op.drop_index("ix_tags_user_id", table_name="tags")
    op.drop_table("tags")
