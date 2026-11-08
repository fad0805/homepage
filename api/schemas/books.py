from pydantic import BaseModel, Field


class BookBase(BaseModel):
    title: str
    description: str | None = None
    order: int = 0
    visible: bool = True


class BookCreate(BookBase):
    """Payload for creating a book."""


class BookUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
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
    order: int = 0
    visible: bool = True


class ChapterCreate(ChapterBase):
    """Payload for creating a chapter inside a book."""


class ChapterUpdate(BaseModel):
    book_id: int | None = None
    title: str | None = None
    subtitle: str | None = None
    body: str | None = None
    order: int | None = None
    visible: bool | None = None


class ChapterReorderItem(BaseModel):
    id: int
    order: int
    book_id: int | None = None


class ChapterReorderRequest(BaseModel):
    items: list[ChapterReorderItem] = Field(default_factory=list)
