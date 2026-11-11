"""In-process lockouts for authentication-style endpoints.

The API runs as a single uvicorn worker, so a small thread-safe in-memory
store is enough. If the API is ever scaled to multiple workers or hosts, move
this state to Redis so every worker sees the same counters.
"""

from __future__ import annotations

import time
from collections import OrderedDict, deque
from dataclasses import dataclass, field
from threading import Lock

from fastapi import HTTPException, status


@dataclass
class _Bucket:
    failures: deque[float] = field(default_factory=deque)
    strikes: int = 0
    locked_until: float = 0.0


class FailureRateLimiter:
    """Lock an identifier out after repeated failures.

    Failures inside ``window_seconds`` count toward a lockout. Each
    consecutive lockout doubles the delay up to ``max_lockout_seconds``, and a
    successful attempt clears the bucket. The store is an LRU with a hard
    key cap so an attacker rotating IP addresses cannot grow it without bound.
    """

    def __init__(
        self,
        *,
        max_failures: int = 5,
        window_seconds: float = 15 * 60,
        base_lockout_seconds: float = 60,
        max_lockout_seconds: float = 60 * 60,
        max_keys: int = 10_000,
        message: str = "시도 횟수가 너무 많습니다. 잠시 후 다시 시도해주세요.",
    ) -> None:
        self.max_failures = max_failures
        self.window_seconds = window_seconds
        self.base_lockout_seconds = base_lockout_seconds
        self.max_lockout_seconds = max_lockout_seconds
        self.max_keys = max_keys
        self.message = message
        self._buckets: OrderedDict[str, _Bucket] = OrderedDict()
        self._lock = Lock()

    def check(self, key: str) -> None:
        """Raise 429 when ``key`` is currently locked out."""
        now = time.monotonic()
        with self._lock:
            bucket = self._touch(key, now)
            self._prune(bucket, now)
            if bucket.locked_until > now:
                retry_after = max(1, int(bucket.locked_until - now + 0.999))
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail=self.message,
                    headers={"Retry-After": str(retry_after)},
                )

    def record_failure(self, key: str) -> None:
        """Count one failed attempt and start a lockout when the limit hits."""
        now = time.monotonic()
        with self._lock:
            bucket = self._touch(key, now)
            self._prune(bucket, now)
            bucket.failures.append(now)
            if len(bucket.failures) < self.max_failures:
                return

            bucket.failures.clear()
            bucket.strikes += 1
            delay = min(
                self.base_lockout_seconds * (2 ** (bucket.strikes - 1)),
                self.max_lockout_seconds,
            )
            bucket.locked_until = now + delay

    def reset(self, key: str) -> None:
        """Forget a key after a successful attempt."""
        with self._lock:
            self._buckets.pop(key, None)

    def _touch(self, key: str, now: float) -> _Bucket:
        bucket = self._buckets.get(key)
        if bucket is None:
            bucket = _Bucket()
            self._buckets[key] = bucket
        self._buckets.move_to_end(key)
        while len(self._buckets) > self.max_keys:
            self._buckets.popitem(last=False)
        return bucket

    def _prune(self, bucket: _Bucket, now: float) -> None:
        cutoff = now - self.window_seconds
        while bucket.failures and bucket.failures[0] < cutoff:
            bucket.failures.popleft()
        if bucket.locked_until <= now:
            bucket.locked_until = 0.0
