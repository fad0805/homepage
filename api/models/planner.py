from sqlalchemy import (
    JSON,
    Boolean,
    Column,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import relationship

from db.base import Base


class PlannerTask(Base):
    """A private calendar task owned by exactly one account."""

    __tablename__ = "planner_tasks"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    title = Column(String(255), nullable=False)
    notes = Column(Text, nullable=True)
    color_id = Column(
        Integer,
        ForeignKey("planner_colors.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    schedule_type = Column(
        String(16),
        nullable=False,
        default="single",
        server_default="single",
    )
    # ``start_date`` is the first date the task may appear on the calendar.
    # ``deadline_base_date`` is the date used for a single-date task's
    # deadline. It differs from start_date when a task is registered after
    # noon KST: it appears today but its deadline starts tomorrow.
    start_date = Column(Date, nullable=True, index=True)
    deadline_base_date = Column(Date, nullable=True)
    end_date = Column(Date, nullable=True, index=True)
    deadline_days = Column(Integer, nullable=True)
    status = Column(
        String(16),
        nullable=False,
        default="active",
        server_default="active",
        index=True,
    )
    pinned = Column(
        Boolean,
        nullable=False,
        default=False,
        server_default="false",
    )
    created_at = Column(DateTime, default=func.now(), nullable=False)
    updated_at = Column(
        DateTime,
        default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
    inactive_at = Column(DateTime, nullable=True)
    trashed_at = Column(DateTime, nullable=True)

    user = relationship("User")
    color_relation = relationship("PlannerColor")

    __table_args__ = (
        Index(
            "ix_planner_tasks_user_status_dates",
            "user_id",
            "status",
            "start_date",
            "end_date",
        ),
    )


class PlannerColor(Base):
    """A saved task color used as one private color category."""

    __tablename__ = "planner_colors"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    color = Column(String(7), nullable=False)
    name = Column(String(80), nullable=True)
    position = Column(
        Integer,
        nullable=False,
        default=0,
        server_default="0",
    )
    created_at = Column(DateTime, default=func.now(), nullable=False)

    user = relationship("User")

    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "color",
            name="uq_planner_colors_user_color",
        ),
        Index(
            "ix_planner_colors_user_position",
            "user_id",
            "position",
        ),
    )


class PlannerEvent(Base):
    """A history entry shown on the owner's calendar.

    Only changed details are stored. Content deletions are metadata-only.
    Task completions keep the title, notes, and completion time so the user
    can recreate the task without restoring its original schedule.
    """

    __tablename__ = "planner_events"

    id = Column(Integer, primary_key=True, autoincrement=True)
    owner_user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    actor_user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    entity_type = Column(String(32), nullable=False, index=True)
    entity_id = Column(Integer, nullable=True, index=True)
    action = Column(String(16), nullable=False)
    title = Column(String(255), nullable=True)
    notes = Column(Text, nullable=True)
    changes = Column(JSON, nullable=True)
    occurred_at = Column(DateTime, default=func.now(), nullable=False)

    owner = relationship("User", foreign_keys=[owner_user_id])
    actor = relationship("User", foreign_keys=[actor_user_id])

    __table_args__ = (
        Index(
            "ix_planner_events_owner_occurred",
            "owner_user_id",
            "occurred_at",
        ),
    )
