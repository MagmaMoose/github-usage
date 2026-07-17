"""Thin async client for the GitHub billing / usage endpoints we render.

Only the endpoints that map cleanly onto one of the SPA's report types are here:

  | SPA report            | Endpoint                                                        | Scope      |
  |-----------------------|-----------------------------------------------------------------|------------|
  | Metered Usage         | GET /organizations/{org}/settings/billing/usage                 | org        |
  | Metered Usage         | GET /enterprises/{ent}/settings/billing/usage                   | enterprise |
  | Copilot Seat Activity | GET /orgs/{org}/copilot/billing/seats                           | org        |
  | GHAS Active Committers| GET /orgs/{org}/settings/billing/advanced-security             | org        |
  | Enterprise Members    | GET /enterprises/{ent}/consumed-licenses                        | enterprise |

Token Usage, Premium Requests and Dormant Users have no stable public API and
stay upload-only in the SPA.

Every call attaches a bearer credential from a `TokenProvider`. A 403/404 (a
scope the token can't see, or a plan without that product) raises `GitHubError`
with the status so the caller can skip that one report without failing the rest.
"""

from __future__ import annotations

from typing import Any

import httpx

from .auth import TokenProvider

_ACCEPT = "application/vnd.github+json"
_API_VERSION = "2022-11-28"


class GitHubError(RuntimeError):
    def __init__(self, status: int, message: str) -> None:
        super().__init__(f"HTTP {status}: {message}")
        self.status = status


class GitHubClient:
    def __init__(
        self, token_provider: TokenProvider, api_base: str, timeout: float = 30.0
    ) -> None:
        self._tokens = token_provider
        self._base = api_base.rstrip("/")
        self._timeout = timeout

    async def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {await self._tokens.token()}",
            "Accept": _ACCEPT,
            "X-GitHub-Api-Version": _API_VERSION,
        }

    async def _get(self, path: str, params: dict[str, Any] | None = None) -> Any:
        headers = await self._headers()
        async with httpx.AsyncClient(timeout=self._timeout, trust_env=False) as client:
            resp = await client.get(f"{self._base}{path}", headers=headers, params=params)
        if resp.status_code >= 400:
            raise GitHubError(resp.status_code, _err_message(resp))
        return resp.json()

    async def _get_paginated(
        self, path: str, *, items_key: str | None, params: dict[str, Any] | None = None
    ) -> list[Any]:
        """Follow RFC-5988 `Link: rel="next"` pagination.

        `items_key` is the field holding the array on each page (e.g. "seats",
        "users"); pass None when the payload *is* the array.
        """
        headers = await self._headers()
        query = {"per_page": 100, **(params or {})}
        out: list[Any] = []
        url: str | None = f"{self._base}{path}"
        async with httpx.AsyncClient(timeout=self._timeout, trust_env=False) as client:
            first = True
            while url:
                resp = await client.get(
                    url, headers=headers, params=query if first else None
                )
                first = False
                if resp.status_code >= 400:
                    raise GitHubError(resp.status_code, _err_message(resp))
                body = resp.json()
                page = body if items_key is None else body.get(items_key, [])
                out.extend(page)
                url = resp.links.get("next", {}).get("url")
        return out

    # --- Metered Usage (enhanced billing platform) -----------------------
    async def org_usage(self, org: str, params: dict[str, Any] | None = None) -> list[dict]:
        body = await self._get(f"/organizations/{org}/settings/billing/usage", params)
        return body.get("usageItems", []) if isinstance(body, dict) else []

    async def enterprise_usage(
        self, enterprise: str, params: dict[str, Any] | None = None
    ) -> list[dict]:
        body = await self._get(
            f"/enterprises/{enterprise}/settings/billing/usage", params
        )
        return body.get("usageItems", []) if isinstance(body, dict) else []

    # --- Copilot seats ---------------------------------------------------
    async def org_copilot_seats(self, org: str) -> list[dict]:
        return await self._get_paginated(
            f"/orgs/{org}/copilot/billing/seats", items_key="seats"
        )

    # --- GHAS active committers -----------------------------------------
    async def org_advanced_security(self, org: str) -> dict:
        # Not paginated the same way; the payload embeds a `repositories` array.
        return await self._get(f"/orgs/{org}/settings/billing/advanced-security")

    # --- Enterprise consumed licenses -----------------------------------
    async def enterprise_consumed_licenses(self, enterprise: str) -> list[dict]:
        return await self._get_paginated(
            f"/enterprises/{enterprise}/consumed-licenses", items_key="users"
        )

    def describe_auth(self) -> str:
        return self._tokens.describe()


def _err_message(resp: httpx.Response) -> str:
    try:
        body = resp.json()
    except ValueError:
        return resp.text[:200]
    # A valid-JSON-but-non-object body (bare string/array) has no .get.
    if isinstance(body, dict):
        return str(body.get("message", resp.text[:200]))
    return resp.text[:200]
