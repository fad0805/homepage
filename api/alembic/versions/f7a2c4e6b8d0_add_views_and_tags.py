"""add chapter views and tags

Revision ID: f7a2c4e6b8d0
Revises: e2a7c9d1f3b4
Create Date: 2026-11-08 21:20:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f7a2c4e6b8d0'
down_revision: Union[str, None] = 'e2a7c9d1f3b4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add tags to books/chapters and chapter view tracking."""
    op.add_column(
        'books',
        sa.Column(
            'tags',
            sa.JSON(),
            nullable=False,
            server_default=sa.text("'[]'::json"),
        ),
    )
    op.add_column(
        'chapters',
        sa.Column(
            'tags',
            sa.JSON(),
            nullable=False,
            server_default=sa.text("'[]'::json"),
        ),
    )
    op.add_column(
        'chapters',
        sa.Column(
            'view_count',
            sa.Integer(),
            nullable=False,
            server_default='0',
        ),
    )

    op.create_table(
        'chapter_views',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('chapter_id', sa.Integer(), nullable=False),
        sa.Column('ip_hash', sa.String(length=64), nullable=False),
        sa.Column('last_viewed_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ['chapter_id'], ['chapters.id'], ondelete='CASCADE'
        ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint(
            'chapter_id',
            'ip_hash',
            name='uq_chapter_views_chapter_ip',
        ),
    )
    op.create_index(
        op.f('ix_chapter_views_id'),
        'chapter_views',
        ['id'],
        unique=False,
    )
    op.create_index(
        op.f('ix_chapter_views_chapter_id'),
        'chapter_views',
        ['chapter_id'],
        unique=False,
    )


def downgrade() -> None:
    """Remove view tracking and tags."""
    op.drop_index(
        op.f('ix_chapter_views_chapter_id'), table_name='chapter_views'
    )
    op.drop_index(op.f('ix_chapter_views_id'), table_name='chapter_views')
    op.drop_table('chapter_views')
    op.drop_column('chapters', 'view_count')
    op.drop_column('chapters', 'tags')
    op.drop_column('books', 'tags')
