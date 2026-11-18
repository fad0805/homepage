from sqlalchemy import (
    CheckConstraint,
    Column,
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
from models.users import User  # noqa: F401 - registers the users table


class ManuscriptProject(Base):
    __tablename__ = "manuscript_projects"
    __table_args__ = (
        UniqueConstraint("linked_book_id", name="uq_manuscript_projects_linked_book"),
    )

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    title = Column(String, nullable=False)
    linked_book_id = Column(
        Integer,
        ForeignKey("books.id", ondelete="SET NULL"),
        nullable=True,
    )
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())

    book = relationship("Book", foreign_keys=[linked_book_id])
    nodes = relationship(
        "ManuscriptNode",
        back_populates="project",
        cascade="all, delete-orphan",
    )


class ManuscriptNode(Base):
    __tablename__ = "manuscript_nodes"
    __table_args__ = (
        Index("ix_manuscript_nodes_tree", "project_id", "parent_id", "position"),
        UniqueConstraint(
            "published_chapter_id", name="uq_manuscript_nodes_published_chapter"
        ),
    )

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    project_id = Column(
        Integer,
        ForeignKey("manuscript_projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    parent_id = Column(
        Integer,
        ForeignKey("manuscript_nodes.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    # "folder" | "chapter" in the first iteration. "scene" can be added later
    # as another value without a DB migration because this is a plain String.
    node_type = Column(String(16), nullable=False)
    title = Column(String, nullable=False)
    subtitle = Column(String, nullable=True)
    synopsis = Column(Text, nullable=True)
    status = Column(String(32), nullable=True)
    notes = Column(Text, nullable=True)
    body = Column(Text, nullable=True)
    char_count_with_spaces = Column(
        Integer, nullable=False, default=0, server_default="0"
    )
    char_count_plain = Column(Integer, nullable=False, default=0, server_default="0")
    target_chars = Column(Integer, nullable=True)
    position = Column(Integer, nullable=False, default=0, server_default="0")
    published_chapter_id = Column(
        Integer,
        ForeignKey("chapters.id", ondelete="SET NULL"),
        nullable=True,
    )
    published_manuscript_hash = Column(String(64), nullable=True)
    published_chapter_hash = Column(String(64), nullable=True)
    published_at = Column(DateTime, nullable=True)
    deleted_at = Column(DateTime, nullable=True, index=True)
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())

    project = relationship("ManuscriptProject", back_populates="nodes")
    parent = relationship(
        "ManuscriptNode", remote_side=[id], back_populates="children"
    )
    children = relationship(
        "ManuscriptNode",
        back_populates="parent",
        cascade="all, delete-orphan",
        order_by="ManuscriptNode.position, ManuscriptNode.id",
    )


class SerialNode(Base):
    __tablename__ = "serial_nodes"
    __table_args__ = (
        Index("ix_serial_nodes_tree", "book_id", "parent_id", "position"),
        UniqueConstraint("book_id", "chapter_id", name="uq_serial_nodes_book_chapter"),
        CheckConstraint(
            "((node_type = 'folder' AND chapter_id IS NULL AND label IS NOT NULL) "
            "OR (node_type = 'post' AND chapter_id IS NOT NULL))",
            name="ck_serial_nodes_type",
        ),
    )

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    book_id = Column(
        Integer,
        ForeignKey("books.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    parent_id = Column(
        Integer,
        ForeignKey("serial_nodes.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    node_type = Column(String(16), nullable=False)
    chapter_id = Column(
        Integer,
        ForeignKey("chapters.id", ondelete="CASCADE"),
        nullable=True,
    )
    label = Column(String, nullable=True)
    position = Column(Integer, nullable=False, default=0, server_default="0")
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())

    parent = relationship("SerialNode", remote_side=[id], back_populates="children")
    children = relationship(
        "SerialNode",
        back_populates="parent",
        cascade="all, delete-orphan",
        order_by="SerialNode.position, SerialNode.id",
    )
