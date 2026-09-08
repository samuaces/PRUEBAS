"""Polite HTTP. Standard library only, no keys, read-only."""
from __future__ import annotations

import json
import time
import urllib.error
import urllib.parse
import urllib.request

UA = "veta/1.0 (open-source bounty scanner; contact via your GitHub profile)"


class FetchError(RuntimeError):
    pass


class Http:
    """One shared client so rate limiting actually applies across sources."""

    def __init__(self, min_interval_s: float = 1.0, timeout: float = 20.0,
                 retries: int = 2, token: str | None = None):
        self.min_interval = min_interval_s
        self.timeout = timeout
        self.retries = retries
        self.token = token
        self._last = 0.0
        self.calls = 0

    def _wait(self) -> None:
        gap = time.time() - self._last
        if gap < self.min_interval:
            time.sleep(self.min_interval - gap)
        self._last = time.time()

    def get_json(self, url: str, headers: dict | None = None) -> object:
        h = {"User-Agent": UA, "Accept": "application/json"}
        if self.token and "api.github.com" in url:
            h["Authorization"] = f"Bearer {self.token}"
        h.update(headers or {})
        last: Exception | None = None
        for attempt in range(self.retries + 1):
            self._wait()
            self.calls += 1
            try:
                req = urllib.request.Request(url, headers=h)
                with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                    return json.load(resp)
            except urllib.error.HTTPError as exc:
                # 403 from GitHub is nearly always the rate limit, and waiting
                # is the correct response rather than hammering it.
                if exc.code in (403, 429) and attempt < self.retries:
                    time.sleep(5.0 * (attempt + 1))
                    last = exc
                    continue
                raise FetchError(f"{url} -> HTTP {exc.code} {exc.reason}") from exc
            except Exception as exc:                       # noqa: BLE001
                last = exc
                if attempt < self.retries:
                    time.sleep(1.5 * (attempt + 1))
                    continue
                raise FetchError(f"{url} -> {type(exc).__name__}: {exc}") from exc
        raise FetchError(f"{url} -> {last}")


def qs(**params) -> str:
    clean = {k: v for k, v in params.items() if v not in (None, "")}
    return urllib.parse.urlencode(clean, quote_via=urllib.parse.quote)
