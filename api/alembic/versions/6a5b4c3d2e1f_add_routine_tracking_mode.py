"""add routine tracking mode

Revision ID: 6a5b4c3d2e1f
Revises: 7c6b5a4f3e2d
Create Date: 2026-11-16
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "6a5b4c3d2e1f"
down_revision: Union[str, Sequence[str], None] = "7c6b5a4f3e2d"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "bookmark_routines",
        sa.Column(
            "tracking_mode",
            sa.String(length=10),
            nullable=False,
            server_default="count",
        ),
    )
    op.execute(
        """
        UPDATE bookmark_routines
        SET tracking_mode = 'date'
        WHERE frequency IN ('weekly', 'monthly', 'yearly')
          AND (
              (frequency = 'weekly' AND weekdays IS NOT NULL)
              OR (
                  frequency = 'monthly'
                  AND (
                      day_of_month IS NOT NULL
                      OR (nth_week IS NOT NULL AND weekday IS NOT NULL)
                  )
              )
              OR (
                  frequency = 'yearly'
                  AND month IS NOT NULL
                  AND day_of_month IS NOT NULL
              )
          )
        """
    )

    # Date-mode weekly routines now check individual days. Restore their
    # current weekly counts from the old weekday checks so that switching
    # modes does not erase the current week.
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
            'day',
            (
                check_row.period_start +
                (selected.value::int || ' days')::interval
            )::date,
            true,
            1,
            check_row.completed_at,
            check_row.created_at,
            check_row.updated_at
        FROM bookmark_routine_checks AS check_row
        JOIN bookmark_routines AS routine
          ON routine.id = check_row.routine_id
        CROSS JOIN LATERAL (
            SELECT value
            FROM json_array_elements_text(routine.weekdays)
            ORDER BY value::int
            LIMIT LEAST(
                GREATEST(check_row.count, 0),
                json_array_length(routine.weekdays)
            )
        ) AS selected(value)
        WHERE routine.frequency = 'weekly'
          AND routine.tracking_mode = 'date'
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
          AND routine.tracking_mode = 'date'
          AND check_row.period_type = 'week'
        """
    )


def downgrade() -> None:
    # The previous version records weekly routines as weekly counts.
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
          AND routine.tracking_mode = 'date'
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
          AND routine.tracking_mode = 'date'
          AND check_row.period_type = 'day'
        """
    )
    op.drop_column("bookmark_routines", "tracking_mode")
