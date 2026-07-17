"""GitHub credential providers.

The billing client needs a bearer credential per request. Two providers implement
the same tiny interface:

  * `PatProvider`      — returns a static PAT. Simplest; the right choice for
                         *enterprise* billing, where GitHub Apps can't always be
                         installed.
  * `AppTokenProvider` — mints a short-lived *installation token* from the App
                         JWT (RS256), caches it, and refreshes ~1 minute before
                         expiry. This is the default for org billing.

`build_token_provider(cfg)` picks one from config: a PAT (if `GITHUB_TOKEN` is
set) takes precedence over App auth. Returns None when nothing is configured
(demo mode).
"""

from __future__ import annotations

import time
from typing import Protocol

import httpx
import jwt

from ..config import GitHubConfig


class TokenProvider(Protocol):
    async def token(self) -> str:
        """Return a bearer credential to send as `Authorization: Bearer <token>`."""
        ...

    def describe(self) -> str:
        """Human label for logs/status — never the secret itself."""
        ...


class PatProvider:
    """Static personal-access-token provider."""

    def __init__(self, pat: str) -> None:
        self._pat = pat

    async def token(self) -> str:
        return self._pat

    def describe(self) -> str:
        return "pat"


class AppTokenProvider:
    """GitHub App installation-token provider with in-memory caching.

    An App JWT (signed with the App private key, RS256, ≤10-min lifetime) is
    exchanged at `POST /app/installations/{id}/access_tokens` for an installation
    token valid ~1 hour. We cache the installation token and re-mint it shortly
    before it expires.
    """

    # Refresh this many seconds before the token's stated expiry.
    _SKEW = 60

    def __init__(
        self,
        app_id: str,
        private_key: str,
        installation_id: str,
        api_base: str,
        timeout: float = 30.0,
    ) -> None:
        self._app_id = app_id
        self._private_key = private_key
        self._installation_id = installation_id
        self._api_base = api_base.rstrip("/")
        self._timeout = timeout
        self._cached_token = ""
        self._expires_at = 0.0

    def _app_jwt(self) -> str:
        """Sign a short-lived App JWT. `iat` is backdated 60s to tolerate clock
        skew between us and GitHub (GitHub rejects future-dated `iat`)."""
        now = int(time.time())
        payload = {"iat": now - 60, "exp": now + 540, "iss": self._app_id}
        return jwt.encode(payload, self._private_key, algorithm="RS256")

    async def token(self) -> str:
        if self._cached_token and time.time() < self._expires_at - self._SKEW:
            return self._cached_token

        headers = {
            "Authorization": f"Bearer {self._app_jwt()}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        }
        url = f"{self._api_base}/app/installations/{self._installation_id}/access_tokens"
        # trust_env=False so an ambient HTTP(S)_PROXY can't hijack the call.
        async with httpx.AsyncClient(timeout=self._timeout, trust_env=False) as client:
            resp = await client.post(url, headers=headers)
        resp.raise_for_status()
        data = resp.json()
        self._cached_token = data["token"]
        # expires_at is ISO-8601 (…Z). Parse to epoch; fall back to +55 min.
        self._expires_at = _parse_iso_expiry(data.get("expires_at")) or (time.time() + 3300)
        return self._cached_token

    def describe(self) -> str:
        return f"app:{self._app_id}"


def build_token_provider(cfg: GitHubConfig, timeout: float = 30.0) -> TokenProvider | None:
    """Pick a provider from config. PAT wins over App auth. None => demo mode."""
    if cfg.has_pat:
        return PatProvider(cfg.token)
    if cfg.has_app_auth:
        return AppTokenProvider(
            app_id=cfg.app_id,
            private_key=cfg.app_private_key,
            installation_id=cfg.app_installation_id,
            api_base=cfg.api_base,
            timeout=timeout,
        )
    return None


def _parse_iso_expiry(value: str | None) -> float:
    """Parse GitHub's `2025-01-01T00:00:00Z` expiry into an epoch float. Returns
    0.0 on any parse failure (caller supplies a conservative fallback)."""
    if not value:
        return 0.0
    try:
        from datetime import datetime

        return datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp()
    except ValueError:
        return 0.0
