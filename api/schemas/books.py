from pydantic import BaseModel, Field


class BookshelfBase(BaseModel):
    title: str
    description: str | None = None
    order: int = 0
    visible: bool = True


class BookshelfCreate(BookshelfBase):
    """Payload for creating a bookshelf."""


class BookshelfUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    order: int | None = None
    visible: bool | None = None


class BookshelfReorderItem(BaseModel):
    id: int
    order: int


class BookshelfReorderRequest(BaseModel):
    items: list[BookshelfReorderItem] = Field(default_factory=list)


class BookBase(BaseModel):
    bookshelf_id: int
    title: str
    subtitle: str | None = None
    body: str | None = None
    order: int = 0
    visible: bool = True


class BookCreate(BookBase):
    """Payload for creating a book inside a bookshelf."""


class BookUpdate(BaseModel):
    bookshelf_id: int | None = None
    title: str | None = None
    subtitle: str | None = None
    body: str | None = None
    order: int | None = None
    visible: bool | None = None


class BookReorderItem(BaseModel):
    id: int
    order: int
    bookshelf_id: int | None = None


class BookReorderRequest(BaseModel):
    items: list[BookReorderItem] = Field(default_factory=list)
