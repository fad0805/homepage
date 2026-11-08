"""add books tables

Revision ID: c9e3f5a7b2d1
Revises: b8d2e4f6a1c3
Create Date: 2026-11-08 18:10:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c9e3f5a7b2d1'
down_revision: Union[str, None] = 'b8d2e4f6a1c3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create bookshelves and books tables."""
    op.create_table(
        'bookshelves',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('title', sa.String(), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('order', sa.Integer(), nullable=False),
        sa.Column('visible', sa.Boolean(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(
        op.f('ix_bookshelves_id'), 'bookshelves', ['id'], unique=False
    )

    op.create_table(
        'books',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('bookshelf_id', sa.Integer(), nullable=False),
        sa.Column('title', sa.String(), nullable=False),
        sa.Column('subtitle', sa.String(), nullable=True),
        sa.Column('body', sa.Text(), nullable=True),
        sa.Column('order', sa.Integer(), nullable=False),
        sa.Column('visible', sa.Boolean(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(
            ['bookshelf_id'], ['bookshelves.id'], ondelete='CASCADE'
        ),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(
        op.f('ix_books_id'), 'books', ['id'], unique=False
    )
    op.create_index(
        op.f('ix_books_bookshelf_id'),
        'books',
        ['bookshelf_id'],
        unique=False,
    )


def downgrade() -> None:
    """Drop books tables."""
    op.drop_index(op.f('ix_books_bookshelf_id'), table_name='books')
    op.drop_index(op.f('ix_books_id'), table_name='books')
    op.drop_table('books')
    op.drop_index(op.f('ix_bookshelves_id'), table_name='bookshelves')
    op.drop_table('bookshelves')
