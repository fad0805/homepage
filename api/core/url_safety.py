import ipaddress
import socket
from urllib.parse import urlparse

from fastapi import HTTPException, status


def validate_external_url(url: str, *, resource_label: str = "URL") -> None:
    """Reject non-http(s) and private-network URLs."""
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"http 또는 https {resource_label}만 사용할 수 있습니다.",
        )

    try:
        addresses = socket.getaddrinfo(parsed.hostname, None)
    except OSError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{resource_label}의 호스트를 확인할 수 없습니다.",
        )

    for address in addresses:
        ip = ipaddress.ip_address(address[4][0])
        if (
            ip.is_private
            or ip.is_loopback
            or ip.is_link_local
            or ip.is_reserved
            or ip.is_multicast
        ):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="내부 네트워크 주소는 사용할 수 없습니다.",
            )
