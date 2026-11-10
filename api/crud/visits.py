from datetime import date, datetime, timedelta, timezone
from urllib.parse import parse_qs, urlparse
from zoneinfo import ZoneInfo

from sqlalchemy import func
from sqlalchemy.orm import Session

from models.visits import SiteVisit


SITE_TIMEZONE = ZoneInfo("Asia/Seoul")


def site_today() -> date:
    return datetime.now(timezone.utc).astimezone(SITE_TIMEZONE).date()


def normalize_source(referrer: str | None, request_host: str | None) -> str:
    """Reduce a referrer URL to a compact, displayable traffic source."""
    if not referrer:
        return "direct"

    try:
        host = urlparse(referrer).hostname
    except ValueError:
        return "direct"

    if not host:
        return "direct"

    host = host.lower()
    if host.startswith("www."):
        host = host[4:]

    if request_host:
        site_host = request_host.split(":")[0].lower()
        if host == site_host or host.endswith(f".{site_host}"):
            return "internal"

    return host[:255]


def _search_query_parameter(host: str) -> str | None:
    """Return the query parameter used by a known search engine."""
    if host == "google.com" or host.startswith("google.") or ".google." in host:
        return "q"
    if host == "naver.com" or host.endswith(".naver.com"):
        return "query"
    if host == "daum.net" or host.endswith(".daum.net"):
        return "q"
    if host == "bing.com" or host.endswith(".bing.com"):
        return "q"
    if host == "duckduckgo.com" or host.endswith(".duckduckgo.com"):
        return "q"
    if host == "yahoo.com" or host.endswith(".yahoo.com"):
        return "p"
    if host == "zum.com" or host.endswith(".zum.com"):
        return "q"
    if host == "nate.com" or host.endswith(".nate.com"):
        return "q"
    if host == "baidu.com" or host.endswith(".baidu.com"):
        return "wd"
    if host.startswith("yandex.") or ".yandex." in host:
        return "text"
    return None


def extract_search_query(referrer: str | None) -> str | None:
    """Extract a normalized search term from a search engine referrer."""
    if not referrer:
        return None

    try:
        parsed = urlparse(referrer)
        host = parsed.hostname
    except ValueError:
        return None

    if not host:
        return None

    host = host.lower()
    if host.startswith("www."):
        host = host[4:]

    parameter = _search_query_parameter(host)
    if not parameter:
        return None

    values = parse_qs(parsed.query, keep_blank_values=False).get(parameter)
    if not values:
        return None

    term = " ".join(values[0].split())
    return term[:255] if term else None


def record_visit(
    db: Session,
    *,
    ip_hash: str,
    source: str,
    referrer: str | None,
    path: str | None,
) -> None:
    visit = SiteVisit(
        ip_hash=ip_hash,
        source=source,
        referrer=referrer[:1024] if referrer else None,
        path=path[:512] if path else None,
        visited_on=site_today(),
    )
    db.add(visit)
    db.commit()


def get_visit_stats(db: Session) -> dict:
    today = site_today()
    week_start = today - timedelta(days=6)

    def _count_distinct(*filters):
        query = db.query(
            func.count(func.distinct(SiteVisit.ip_hash))
        )
        if filters:
            query = query.filter(*filters)
        return int(query.scalar() or 0)

    def _count_rows(*filters):
        query = db.query(func.count(SiteVisit.id))
        if filters:
            query = query.filter(*filters)
        return int(query.scalar() or 0)

    today_visitors = _count_distinct(SiteVisit.visited_on == today)
    today_visits = _count_rows(SiteVisit.visited_on == today)
    week_visitors = _count_distinct(SiteVisit.visited_on >= week_start)
    week_visits = _count_rows(SiteVisit.visited_on >= week_start)
    total_visitors = _count_distinct()
    total_visits = _count_rows()

    daily_rows = (
        db.query(
            SiteVisit.visited_on,
            func.count(func.distinct(SiteVisit.ip_hash)),
            func.count(SiteVisit.id),
        )
        .filter(SiteVisit.visited_on >= week_start)
        .group_by(SiteVisit.visited_on)
        .all()
    )
    daily_map = {
        row[0]: {"visitors": int(row[1] or 0), "visits": int(row[2] or 0)}
        for row in daily_rows
    }
    daily = []
    for offset in range(7):
        day = week_start + timedelta(days=offset)
        values = daily_map.get(day, {"visitors": 0, "visits": 0})
        daily.append(
            {
                "date": day.isoformat(),
                "visitors": values["visitors"],
                "visits": values["visits"],
            }
        )

    source_rows = (
        db.query(
            SiteVisit.source,
            func.count(SiteVisit.id),
            func.count(func.distinct(SiteVisit.ip_hash)),
        )
        .filter(SiteVisit.visited_on >= week_start)
        .group_by(SiteVisit.source)
        .order_by(func.count(SiteVisit.id).desc())
        .limit(5)
        .all()
    )
    sources = [
        {
            "source": row[0],
            "visits": int(row[1] or 0),
            "visitors": int(row[2] or 0),
        }
        for row in source_rows
    ]

    search_rows = (
        db.query(SiteVisit.referrer, SiteVisit.ip_hash)
        .filter(
            SiteVisit.visited_on >= week_start,
            SiteVisit.referrer.isnot(None),
        )
        .all()
    )
    search_map: dict[str, dict] = {}
    for referrer, ip_hash in search_rows:
        term = extract_search_query(referrer)
        if not term:
            continue
        entry = search_map.setdefault(term, {"visits": 0, "visitors": set()})
        entry["visits"] += 1
        entry["visitors"].add(ip_hash)

    searches = [
        {
            "query": term,
            "visits": entry["visits"],
            "visitors": len(entry["visitors"]),
        }
        for term, entry in sorted(
            search_map.items(),
            key=lambda item: (-item[1]["visits"], item[0]),
        )[:5]
    ]

    return {
        "today": {
            "date": today.isoformat(),
            "visitors": today_visitors,
            "visits": today_visits,
        },
        "week": {
            "from": week_start.isoformat(),
            "to": today.isoformat(),
            "visitors": week_visitors,
            "visits": week_visits,
        },
        "total": {
            "visitors": total_visitors,
            "visits": total_visits,
        },
        "daily": daily,
        "sources": sources,
        "searches": searches,
    }
