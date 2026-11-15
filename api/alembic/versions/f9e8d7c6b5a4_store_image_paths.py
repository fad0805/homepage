"""store object paths instead of full image URLs

Revision ID: f9e8d7c6b5a4
Revises: a1c2e3f4b5d6
Create Date: 2026-11-16 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

from core.image_urls import public_url, storage_reference


revision: str = "f9e8d7c6b5a4"
down_revision: Union[str, None] = "a1c2e3f4b5d6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# Image reference columns owned by the application. Link.url is excluded
# because it can point anywhere; only the uploaded banner is ours.
IMAGE_COLUMNS: tuple[tuple[str, str], ...] = (
    ("characters", "thumbnail"),
    ("characters", "detail_image"),
    ("links", "banner_url"),
    ("profiles", "banner_url"),
    ("illustrations", "representative_url"),
    ("illustration_images", "url"),
)


def _rewrite(convert) -> None:
    bind = op.get_bind()
    for table_name, column_name in IMAGE_COLUMNS:
        table = sa.table(
            table_name,
            sa.column("id", sa.Integer),
            sa.column(column_name, sa.String()),
        )
        rows = bind.execute(
            sa.select(table.c.id, table.c[column_name])
        ).all()
        for row_id, value in rows:
            converted = convert(value)
            if converted != value:
                bind.execute(
                    table.update()
                    .where(table.c.id == row_id)
                    .values({column_name: converted})
                )


def upgrade() -> None:
    """Replace full object-storage URLs with their object paths."""
    _rewrite(storage_reference)


def downgrade() -> None:
    """Expand stored object paths back into public URLs."""
    _rewrite(public_url)
