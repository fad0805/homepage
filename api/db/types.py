"""SQLAlchemy types that keep storage details out of the database."""

from sqlalchemy import String
from sqlalchemy.types import TypeDecorator

from core.image_urls import public_url, storage_reference


class ImageUrl(TypeDecorator):
    """Store only an image's object path and expose its public URL.

    The API and templates keep working with ordinary URLs. When a value is
    written, URLs under the configured object-storage base are reduced to the
    key; when it is read, the current public base is joined back on.
    """

    impl = String
    cache_ok = True

    def process_bind_param(self, value, dialect):
        return storage_reference(value)

    def process_result_value(self, value, dialect):
        return public_url(value)
