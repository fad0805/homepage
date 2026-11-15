from dataclasses import dataclass
import ipaddress
import socket
from urllib.parse import urlparse, urlunparse

from fastapi import HTTPException, status


class UnsafeUrlError(ValueError):
    """A URL that must not be fetched because it could reach local networks."""


@dataclass(frozen=True)
class PinnedExternalUrl:
    """A URL rewritten to a validated IP, plus the original host metadata."""

    url: str
    headers: dict[str, str]
    extensions: dict[str, str]


def _unsafe(message: str) -> UnsafeUrlError:
    return UnsafeUrlError(message)


def pin_external_url(
    url: str,
    *,
    resource_label: str = "URL",
) -> PinnedExternalUrl:
    """Resolve a host once and return a URL pinned to a validated public IP.

    The caller must use the returned ``host``/SNI metadata when connecting so
    the address checked here is the address actually connected to. This closes
    the DNS-rebinding window between validation and the HTTP request.
    """
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        raise _unsafe(
            f"http 또는 https {resource_label}만 사용할 수 있습니다."
        )
    if parsed.username or parsed.password:
        raise _unsafe("인증 정보가 포함된 URL은 사용할 수 없습니다.")

    hostname = parsed.hostname
    try:
        literal_ip = ipaddress.ip_address(hostname)
    except ValueError:
        literal_ip = None
    if literal_ip is not None:
        ascii_host = str(literal_ip)
    else:
        try:
            ascii_host = hostname.encode("idna").decode("ascii")
        except UnicodeError as error:
            raise _unsafe(
                f"{resource_label}의 호스트를 확인할 수 없습니다."
            ) from error

    try:
        port = parsed.port or (443 if parsed.scheme == "https" else 80)
    except ValueError as error:
        raise _unsafe(f"{resource_label}의 포트가 올바르지 않습니다.") from error

    try:
        addresses = socket.getaddrinfo(
            ascii_host,
            port,
            type=socket.SOCK_STREAM,
        )
    except OSError as error:
        raise _unsafe(
            f"{resource_label}의 호스트를 확인할 수 없습니다."
        ) from error

    if not addresses:
        raise _unsafe(f"{resource_label}의 호스트를 확인할 수 없습니다.")

    validated: list[ipaddress.IPv4Address | ipaddress.IPv6Address] = []
    for address in addresses:
        raw_ip = address[4][0].split("%", 1)[0]
        try:
            ip = ipaddress.ip_address(raw_ip)
        except ValueError as error:
            raise _unsafe(
                f"{resource_label}의 호스트를 확인할 수 없습니다."
            ) from error
        # is_global excludes private, loopback, link-local, reserved,
        # multicast, unspecified, and shared address space.
        if not ip.is_global:
            raise _unsafe("내부 네트워크 주소는 사용할 수 없습니다.")
        validated.append(ip)

    ip = validated[0]
    ip_text = str(ip)
    if isinstance(ip, ipaddress.IPv6Address):
        connection_host = f"[{ip_text}]"
        logical_host = (
            f"[{ascii_host}]"
            if isinstance(literal_ip, ipaddress.IPv6Address)
            else ascii_host
        )
    else:
        connection_host = ip_text
        logical_host = ascii_host

    default_port = 443 if parsed.scheme == "https" else 80
    authority = (
        connection_host
        if port == default_port
        else f"{connection_host}:{port}"
    )
    host_header = (
        logical_host
        if port == default_port
        else f"{logical_host}:{port}"
    )

    pinned_url = urlunparse(
        (
            parsed.scheme,
            authority,
            parsed.path or "/",
            parsed.params,
            parsed.query,
            "",
        )
    )
    extensions = (
        {"sni_hostname": ascii_host}
        if parsed.scheme == "https"
        else {}
    )
    return PinnedExternalUrl(
        url=pinned_url,
        headers={"Host": host_header},
        extensions=extensions,
    )


def validate_external_url(url: str, *, resource_label: str = "URL") -> None:
    """Reject non-http(s) and private-network URLs."""
    try:
        pin_external_url(url, resource_label=resource_label)
    except UnsafeUrlError as error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(error),
        ) from error
