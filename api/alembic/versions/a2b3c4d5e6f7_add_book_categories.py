"""add book categories

Revision ID: a2b3c4d5e6f7
Revises: e7b2d9c4f6a1
Create Date: 2026-11-08 23:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a2b3c4d5e6f7'
down_revision: Union[str, None] = 'e7b2d9c4f6a1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create book categories and link books to them."""
    op.create_table(
        'book_categories',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column(
            'order',
            sa.Integer(),
            nullable=False,
            server_default='0',
        ),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(
        op.f('ix_book_categories_id'),
        'book_categories',
        ['id'],
        unique=False,
    )

    op.add_column(
        'books',
        sa.Column('category_id', sa.Integer(), nullable=True),
    )
    op.create_index(
        op.f('ix_books_category_id'),
        'books',
        ['category_id'],
        unique=False,
    )
    op.create_foreign_key(
        'fk_books_category_id_book_categories',
        'books',
        'book_categories',
        ['category_id'],
        ['id'],
        ondelete='SET NULL',
    )


def downgrade() -> None:
    """Remove book categories."""
    op.drop_constraint(
        'fk_books_category_id_book_categories',
        'books',
        type_='foreignkey',
    )
    op.drop_index(op.f('ix_books_category_id'), table_name='books')
    op.drop_column('books', 'category_id')
    op.drop_index(
        op.f('ix_book_categories_id'),
        table_name='book_categories',
    )
    op.drop_table('book_categories')
