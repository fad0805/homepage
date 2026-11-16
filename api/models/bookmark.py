from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
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


class BookmarkRoutine(Base):
    """A recurring routine managed by one user."""

    __tablename__ = "bookmark_routines"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    title = Column(String(255), nullable=False)
    notes = Column(Text, nullable=True)
    frequency = Column(String(10), nullable=False)
    tracking_mode = Column(
        String(10),
        nullable=False,
        default="count",
        server_default="count",
    )
    target_count = Column(
        Integer,
        nullable=False,
        default=1,
        server_default="1",
    )
    # Legacy schedule columns kept for existing data.
    # 0 = Monday ... 6 = Sunday.
    weekday = Column(Integer, nullable=True)
    weekdays = Column(JSON, nullable=True, default=list)
    day_of_month = Column(Integer, nullable=True)
    nth_week = Column(Integer, nullable=True)
    month = Column(Integer, nullable=True)
    active = Column(
        Boolean,
        nullable=False,
        default=True,
        server_default="true",
    )
    position = Column(
        Integer,
        nullable=False,
        default=0,
        server_default="0",
    )
    created_at = Column(DateTime, default=func.now(), nullable=False)
    updated_at = Column(
        DateTime,
        default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    user = relationship("User")
    checks = relationship(
        "BookmarkRoutineCheck",
        back_populates="routine",
        cascade="all, delete-orphan",
    )


class BookmarkRoutineCheck(Base):
    """Completion state for one routine in one day/week/month/year."""

    __tablename__ = "bookmark_routine_checks"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    routine_id = Column(
        Integer,
        ForeignKey("bookmark_routines.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    period_type = Column(String(10), nullable=False)
    period_start = Column(Date, nullable=False)
    done = Column(
        Boolean,
        nullable=False,
        default=False,
        server_default="false",
    )
    count = Column(
        Integer,
        nullable=False,
        default=0,
        server_default="0",
    )
    completed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=func.now(), nullable=False)
    updated_at = Column(
        DateTime,
        default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    routine = relationship("BookmarkRoutine", back_populates="checks")

    __table_args__ = (
        UniqueConstraint(
            "routine_id",
            "period_type",
            "period_start",
            name="uq_bookmark_routine_checks_period",
        ),
        Index(
            "ix_bookmark_routine_checks_user_period",
            "user_id",
            "period_type",
            "period_start",
        ),
    )


class BookmarkRoutineMonthlyStat(Base):
    """Persistent monthly aggregate for one routine."""

    __tablename__ = "bookmark_routine_monthly_stats"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    routine_id = Column(
        Integer,
        ForeignKey("bookmark_routines.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    routine_title = Column(String(255), nullable=False)
    frequency = Column(String(10), nullable=False)
    month_start = Column(Date, nullable=False)
    completed_count = Column(
        Integer,
        nullable=False,
        default=0,
        server_default="0",
    )
    expected_count = Column(
        Integer,
        nullable=False,
        default=0,
        server_default="0",
    )
    created_at = Column(DateTime, default=func.now(), nullable=False)
    updated_at = Column(
        DateTime,
        default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    user = relationship("User")
    routine = relationship("BookmarkRoutine")

    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "routine_id",
            "month_start",
            name="uq_bookmark_routine_monthly_stats_period",
        ),
        Index(
            "ix_bookmark_routine_monthly_stats_user_month",
            "user_id",
            "month_start",
        ),
    )


class BookmarkGoal(Base):
    """One goal text attached to a user's period."""

    __tablename__ = "bookmark_goals"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    period_type = Column(String(10), nullable=False)
    period_start = Column(Date, nullable=False)
    content = Column(Text, nullable=False, default="", server_default="")
    created_at = Column(DateTime, default=func.now(), nullable=False)
    updated_at = Column(
        DateTime,
        default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    user = relationship("User")

    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "period_type",
            "period_start",
            name="uq_bookmark_goals_user_period",
        ),
    )


class BookmarkReview(Base):
    """One review text for a user's year/month/week/day."""

    __tablename__ = "bookmark_reviews"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    period_type = Column(String(10), nullable=False)
    period_start = Column(Date, nullable=False)
    content = Column(Text, nullable=False, default="", server_default="")
    created_at = Column(DateTime, default=func.now(), nullable=False)
    updated_at = Column(
        DateTime,
        default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    user = relationship("User")

    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "period_type",
            "period_start",
            name="uq_bookmark_reviews_user_period",
        ),
    )


class BookmarkRating(Base):
    """One clover rating for a user's period."""

    __tablename__ = "bookmark_ratings"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    period_type = Column(String(10), nullable=False)
    period_start = Column(Date, nullable=False)
    rating = Column(Integer, nullable=False)
    created_at = Column(DateTime, default=func.now(), nullable=False)
    updated_at = Column(
        DateTime,
        default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    user = relationship("User")

    __table_args__ = (
        CheckConstraint(
            "rating >= 1 AND rating <= 5",
            name="ck_bookmark_ratings_range",
        ),
        UniqueConstraint(
            "user_id",
            "period_type",
            "period_start",
            name="uq_bookmark_ratings_user_period",
        ),
    )
