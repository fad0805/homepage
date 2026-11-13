from html.parser import HTMLParser
from urllib.parse import urljoin, urlparse

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.concurrency import run_in_threadpool

from core.url_safety import validate_external_url

from .utils import require_admin

router = APIRouter()

MAX_PAGE_BYTES = 1024 * 1024
FETCH_TIMEOUT_SECONDS = 12.0


class _PageMetadataParser(HTMLParser):
    """Collect title and preview metadata from a page's HTML."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self._in_title = False
        self._title_parts: list[str] = []
        self._meta: dict[str, str] = {}
        self.image_src: str | None = None

    def handle_starttag(self, tag: str, attrs) -> None:
        values = {
            key.lower(): (value or "").strip()
            for key, value in attrs
        }

        if tag == "title":
            self._in_title = True
            return

        if tag == "meta":
            key = (
                values.get("property")
                or values.get("name")
                or values.get("itemprop")
                or ""
            ).lower()
            content = values.get("content", "")
            if key and content and key not in self._meta:
                self._meta[key] = content
            return

        if tag == "link":
            rel = values.get("rel", "").lower().split()
            href = values.get("href", "")
            if href and "image_src" in rel and not self.image_src:
                self.image_src = href

    def handle_endtag(self, tag: str) -> None:
        if tag == "title":
            self._in_title = False

    def handle_data(self, data: str) -> None:
        if self._in_title:
            self._title_parts.append(data)

    @property
    def title(self) -> str:
        return " ".join("".join(self._title_parts).split())

    def get(self, *keys: str) -> str | None:
        for key in keys:
            value = self._meta.get(key)
            if value:
                return value
        return None


def _clean_text(value: str | None, limit: int) -> str | None:
    if not value:
        return None
    text = " ".join(value.split())
    return text[:limit] if text else None


def _host_label(url: str) -> str:
    try:
        host = urlparse(url).hostname or url
    except ValueError:
        return url
    return host[4:] if host.startswith("www.") else host


async def _fetch_page(url: str) -> tuple[str, str]:
    """Fetch an HTML page, validating every redirect target."""
    current_url = url

    try:
        async with httpx.AsyncClient(
            follow_redirects=False,
            timeout=httpx.Timeout(FETCH_TIMEOUT_SECONDS),
            headers={
                "User-Agent": (
                    "Mozilla/5.0 (compatible; homepage-link-preview/1.0)"
                ),
                "Accept": "text/html,application/xhtml+xml",
            },
        ) as client:
            for _ in range(6):
                await run_in_threadpool(
                    validate_external_url,
                    current_url,
                    resource_label="페이지 URL",
                )

                async with client.stream("GET", current_url) as response:
                    location = response.headers.get("location")
                    if (
                        status.HTTP_300_MULTIPLE_CHOICES
                        <= response.status_code
                        < status.HTTP_400_BAD_REQUEST
                        and location
                    ):
                        current_url = urljoin(str(response.url), location)
                        continue

                    if response.status_code != status.HTTP_200_OK:
                        raise HTTPException(
                            status_code=status.HTTP_400_BAD_REQUEST,
                            detail="페이지 정보를 불러오지 못했습니다.",
                        )

                    content_type = (
                        response.headers.get("content-type", "")
                        .split(";")[0]
                        .strip()
                        .lower()
                    )
                    if content_type and not (
                        content_type.startswith("text/html")
                        or content_type.startswith("application/xhtml")
                    ):
                        raise HTTPException(
                            status_code=(
                                status.HTTP_415_UNSUPPORTED_MEDIA_TYPE
                            ),
                            detail=(
                                "HTML 페이지 URL만 미리보기로 사용할 수 "
                                "있습니다."
                            ),
                        )

                    chunks: list[bytes] = []
                    size = 0
                    async for chunk in response.aiter_bytes():
                        if not chunk:
                            continue
                        remaining = MAX_PAGE_BYTES - size
                        if remaining <= 0:
                            break
                        chunks.append(chunk[:remaining])
                        size += min(len(chunk), remaining)
                        if size >= MAX_PAGE_BYTES:
                            break

                    html = b"".join(chunks).decode(
                        response.encoding or "utf-8",
                        errors="replace",
                    )
                    return str(response.url), html
    except HTTPException:
        raise
    except httpx.HTTPError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="페이지 정보를 불러오지 못했습니다.",
        )

    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="페이지 이동이 너무 많습니다.",
    )


@router.get("/preview")
async def get_page_preview(
    url: str,
    _=Depends(require_admin),
):
    """Fetch a page and return OpenGraph-style preview metadata."""
    final_url, html = await _fetch_page(url)

    parser = _PageMetadataParser()
    try:
        parser.feed(html)
        parser.close()
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="페이지 정보를 해석하지 못했습니다.",
        )

    title = _clean_text(
        parser.get("og:title", "twitter:title") or parser.title,
        300,
    )
    description = _clean_text(
        parser.get(
            "og:description",
            "twitter:description",
            "description",
        ),
        500,
    )
    image = parser.get(
        "og:image",
        "og:image:url",
        "twitter:image",
        "twitter:image:src",
    ) or parser.image_src
    site_name = _clean_text(
        parser.get("og:site_name", "application-name")
        or _host_label(final_url),
        120,
    )

    if image:
        image = urljoin(final_url, image)
        if urlparse(image).scheme not in ("http", "https"):
            image = None

    return {
        "url": final_url,
        "title": title or _host_label(final_url),
        "description": description,
        "image": image,
        "site_name": site_name,
    }
