"""rename books to chapters

Revision ID: d1f4a6b8c2e3
Revises: c9e3f5a7b2d1
Create Date: 2026-11-08 19:10:00.000000

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'd1f4a6b8c2e3'
down_revision: Union[str, None] = 'c9e3f5a7b2d1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Rename the old bookshelf/book tables to book/chapter."""
    op.rename_table('books', 'chapters')
    op.execute("ALTER INDEX ix_books_id RENAME TO ix_chapters_id")
    op.execute(
        "ALTER INDEX ix_books_bookshelf_id RENAME TO ix_chapters_book_id"
    )
    op.execute(
        "ALTER TABLE chapters RENAME CONSTRAINT books_pkey TO chapters_pkey"
    )
    op.execute(
        "ALTER TABLE chapters RENAME CONSTRAINT "
        "books_bookshelf_id_fkey TO chapters_book_id_fkey"
    )

    op.rename_table('bookshelves', 'books')
    op.execute("ALTER INDEX ix_bookshelves_id RENAME TO ix_books_id")
    op.execute(
        "ALTER TABLE books RENAME CONSTRAINT bookshelves_pkey TO books_pkey"
    )

    op.alter_column('chapters', 'bookshelf_id', new_column_name='book_id')


def downgrade() -> None:
    """Restore the old bookshelf/book table names."""
    op.alter_column('chapters', 'book_id', new_column_name='bookshelf_id')

    op.rename_table('books', 'bookshelves')
    op.execute("ALTER INDEX ix_books_id RENAME TO ix_bookshelves_id")
    op.execute(
        "ALTER TABLE bookshelves RENAME CONSTRAINT "
        "books_pkey TO bookshelves_pkey"
    )

    op.rename_table('chapters', 'books')
    op.execute("ALTER INDEX ix_chapters_id RENAME TO ix_books_id")
    op.execute(
        "ALTER INDEX ix_chapters_book_id RENAME TO ix_books_bookshelf_id"
    )
    op.execute(
        "ALTER TABLE books RENAME CONSTRAINT chapters_pkey TO books_pkey"
    )
    op.execute(
        "ALTER TABLE books RENAME CONSTRAINT "
        "chapters_book_id_fkey TO books_bookshelf_id_fkey"
    )
