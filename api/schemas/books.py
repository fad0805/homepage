from datetime import datetime

from pydantic import BaseModel, Field


class BookCategoryBase(BaseModel):
    name: str
    order: int | None = None


class BookCategoryCreate(BookCategoryBase):
    """Payload for creating a book category."""


class BookCategoryUpdate(BaseModel):
    name: str | None = None
    order: int | None = None


class BookCategoryReorderItem(BaseModel):
    id: int
    order: int


class BookCategoryReorderRequest(BaseModel):
    items: list[BookCategoryReorderItem] = Field(default_factory=list)


class BookBase(BaseModel):
    title: str
    description: str | None = None
    tags: list[str] = Field(default_factory=list)
    category_id: int | None = None
    order: int = 0
    visible: bool = True


class BookCreate(BookBase):
    """Payload for creating a book."""


class BookUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    tags: list[str] | None = None
    category_id: int | None = None
    order: int | None = None
    visible: bool | None = None


class BookReorderItem(BaseModel):
    id: int
    order: int


class BookReorderRequest(BaseModel):
    items: list[BookReorderItem] = Field(default_factory=list)


class ChapterBase(BaseModel):
    book_id: int
    title: str
    subtitle: str | None = None
    body: str | None = None
    tags: list[str] = Field(default_factory=list)
    order: int = 0
    visible: bool = True
    published_at: datetime | None = None


class ChapterCreate(ChapterBase):
    """Payload for creating a chapter inside a book."""


class ChapterUpdate(BaseModel):
    book_id: int | None = None
    title: str | None = None
    subtitle: str | None = None
    body: str | None = None
    tags: list[str] | None = None
    order: int | None = None
    visible: bool | None = None
    published_at: datetime | None = None


class ChapterReorderItem(BaseModel):
    id: int
    order: int
    book_id: int | None = None


class ChapterReorderRequest(BaseModel):
    items: list[ChapterReorderItem] = Field(default_factory=list)
