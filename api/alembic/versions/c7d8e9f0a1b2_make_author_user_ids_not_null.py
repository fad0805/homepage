"""make author user ids not null

Revision ID: c7d8e9f0a1b2
Revises: b6c7d8e9f0a1
Create Date: 2026-11-13 18:10:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "c7d8e9f0a1b2"
down_revision: Union[str, None] = "b6c7d8e9f0a1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


TABLES = ("characters", "profiles", "links")


def upgrade() -> None:
    connection = op.get_bind()
    for table in TABLES:
        count = connection.execute(
            sa.text(
                f"SELECT COUNT(*) FROM {table} WHERE user_id IS NULL"
            )
        ).scalar_one()
        if count:
            raise RuntimeError(
                f"{table}에 user_id가 NULL인 행이 {count}개 있습니다. "
                "데이터 백필을 먼저 실행해주세요."
            )

    for table in TABLES:
        op.alter_column(
            table,
            "user_id",
            existing_type=sa.Integer(),
            nullable=False,
        )


def downgrade() -> None:
    for table in TABLES:
        op.alter_column(
            table,
            "user_id",
            existing_type=sa.Integer(),
            nullable=True,
        )
