"""add period target counts to bookmark routines

Revision ID: 7c6b5a4f3e2d
Revises: 9f8e7d6c5b4a
Create Date: 2026-11-16
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "7c6b5a4f3e2d"
down_revision: Union[str, Sequence[str], None] = "9f8e7d6c5b4a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "bookmark_routines",
        sa.Column(
            "target_count",
            sa.Integer(),
            nullable=False,
            server_default="1",
        ),
    )
    op.execute(
        """
        UPDATE bookmark_routines
        SET target_count = CASE
            WHEN frequency = 'weekly'
                THEN GREATEST(
                    1,
                    COALESCE(json_array_length(weekdays), 1)
                )
            ELSE 1
        END
        """
    )
    op.add_column(
        "bookmark_routine_checks",
        sa.Column(
            "count",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
    )
    op.execute(
        """
        UPDATE bookmark_routine_checks
        SET count = CASE WHEN done THEN 1 ELSE 0 END
        """
    )

    # Weekly routines used to be checked on individual weekdays. Aggregate
    # those day checks into one weekly count before the weekday schedule is
    # retired.
    op.execute(
        """
        INSERT INTO bookmark_routine_checks (
            user_id,
            routine_id,
            period_type,
            period_start,
            done,
            count,
            completed_at,
            created_at,
            updated_at
        )
        SELECT
            check_row.user_id,
            check_row.routine_id,
            'week',
            (
                check_row.period_start -
                (
                    (EXTRACT(ISODOW FROM check_row.period_start)::int - 1)
                    || ' days'
                )::interval
            )::date,
            true,
            COUNT(*),
            MAX(check_row.completed_at),
            MIN(check_row.created_at),
            now()
        FROM bookmark_routine_checks AS check_row
        JOIN bookmark_routines AS routine
          ON routine.id = check_row.routine_id
        WHERE routine.frequency = 'weekly'
          AND check_row.period_type = 'day'
          AND check_row.done = true
        GROUP BY
            check_row.user_id,
            check_row.routine_id,
            (
                check_row.period_start -
                (
                    (EXTRACT(ISODOW FROM check_row.period_start)::int - 1)
                    || ' days'
                )::interval
            )::date
        ON CONFLICT (routine_id, period_type, period_start)
        DO UPDATE SET
            count = EXCLUDED.count,
            done = true,
            completed_at = EXCLUDED.completed_at,
            updated_at = now()
        """
    )
    op.execute(
        """
        DELETE FROM bookmark_routine_checks AS check_row
        USING bookmark_routines AS routine
        WHERE check_row.routine_id = routine.id
          AND routine.frequency = 'weekly'
          AND check_row.period_type = 'day'
        """
    )


def downgrade() -> None:
    op.execute(
        """
        INSERT INTO bookmark_routine_checks (
            user_id,
            routine_id,
            period_type,
            period_start,
            done,
            completed_at,
            created_at,
            updated_at
        )
        SELECT
            check_row.user_id,
            check_row.routine_id,
            'day',
            (
                check_row.period_start +
                (series.day_offset || ' days')::interval
            )::date,
            true,
            check_row.completed_at,
            check_row.created_at,
            check_row.updated_at
        FROM bookmark_routine_checks AS check_row
        JOIN bookmark_routines AS routine
          ON routine.id = check_row.routine_id
        CROSS JOIN LATERAL generate_series(
            0,
            GREATEST(check_row.count, 0) - 1
        ) AS series(day_offset)
        WHERE routine.frequency = 'weekly'
          AND check_row.period_type = 'week'
          AND check_row.count > 0
        ON CONFLICT (routine_id, period_type, period_start)
        DO NOTHING
        """
    )
    op.execute(
        """
        DELETE FROM bookmark_routine_checks AS check_row
        USING bookmark_routines AS routine
        WHERE check_row.routine_id = routine.id
          AND routine.frequency = 'weekly'
          AND check_row.period_type = 'week'
        """
    )
    op.drop_column("bookmark_routine_checks", "count")
    op.drop_column("bookmark_routines", "target_count")
